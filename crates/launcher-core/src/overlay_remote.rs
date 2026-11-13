//! The in-game menu (ember-overlay) is published on its own, separately from the app, as the
//! `overlay` release on GitHub. At launch Ember fetches its small manifest and downloads the
//! jar for the instance's Minecraft version if it changed, so menu fixes reach players without
//! an app update. Everything is checked against the manifest's SHA-256. If GitHub can't be
//! reached, the last downloaded jar (or the copy bundled with the app) is used instead.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Duration;

const BASE: &str = "https://github.com/blazebaal104/ember-launcher/releases/download/overlay";
/// Manifest format this launcher understands. A future format means "needs a newer Ember".
const FORMAT: u32 = 1;

#[derive(Serialize, Deserialize, Clone)]
pub struct Manifest {
    pub format: u32,
    pub builds: Vec<Build>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Build {
    pub mc: String,
    pub covers: Vec<String>,
    pub file: String,
    pub sha256: String,
}

impl Manifest {
    fn for_version(&self, game_version: &str) -> Option<&Build> {
        self.builds.iter().find(|b| b.mc == game_version || b.covers.iter().any(|c| c == game_version))
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn safe_name(f: &str) -> bool {
    !f.is_empty() && f.ends_with(".jar") && f.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
}

async fn fetch_manifest(client: &reqwest::Client) -> Option<Manifest> {
    let resp = client.get(format!("{BASE}/overlay-manifest.json")).timeout(Duration::from_secs(6)).send().await.ok()?.error_for_status().ok()?;
    let m: Manifest = resp.json().await.ok()?;
    (m.format == FORMAT).then_some(m)
}

/// Path of an up-to-date menu jar for this Minecraft version in `cache`, downloading it if
/// needed. None when there is no published build (or no network and nothing cached).
pub async fn jar_for(client: &reqwest::Client, cache: &Path, game_version: &str) -> Option<PathBuf> {
    let manifest_path = cache.join("overlay-manifest.json");
    let manifest = match fetch_manifest(client).await {
        Some(m) => {
            let _ = tokio::fs::create_dir_all(cache).await;
            let _ = tokio::fs::write(&manifest_path, serde_json::to_vec_pretty(&m).unwrap_or_default()).await;
            m
        }
        // Offline: trust what we downloaded last time.
        None => serde_json::from_slice(&tokio::fs::read(&manifest_path).await.ok()?).ok()?,
    };
    let build = manifest.for_version(game_version)?.clone();
    if !safe_name(&build.file) {
        return None;
    }
    let path = cache.join(&build.file);
    if let Ok(bytes) = tokio::fs::read(&path).await {
        if sha256_hex(&bytes).eq_ignore_ascii_case(&build.sha256) {
            return Some(path);
        }
    }
    let bytes = client.get(format!("{BASE}/{}", build.file)).timeout(Duration::from_secs(60)).send().await.ok()?.error_for_status().ok()?.bytes().await.ok()?;
    if !sha256_hex(&bytes).eq_ignore_ascii_case(&build.sha256) {
        tracing::warn!(file = %build.file, "downloaded in-game menu failed its checksum; using the bundled one");
        return None;
    }
    let tmp = cache.join(format!("{}.part", build.file));
    tokio::fs::create_dir_all(cache).await.ok()?;
    tokio::fs::write(&tmp, &bytes).await.ok()?;
    tokio::fs::rename(&tmp, &path).await.ok()?;
    Some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_lookup_and_names() {
        let m: Manifest = serde_json::from_str(r#"{"format":1,"builds":[{"mc":"1.21.8","covers":["1.21.6","1.21.7","1.21.8"],"file":"ember-overlay-1.21.8.jar","sha256":"ab"}]}"#).unwrap();
        assert_eq!(m.for_version("1.21.7").unwrap().mc, "1.21.8");
        assert!(m.for_version("1.21.5").is_none());
        assert!(safe_name("ember-overlay-1.21.8.jar"));
        assert!(!safe_name("../evil.jar"));
        assert!(!safe_name("x.exe"));
    }
}
