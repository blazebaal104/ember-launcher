//! Installs everything a version needs into the shared store (idempotent).
use crate::download::{download_all, download_one, DownloadJob, Progress};
use crate::instance::{InstanceConfig, Loader};
use crate::paths::{maven_path, LauncherPaths};
use crate::rules::{allowed, RuleContext};
use crate::version_json::{merge, VersionJson};
use crate::versions::{fetch_manifest, supported_versions};
use crate::{fabric, Error, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

const RESOURCES: &str = "https://resources.download.minecraft.net";

#[derive(Deserialize)]
struct AssetIndex {
    objects: HashMap<String, AssetObject>,
}
#[derive(Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

/// Resolved, merged version ready to launch.
pub struct Prepared {
    pub json: VersionJson,
    /// Vanilla id: owns the client jar, assets and natives.
    pub vanilla_id: String,
}

/// Library jar location for both Mojang (`downloads.artifact`) and Maven-style (`url` + name) entries.
pub fn library_path(paths: &LauncherPaths, lib: &crate::version_json::Library) -> Option<PathBuf> {
    let rel = lib
        .downloads
        .as_ref()
        .and_then(|d| d.artifact.as_ref())
        .and_then(|a| a.path.clone())
        .or_else(|| maven_path(&lib.name))?;
    Some(paths.libraries().join(rel))
}

pub async fn prepare(client: &reqwest::Client, paths: &LauncherPaths, inst: &InstanceConfig, progress: Option<Progress>) -> Result<Prepared> {
    // 1. Vanilla version JSON (verified against the manifest hash).
    let manifest = fetch_manifest(client).await?;
    let entry = supported_versions(&manifest)
        .into_iter()
        .find(|v| v.id == inst.game_version)
        .ok_or_else(|| Error::UnsupportedVersion(inst.game_version.clone()))?;
    let json_path = paths.version_json(&entry.id);
    download_one(client, &DownloadJob { url: entry.url.clone(), dest: json_path.clone(), sha1: Some(entry.sha1.clone()), size: None }).await?;
    let vanilla: VersionJson = serde_json::from_slice(&tokio::fs::read(&json_path).await?)?;

    // 2. Loader profile.
    let json = match (inst.loader, &inst.loader_version) {
        (Loader::Fabric, Some(lv)) => {
            let profile = fabric::profile(client, &inst.game_version, lv).await?;
            let p = paths.version_json(&profile.id);
            tokio::fs::create_dir_all(p.parent().unwrap()).await?;
            tokio::fs::write(&p, serde_json::to_vec_pretty(&profile)?).await?;
            merge(vanilla, profile)
        }
        (Loader::Quilt, Some(lv)) => {
            let profile = fabric::quilt_profile(client, &inst.game_version, lv).await?;
            let p = paths.version_json(&profile.id);
            tokio::fs::create_dir_all(p.parent().unwrap()).await?;
            tokio::fs::write(&p, serde_json::to_vec_pretty(&profile)?).await?;
            merge(vanilla, profile)
        }
        (Loader::NeoForge, Some(nf)) => {
            // The installer needs the vanilla client jar and a Java to run on.
            if let Some(d) = &vanilla.downloads {
                download_one(client, &DownloadJob { url: d.client.url.clone(), dest: paths.version_jar(&entry.id), sha1: Some(d.client.sha1.clone()), size: Some(d.client.size) }).await?;
            }
            let component = vanilla.java_version.as_ref().map(|j| j.component.clone()).unwrap_or_else(|| "java-runtime-delta".into());
            let java = crate::java::ensure_runtime(client, paths, &component, None).await?;
            let profile = crate::neoforge::ensure_installed(client, paths, nf, &java).await?;
            merge(vanilla, profile)
        }
        (Loader::Vanilla, _) => vanilla,
        (other, None) => return Err(Error::Other(format!("{other:?} instance has no loader version; recreate it"))),
    };

    // 3. Files: client jar, libraries, log config, asset index.
    let ctx = RuleContext::current();
    let mut jobs = Vec::new();
    if let Some(d) = &json.downloads {
        jobs.push(DownloadJob { url: d.client.url.clone(), dest: paths.version_jar(&entry.id), sha1: Some(d.client.sha1.clone()), size: Some(d.client.size) });
    }
    for lib in json.libraries.iter().filter(|l| allowed(&l.rules, &ctx)) {
        let Some(dest) = library_path(paths, lib) else { continue };
        if let Some(a) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
            // Empty URL = generated locally by an installer (NeoForge patched client).
            if a.url.is_empty() {
                continue;
            }
            jobs.push(DownloadJob { url: a.url.clone(), dest, sha1: Some(a.sha1.clone()), size: Some(a.size) });
        } else if let (Some(base), Some(rel)) = (&lib.url, maven_path(&lib.name)) {
            let url = format!("{}/{}", base.trim_end_matches('/'), rel);
            jobs.push(DownloadJob { url, dest, sha1: lib.sha1.clone(), size: lib.size });
        }
    }
    if let Some(log) = json.logging.as_ref().and_then(|l| l.client.as_ref()) {
        jobs.push(DownloadJob {
            url: log.file.url.clone(),
            dest: paths.assets().join("log_configs").join(&log.file.id),
            sha1: Some(log.file.sha1.clone()),
            size: Some(log.file.size),
        });
    }
    let index = json.asset_index.as_ref().ok_or_else(|| Error::Other("version has no asset index".into()))?;
    let index_path = paths.assets().join("indexes").join(format!("{}.json", index.id));
    download_one(client, &DownloadJob { url: index.url.clone(), dest: index_path.clone(), sha1: Some(index.sha1.clone()), size: Some(index.size) }).await?;

    // 4. Assets (content-addressed, shared by every instance).
    let assets: AssetIndex = serde_json::from_slice(&tokio::fs::read(&index_path).await?)?;
    for obj in assets.objects.values() {
        let prefix = &obj.hash[..2];
        jobs.push(DownloadJob {
            url: format!("{RESOURCES}/{prefix}/{}", obj.hash),
            dest: paths.assets().join("objects").join(prefix).join(&obj.hash),
            sha1: Some(obj.hash.clone()),
            size: Some(obj.size),
        });
    }

    download_all(client, jobs, 32, progress).await?;
    Ok(Prepared { json, vanilla_id: entry.id })
}
