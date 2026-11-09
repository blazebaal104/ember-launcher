//! What's inside an instance: mods/packs (with metadata and icons), worlds, screenshots.
//! Disabling renames `x.jar` → `x.jar.disabled`, which every loader ignores.
use crate::paths::LauncherPaths;
use crate::{Error, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::io::Read;
use std::path::{Path, PathBuf};

pub const CONTENT_DIRS: &[&str] = &["mods", "resourcepacks", "shaderpacks", "datapacks"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentFile {
    pub file_name: String,
    pub enabled: bool,
    pub size: u64,
    pub sha1: String,
    pub modified: i64,
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub authors: Vec<String>,
    /// `data:image/png;base64,...` when the jar/zip carries an icon.
    pub icon: Option<String>,
    /// Installed by Ember's performance stack (see .ember/bundle.lock.json).
    pub from_bundle: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct World {
    pub folder: String,
    pub modified: i64,
    pub size_mb: f64,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Screenshot {
    pub file_name: String,
    pub path: String,
    pub modified: i64,
}

fn check_dir(dir: &str) -> Result<()> {
    if CONTENT_DIRS.contains(&dir) { Ok(()) } else { Err(Error::Other(format!("invalid folder {dir}"))) }
}

/// Only plain file names inside the folder; never paths.
pub fn check_file_name(name: &str) -> Result<()> {
    let bad = name.is_empty() || name.contains(['/', '\\']) || name.contains("..") || name.starts_with('.');
    if bad { Err(Error::Other(format!("invalid file name {name}"))) } else { Ok(()) }
}

fn mtime(meta: &std::fs::Metadata) -> i64 {
    meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0)
}

pub async fn list(paths: &LauncherPaths, instance: &str, dir: &str) -> Result<Vec<ContentFile>> {
    check_dir(dir)?;
    let folder = paths.instance(instance).join(dir);
    let bundle: std::collections::HashSet<String> = tokio::fs::read(paths.instance(instance).join(".ember/bundle.lock.json"))
        .await
        .ok()
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .and_then(|v| v["files"].as_array().cloned())
        .map(|files| files.iter().filter_map(|f| f["fileName"].as_str().map(String::from)).collect())
        .unwrap_or_default();

    let folder2 = folder.clone();
    let items = tokio::task::spawn_blocking(move || -> Vec<ContentFile> {
        let Ok(rd) = std::fs::read_dir(&folder2) else { return vec![] };
        let mut out = Vec::new();
        for entry in rd.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()).map(String::from) else { continue };
            let Ok(meta) = entry.metadata() else { continue };
            let enabled = !name.ends_with(".disabled");
            let base = name.trim_end_matches(".disabled");
            let is_archive = base.ends_with(".jar") || base.ends_with(".zip");
            if !(is_archive || meta.is_dir()) {
                continue;
            }
            let (sha1, info) = if meta.is_file() { inspect_archive(&path) } else { (String::new(), ArchiveInfo::default()) };
            out.push(ContentFile {
                from_bundle: bundle.contains(base),
                file_name: name,
                enabled,
                size: meta.len(),
                sha1,
                modified: mtime(&meta),
                name: info.name,
                version: info.version,
                description: info.description,
                authors: info.authors,
                icon: info.icon,
            });
        }
        out.sort_by_key(|c| c.name.clone().unwrap_or_else(|| c.file_name.clone()).to_lowercase());
        out
    })
    .await
    .map_err(|e| Error::Other(e.to_string()))?;
    Ok(items)
}

#[derive(Default)]
struct ArchiveInfo {
    name: Option<String>,
    version: Option<String>,
    description: Option<String>,
    authors: Vec<String>,
    icon: Option<String>,
}

fn inspect_archive(path: &Path) -> (String, ArchiveInfo) {
    let Ok(bytes) = std::fs::read(path) else { return (String::new(), ArchiveInfo::default()) };
    let sha1 = hex::encode(Sha1::digest(&bytes));
    let mut info = ArchiveInfo::default();
    let Ok(mut zip) = zip::ZipArchive::new(std::io::Cursor::new(&bytes)) else { return (sha1, info) };

    let read = |zip: &mut zip::ZipArchive<std::io::Cursor<&Vec<u8>>>, name: &str| -> Option<Vec<u8>> {
        let mut f = zip.by_name(name).ok()?;
        if f.size() > 4 * 1024 * 1024 {
            return None;
        }
        let mut buf = Vec::new();
        f.read_to_end(&mut buf).ok()?;
        Some(buf)
    };

    let mut icon_path: Option<String> = None;
    if let Some(j) = read(&mut zip, "fabric.mod.json").and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok()) {
        info.name = j["name"].as_str().map(String::from);
        info.version = j["version"].as_str().map(String::from);
        info.description = j["description"].as_str().map(String::from);
        info.authors = j["authors"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().or(x["name"].as_str()).map(String::from)).collect()).unwrap_or_default();
        icon_path = j["icon"].as_str().map(String::from).or_else(|| j["icon"].as_object().and_then(|o| o.values().last()).and_then(|v| v.as_str()).map(String::from));
    } else if let Some(t) = read(&mut zip, "META-INF/neoforge.mods.toml").or_else(|| read(&mut zip, "META-INF/mods.toml")) {
        let t = String::from_utf8_lossy(&t);
        let grab = |key: &str| {
            t.lines().find_map(|l| {
                let l = l.trim();
                l.strip_prefix(key).and_then(|r| r.trim_start().strip_prefix('=')).map(|v| v.trim().trim_matches('"').to_string())
            })
        };
        info.name = grab("displayName");
        info.version = grab("version").filter(|v| !v.starts_with("${"));
        info.description = grab("description").filter(|d| !d.starts_with("'''"));
        icon_path = grab("logoFile");
    } else if let Some(p) = read(&mut zip, "pack.mcmeta").and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok()) {
        // resource / data pack
        info.description = p["pack"]["description"].as_str().map(String::from);
        icon_path = Some("pack.png".into());
    }
    if let Some(ip) = icon_path {
        if let Some(png) = read(&mut zip, ip.trim_start_matches('/')) {
            if png.len() < 512 * 1024 {
                info.icon = Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)));
            }
        }
    }
    (sha1, info)
}

