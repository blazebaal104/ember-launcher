//! Modrinth modpacks (.mrpack, https://support.modrinth.com/en/articles/8802351).
//! A pack is a zip with `modrinth.index.json` (files to download + loader versions) and
//! `overrides/` + `client-overrides/` folders copied straight into the instance.
use crate::download::{download_all, download_one, DownloadJob, Progress};
use crate::instance::{CreateInstance, InstanceConfig, InstanceManager, InstanceSource, Loader};
use crate::{Error, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

/// Hosts the Modrinth format allows pack files to come from.
const ALLOWED_HOSTS: &[&str] = &["cdn.modrinth.com", "github.com", "raw.githubusercontent.com", "gitlab.com"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackIndex {
    pub name: String,
    #[serde(default)]
    pub version_id: String,
    #[serde(default)]
    pub summary: Option<String>,
    pub files: Vec<PackFile>,
    pub dependencies: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackFile {
    pub path: String,
    pub hashes: HashMap<String, String>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    pub downloads: Vec<String>,
    #[serde(default)]
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackRequest {
    pub url: String,
    pub sha1: Option<String>,
    pub name: Option<String>,
    pub icon: Option<String>,
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub game_profile: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackResult {
    pub instance: InstanceConfig,
    pub files: usize,
    pub overrides: usize,
    pub skipped: Vec<String>,
}

/// Relative path that stays inside its base folder (no `..`, no absolute paths).
pub fn safe_relative(path: &str) -> Option<PathBuf> {
    let p = Path::new(path);
    if p.is_absolute() || path.contains('\\') {
        return None;
    }
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            _ => return None,
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

fn host_allowed(url: &str) -> bool {
    url.strip_prefix("https://")
        .and_then(|rest| rest.split('/').next())
        .map(|host| ALLOWED_HOSTS.contains(&host))
        .unwrap_or(false)
}

pub fn read_index(pack: &Path) -> Result<PackIndex> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(pack)?).map_err(|e| Error::Other(format!("not a modpack: {e}")))?;
    let mut s = String::new();
    zip.by_name("modrinth.index.json").map_err(|_| Error::Other("modrinth.index.json missing: not a Modrinth modpack".into()))?.read_to_string(&mut s)?;
    Ok(serde_json::from_str(&s)?)
}

pub fn loader_of(index: &PackIndex) -> Result<(Loader, Option<String>)> {
    let d = &index.dependencies;
    if let Some(v) = d.get("fabric-loader") {
        Ok((Loader::Fabric, Some(v.clone())))
    } else if let Some(v) = d.get("quilt-loader") {
        Ok((Loader::Quilt, Some(v.clone())))
    } else if let Some(v) = d.get("neoforge") {
        Ok((Loader::NeoForge, Some(v.clone())))
    } else if d.contains_key("forge") {
        Err(Error::Other("this pack uses Forge, which Ember doesn't support (NeoForge, Fabric and Quilt are supported)".into()))
    } else {
        Ok((Loader::Vanilla, None))
    }
}

/// Extract `overrides/` then `client-overrides/` (later wins) into the instance.
fn extract_overrides(pack: &Path, dest: &Path) -> Result<usize> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(pack)?).map_err(|e| Error::Other(e.to_string()))?;
    let mut n = 0;
    for prefix in ["overrides/", "client-overrides/"] {
        for i in 0..zip.len() {
            let mut f = zip.by_index(i).map_err(|e| Error::Other(e.to_string()))?;
            let Some(name) = f.enclosed_name() else { continue };
            let name = name.to_string_lossy().replace('\\', "/");
            let Some(rel) = name.strip_prefix(prefix) else { continue };
            let Some(rel) = safe_relative(rel) else { continue };
            let out = dest.join(rel);
            if f.is_dir() {
                std::fs::create_dir_all(&out)?;
                continue;
            }
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut w = std::fs::File::create(&out)?;
            std::io::copy(&mut f, &mut w)?;
            n += 1;
        }
    }
    Ok(n)
}

pub async fn install(client: &reqwest::Client, manager: &InstanceManager, req: PackRequest, progress: Option<Progress>) -> Result<PackResult> {
    if !host_allowed(&req.url) {
        return Err(Error::Other("modpacks can only be downloaded from Modrinth".into()));
    }
    let cache = manager.paths().shared().join("cache").join("packs");
    tokio::fs::create_dir_all(&cache).await?;
    let pack_path = cache.join(format!("{}.mrpack", req.sha1.clone().unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string())));
    download_one(client, &DownloadJob { url: req.url.clone(), dest: pack_path.clone(), sha1: req.sha1.clone(), size: None }).await?;

    let pp = pack_path.clone();
    let index = tokio::task::spawn_blocking(move || read_index(&pp)).await.map_err(|e| Error::Other(e.to_string()))??;
    let game_version = index.dependencies.get("minecraft").cloned().ok_or_else(|| Error::Other("pack has no Minecraft version".into()))?;
    let (loader, loader_version) = loader_of(&index)?;

    let (instance, _) = manager
        .create(CreateInstance {
            name: req.name.clone().unwrap_or_else(|| index.name.clone()),
            game_version,
            loader,
            // Packs ship their own tuned mod list; adding ours could conflict.
            performance_bundle: false,
            overlay: true,
            memory_mb: Some(6144),
            loader_version,
            game_profile: req.game_profile.clone(),
            icon: req.icon.clone(),
            source: Some(InstanceSource { kind: "modrinth-pack".into(), project_id: req.project_id.clone(), version_id: req.version_id.clone(), title: Some(index.name.clone()) }),
        })
        .await?;
    let dir = manager.paths().instance(&instance.id);

    let mut skipped = Vec::new();
    let mut jobs = Vec::new();
    for f in &index.files {
        if f.env.as_ref().and_then(|e| e.get("client")).map(|c| c == "unsupported").unwrap_or(false) {
            continue; // server-only file
        }
        let Some(rel) = safe_relative(&f.path) else {
            skipped.push(format!("{} (unsafe path)", f.path));
            continue;
        };
        let Some(url) = f.downloads.iter().find(|u| host_allowed(u)) else {
            skipped.push(format!("{} (download host not allowed)", f.path));
            continue;
        };
        jobs.push(DownloadJob { url: url.clone(), dest: dir.join(rel), sha1: f.hashes.get("sha1").cloned(), size: f.file_size });
    }
    let files = jobs.len();
    download_all(client, jobs, 12, progress).await?;

    let (pp, d) = (pack_path.clone(), dir.clone());
    let overrides = tokio::task::spawn_blocking(move || extract_overrides(&pp, &d)).await.map_err(|e| Error::Other(e.to_string()))??;
    Ok(PackResult { instance, files, overrides, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_safety() {
        assert_eq!(safe_relative("mods/sodium.jar"), Some(PathBuf::from("mods/sodium.jar")));
        assert!(safe_relative("../evil.jar").is_none());
        assert!(safe_relative("/etc/passwd").is_none());
        assert!(safe_relative("mods/../../x").is_none());
        assert!(safe_relative("C:\\Windows\\x").is_none());
    }

    #[test]
    fn hosts() {
        assert!(host_allowed("https://cdn.modrinth.com/data/x/y.jar"));
        assert!(!host_allowed("https://evil.example/cdn.modrinth.com/x.jar"));
        assert!(!host_allowed("http://cdn.modrinth.com/x.jar"));
    }

    #[test]
    fn reads_index_and_extracts_overrides() {
        let tmp = tempfile::tempdir().unwrap();
        let pack = tmp.path().join("p.mrpack");
        let mut w = zip::ZipWriter::new(std::fs::File::create(&pack).unwrap());
        let opts: zip::write::SimpleFileOptions = Default::default();
        w.start_file("modrinth.index.json", opts).unwrap();
        std::io::Write::write_all(&mut w, br#"{"formatVersion":1,"game":"minecraft","name":"Test Pack","versionId":"1.0","files":[],"dependencies":{"minecraft":"26.3","fabric-loader":"0.20.1"}}"#).unwrap();
        w.start_file("overrides/config/a.json", opts).unwrap();
        std::io::Write::write_all(&mut w, b"{}").unwrap();
        w.start_file("client-overrides/options.txt", opts).unwrap();
        std::io::Write::write_all(&mut w, b"fov:0.5").unwrap();
        w.finish().unwrap();

        let idx = read_index(&pack).unwrap();
        assert_eq!(idx.name, "Test Pack");
        assert!(matches!(loader_of(&idx).unwrap(), (Loader::Fabric, Some(v)) if v == "0.20.1"));
        let dest = tmp.path().join("inst");
        assert_eq!(extract_overrides(&pack, &dest).unwrap(), 2);
        assert!(dest.join("config/a.json").exists());
        assert!(dest.join("options.txt").exists());
    }
}
