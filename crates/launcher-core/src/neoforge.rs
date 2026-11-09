//! NeoForge support. NeoForge patches the game with "processors" at install time, so instead
//! of re-implementing them we run NeoForge's own installer headlessly against the shared store.
//! The store already uses the vanilla launcher layout the installer expects
//! (`versions/<id>/<id>.json|jar`, `libraries/<maven path>`).
use crate::paths::LauncherPaths;
use crate::version_json::VersionJson;
use crate::{download, Error, Result};
use serde::Deserialize;
use std::path::Path;

const MAVEN: &str = "https://maven.neoforged.net";

#[derive(Deserialize)]
struct VersionList {
    versions: Vec<String>,
}

/// NeoForge numbers follow the game: 1.21.4 → 21.4.x, 1.21 → 21.0.x, 26.3 → 26.3.x.
pub fn version_prefix(game_version: &str) -> String {
    match game_version.strip_prefix("1.") {
        Some(rest) => {
            let mut parts = rest.split('.');
            let major = parts.next().unwrap_or("0");
            let minor = parts.next().unwrap_or("0");
            format!("{major}.{minor}.")
        }
        None => format!("{game_version}."),
    }
}

/// Pick the newest release for the game version (betas only if nothing else exists).
pub fn pick(versions: &[String], game_version: &str) -> Option<String> {
    let prefix = version_prefix(game_version);
    let mut matching: Vec<&String> = versions.iter().filter(|v| v.starts_with(&prefix)).collect();
    // Maven lists oldest first; compare numerically to be safe.
    matching.sort_by_key(|v| v.split(['.', '-']).map(|p| p.parse::<u64>().unwrap_or(0)).collect::<Vec<_>>());
    matching.iter().rev().find(|v| !v.contains("beta")).or(matching.last()).map(|v| v.to_string())
}

pub async fn latest(client: &reqwest::Client, game_version: &str) -> Result<String> {
    let list: VersionList = client
        .get(format!("{MAVEN}/api/maven/versions/releases/net/neoforged/neoforge"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    pick(&list.versions, game_version).ok_or_else(|| Error::NotFound(format!("NeoForge for Minecraft {game_version}")))
}

pub fn profile_id(nf_version: &str) -> String {
    format!("neoforge-{nf_version}")
}

/// Run the installer once (if needed) and return the NeoForge profile JSON.
/// Requires the vanilla version JSON + client jar to already be in the shared store.
pub async fn ensure_installed(client: &reqwest::Client, paths: &LauncherPaths, nf_version: &str, java: &Path) -> Result<VersionJson> {
    let id = profile_id(nf_version);
    let json_path = paths.version_json(&id);
    if let Ok(bytes) = tokio::fs::read(&json_path).await {
        return Ok(serde_json::from_slice(&bytes)?);
    }

    let shared = paths.shared();
    let installer = shared.join("cache").join("installers").join(format!("neoforge-{nf_version}-installer.jar"));
    download::download_one(
        client,
        &download::DownloadJob {
            url: format!("{MAVEN}/releases/net/neoforged/neoforge/{nf_version}/neoforge-{nf_version}-installer.jar"),
            dest: installer.clone(),
            sha1: None,
            size: None,
        },
    )
    .await?;

    // The installer refuses to run without a launcher_profiles.json in the target folder.
    let profiles = shared.join("launcher_profiles.json");
    if tokio::fs::metadata(&profiles).await.is_err() {
        tokio::fs::write(&profiles, br#"{"profiles":{}}"#).await?;
    }

    let mut last_output = String::new();
    for flag in ["--install-client", "--installClient"] {
        let out = tokio::process::Command::new(java)
            .arg("-jar")
            .arg(&installer)
            .arg(flag)
            .arg(&shared)
            .current_dir(&shared)
            .output()
            .await?;
        last_output = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
        if out.status.success() && tokio::fs::metadata(&json_path).await.is_ok() {
            return Ok(serde_json::from_slice(&tokio::fs::read(&json_path).await?)?);
        }
    }
    let tail: String = last_output.lines().rev().take(15).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
    Err(Error::Other(format!("NeoForge installer failed:\n{tail}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefixes() {
        assert_eq!(version_prefix("1.21.4"), "21.4.");
        assert_eq!(version_prefix("1.21"), "21.0.");
        assert_eq!(version_prefix("26.3"), "26.3.");
    }

    #[test]
    fn picks_newest_release() {
        let v: Vec<String> = ["21.4.10-beta", "21.4.100", "21.4.99", "21.4.150-beta", "21.5.2", "26.3.0.1-beta"].iter().map(|s| s.to_string()).collect();
        assert_eq!(pick(&v, "1.21.4").as_deref(), Some("21.4.100"));
        assert_eq!(pick(&v, "26.3").as_deref(), Some("26.3.0.1-beta"));
        assert_eq!(pick(&v, "1.21.9"), None);
    }
}