pub async fn set_enabled(paths: &LauncherPaths, instance: &str, dir: &str, file: &str, enabled: bool) -> Result<String> {
    check_dir(dir)?;
    check_file_name(file)?;
    let folder = paths.instance(instance).join(dir);
    let base = file.trim_end_matches(".disabled");
    let (from, to) = if enabled { (format!("{base}.disabled"), base.to_string()) } else { (base.to_string(), format!("{base}.disabled")) };
    if tokio::fs::metadata(folder.join(&from)).await.is_ok() {
        tokio::fs::rename(folder.join(&from), folder.join(&to)).await?;
    }
    Ok(to)
}

pub async fn delete(paths: &LauncherPaths, instance: &str, dir: &str, file: &str) -> Result<()> {
    check_dir(dir)?;
    check_file_name(file)?;
    let p = paths.instance(instance).join(dir).join(file);
    match tokio::fs::metadata(&p).await {
        Ok(m) if m.is_dir() => tokio::fs::remove_dir_all(&p).await?,
        Ok(_) => tokio::fs::remove_file(&p).await?,
        Err(_) => {}
    }
    Ok(())
}

/// Copy local files (picked or dropped by the user) into an instance folder.
pub async fn import_files(paths: &LauncherPaths, instance: &str, dir: &str, files: &[PathBuf]) -> Result<usize> {
    check_dir(dir)?;
    let folder = paths.instance(instance).join(dir);
    tokio::fs::create_dir_all(&folder).await?;
    let mut n = 0;
    for f in files {
        let Some(name) = f.file_name().and_then(|n| n.to_str()) else { continue };
        check_file_name(name)?;
        tokio::fs::copy(f, folder.join(name)).await?;
        n += 1;
    }
    Ok(n)
}

