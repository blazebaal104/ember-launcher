//! Managed Java runtimes, downloaded from Mojang's own runtime index.
//!
//! Each version JSON names its runtime component (`javaVersion.component`), e.g.
//! Java 21 for 1.21.x and Java 25 for 26.x. We download exactly that, so users never
//! install Java themselves. A per-instance override path is still supported.
use crate::download::{download_all, DownloadJob, Progress};
use crate::paths::LauncherPaths;
use crate::{Error, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

pub const RUNTIME_INDEX: &str =
    "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

#[derive(Deserialize)]
struct RuntimeEntry {
    manifest: ManifestRef,
}
#[derive(Deserialize)]
struct ManifestRef {
    url: String,
}
#[derive(Deserialize)]
struct RuntimeManifest {
    files: HashMap<String, RuntimeFile>,
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum RuntimeFile {
    File {
        #[serde(default)]
        executable: bool,
        downloads: FileDownloads,
    },
    Directory,
    Link {
        target: String,
    },
}
#[derive(Deserialize)]
struct FileDownloads {
    raw: Raw,
}
#[derive(Deserialize)]
struct Raw {
    url: String,
    sha1: String,
    size: u64,
}

pub fn platform_key() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "aarch64") => "windows-arm64",
        ("windows", "x86") => "windows-x86",
        ("windows", _) => "windows-x64",
        ("macos", "aarch64") => "mac-os-arm64",
        ("macos", _) => "mac-os",
        (_, "x86") => "linux-i386",
        _ => "linux",
    }
}

pub fn java_executable(paths: &LauncherPaths, component: &str) -> PathBuf {
    let base = paths.runtimes().join(component);
    match std::env::consts::OS {
        "windows" => base.join("bin").join("javaw.exe"),
        "macos" => base.join("jre.bundle/Contents/Home/bin/java"),
        _ => base.join("bin").join("java"),
    }
}

/// Ensure the runtime component is installed; returns the java executable.
pub async fn ensure_runtime(client: &reqwest::Client, paths: &LauncherPaths, component: &str, progress: Option<Progress>) -> Result<PathBuf> {
    let exe = java_executable(paths, component);
    let marker = paths.runtimes().join(format!("{component}.ok"));
    if exe.exists() && marker.exists() {
        return Ok(exe);
    }

    let index: HashMap<String, HashMap<String, Vec<RuntimeEntry>>> =
        client.get(RUNTIME_INDEX).send().await?.error_for_status()?.json().await?;
    let entry = index
        .get(platform_key())
        .and_then(|p| p.get(component))
        .and_then(|v| v.first())
        .ok_or_else(|| Error::NotFound(format!("Java runtime {component} for {}", platform_key())))?;
    let manifest: RuntimeManifest = client.get(&entry.manifest.url).send().await?.error_for_status()?.json().await?;

    let base = paths.runtimes().join(component);
    let mut jobs = Vec::new();
    let mut executables = Vec::new();
    let mut links = Vec::new();
    for (rel, file) in &manifest.files {
        let dest = base.join(rel);
        match file {
            RuntimeFile::Directory => tokio::fs::create_dir_all(&dest).await?,
            RuntimeFile::File { executable, downloads } => {
                if *executable {
                    executables.push(dest.clone());
                }
                jobs.push(DownloadJob { url: downloads.raw.url.clone(), dest, sha1: Some(downloads.raw.sha1.clone()), size: Some(downloads.raw.size) });
            }
            RuntimeFile::Link { target } => links.push((dest, target.clone())),
        }
    }
    download_all(client, jobs, 16, progress).await?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for p in executables {
            tokio::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).await?;
        }
        for (link, target) in links {
            let _ = tokio::fs::remove_file(&link).await;
            if let Some(parent) = link.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            tokio::fs::symlink(&target, &link).await?;
        }
    }
    #[cfg(not(unix))]
    let _ = (executables, links);

    tokio::fs::write(&marker, b"ok").await?;
    Ok(exe)
}