pub async fn worlds(paths: &LauncherPaths, instance: &str) -> Result<Vec<World>> {
    let saves = paths.instance(instance).join("saves");
    tokio::task::spawn_blocking(move || {
        let Ok(rd) = std::fs::read_dir(&saves) else { return vec![] };
        let mut out: Vec<World> = rd
            .flatten()
            .filter(|e| e.path().join("level.dat").exists())
            .map(|e| {
                let p = e.path();
                let modified = std::fs::metadata(p.join("level.dat")).map(|m| mtime(&m)).unwrap_or(0);
                let icon = std::fs::read(p.join("icon.png")).ok().filter(|b| b.len() < 512 * 1024).map(|b| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(b)));
                World { folder: e.file_name().to_string_lossy().to_string(), modified, size_mb: dir_size(&p) as f64 / 1_048_576.0, icon }
            })
            .collect();
        out.sort_by(|a, b| b.modified.cmp(&a.modified));
        out
    })
    .await
    .map_err(|e| Error::Other(e.to_string()))
}

fn dir_size(p: &Path) -> u64 {
    let Ok(rd) = std::fs::read_dir(p) else { return 0 };
    rd.flatten().map(|e| match e.metadata() {
        Ok(m) if m.is_dir() => dir_size(&e.path()),
        Ok(m) => m.len(),
        Err(_) => 0,
    }).sum()
}

pub async fn screenshots(paths: &LauncherPaths, instance: &str) -> Result<Vec<Screenshot>> {
    let dir = paths.instance(instance).join("screenshots");
    let mut out = Vec::new();
    let Ok(mut rd) = tokio::fs::read_dir(&dir).await else { return Ok(out) };
    while let Some(e) = rd.next_entry().await? {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some("png") {
            continue;
        }
        let modified = e.metadata().await.map(|m| mtime(&m)).unwrap_or(0);
        out.push(Screenshot { file_name: e.file_name().to_string_lossy().to_string(), path: p.display().to_string(), modified });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Favorite {
    pub source: String,
    pub id: String,
    pub slug: String,
    pub title: String,
    pub icon_url: Option<String>,
    pub category: String,
    pub description: Option<String>,
    #[serde(default)]
    pub added_at: i64,
}

pub async fn load_favorites(paths: &LauncherPaths) -> Vec<Favorite> {
    tokio::fs::read(paths.root().join("favorites.json")).await.ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// Add if missing, remove if present. Returns the new list.
pub async fn toggle_favorite(paths: &LauncherPaths, mut fav: Favorite) -> Result<Vec<Favorite>> {
    let mut list = load_favorites(paths).await;
    if let Some(i) = list.iter().position(|f| f.source == fav.source && f.id == fav.id) {
        list.remove(i);
    } else {
        fav.added_at = chrono::Utc::now().timestamp();
        list.insert(0, fav);
    }
    tokio::fs::create_dir_all(paths.root()).await?;
    tokio::fs::write(paths.root().join("favorites.json"), serde_json::to_vec_pretty(&list)?).await?;
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths() {
        assert!(check_file_name("sodium.jar").is_ok());
        assert!(check_file_name("../x.jar").is_err());
        assert!(check_file_name("a/b.jar").is_err());
        assert!(check_file_name(".hidden").is_err());
    }

    #[tokio::test]
    async fn toggle_and_list_reads_fabric_metadata() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = LauncherPaths::new(tmp.path());
        let mods = paths.instance("i1").join("mods");
        std::fs::create_dir_all(&mods).unwrap();
        // build a tiny jar with fabric.mod.json
        let jar = mods.join("cool.jar");
        let mut w = zip::ZipWriter::new(std::fs::File::create(&jar).unwrap());
        w.start_file::<_, ()>("fabric.mod.json", Default::default()).unwrap();
        std::io::Write::write_all(&mut w, br#"{"id":"cool","name":"Cool Mod","version":"1.2","description":"Does cool things","authors":["Alex"]}"#).unwrap();
        w.finish().unwrap();

        let list = list(&paths, "i1", "mods").await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name.as_deref(), Some("Cool Mod"));
        assert_eq!(list[0].authors, vec!["Alex".to_string()]);
        assert!(list[0].enabled);

        let renamed = set_enabled(&paths, "i1", "mods", "cool.jar", false).await.unwrap();
        assert_eq!(renamed, "cool.jar.disabled");
        assert!(mods.join("cool.jar.disabled").exists());
        set_enabled(&paths, "i1", "mods", "cool.jar.disabled", true).await.unwrap();
        assert!(mods.join("cool.jar").exists());
    }
}
