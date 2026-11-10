//! Self-update from GitHub releases. Each release is tagged `v<version>-build<n>` and
//! carries the Windows installer plus a `SHA256SUMS.txt`. Ember compares (version, build)
//! with its own, downloads the installer, checks its hash and runs it.
use crate::{Error, Result};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub const REPO: &str = "blazebaal104/ember-launcher";

/// The CI run number baked in at build time (0 for local builds).
pub fn current_build() -> u32 {
    option_env!("EMBER_BUILD").and_then(|b| b.parse().ok()).unwrap_or(0)
}

/// `v0.4.0-build9` → ((0,4,0), 9)
pub fn parse_tag(tag: &str) -> Option<((u32, u32, u32), u32)> {
    let t = tag.strip_prefix('v')?;
    let (ver, build) = t.split_once("-build").map(|(v, b)| (v, b.parse().ok())).unwrap_or((t, Some(0)));
    let mut it = ver.split('.').map(|p| p.parse::<u32>().ok());
    let v = (it.next()??, it.next()??, it.next().flatten().unwrap_or(0));
    Some((v, build?))
}

pub fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    parse_tag(&format!("v{v}")).map(|(v, _)| v)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub tag: String,
    pub version: String,
    pub build: u32,
    pub notes: String,
    pub published_at: String,
    pub installer_url: String,
    pub installer_name: String,
    pub size: u64,
    pub sums_url: Option<String>,
    pub page_url: String,
}

fn asset(rel: &Value, pred: impl Fn(&str) -> bool) -> Option<&Value> {
    rel.get("assets")?.as_array()?.iter().find(|a| a.get("name").and_then(Value::as_str).is_some_and(&pred))
}

fn to_info(rel: &Value) -> Option<UpdateInfo> {
    if rel.get("draft").and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }
    let tag = rel.get("tag_name")?.as_str()?.to_string();
    let (v, build) = parse_tag(&tag)?;
    let exe = asset(rel, |n| n.ends_with("-setup.exe"))?;
    Some(UpdateInfo {
        version: format!("{}.{}.{}", v.0, v.1, v.2),
        build,
        notes: rel.get("body").and_then(Value::as_str).unwrap_or_default().to_string(),
        published_at: rel.get("published_at").and_then(Value::as_str).unwrap_or_default().to_string(),
        installer_url: exe.get("browser_download_url")?.as_str()?.to_string(),
        installer_name: exe.get("name")?.as_str()?.to_string(),
        size: exe.get("size").and_then(Value::as_u64).unwrap_or(0),
        sums_url: asset(rel, |n| n == "SHA256SUMS.txt").and_then(|a| a.get("browser_download_url")).and_then(Value::as_str).map(String::from),
        page_url: rel.get("html_url").and_then(Value::as_str).unwrap_or_default().to_string(),
        tag,
    })
}

/// The newest release, if it's newer than this app.
pub async fn check(client: &reqwest::Client, current_version: &str) -> Result<Option<UpdateInfo>> {
    let list: Value = client
        .get(format!("https://api.github.com/repos/{REPO}/releases?per_page=10"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let cur = (parse_version(current_version).unwrap_or((0, 0, 0)), current_build());
    let newest = list.as_array().into_iter().flatten().filter_map(to_info).max_by_key(|i| (parse_version(&i.version), i.build));
    Ok(newest.filter(|i| (parse_version(&i.version).unwrap_or((0, 0, 0)), i.build) > cur))
}

/// Find a release by tag (the UI passes only the tag; URLs come from GitHub).
pub async fn by_tag(client: &reqwest::Client, tag: &str) -> Result<UpdateInfo> {
    if !tag.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return Err(Error::Other("bad tag".into()));
    }
    let rel: Value = client.get(format!("https://api.github.com/repos/{REPO}/releases/tags/{tag}")).header("Accept", "application/vnd.github+json").send().await?.error_for_status()?.json().await?;
    to_info(&rel).ok_or_else(|| Error::Other("that release has no Windows installer".into()))
}

fn github_url(u: &str) -> bool {
    u.starts_with(&format!("https://github.com/{REPO}/releases/download/"))
}

/// Download the installer into `dir`, verifying SHA-256 when the release lists it.
pub async fn download(client: &reqwest::Client, info: &UpdateInfo, dir: &Path, mut progress: impl FnMut(u64, u64)) -> Result<PathBuf> {
    if !github_url(&info.installer_url) || info.installer_name.contains(['/', '\\']) {
        return Err(Error::Other("unexpected download location".into()));
    }
    let expected = match &info.sums_url {
        Some(u) if github_url(u) => {
            let sums = client.get(u).send().await?.error_for_status()?.text().await?;
            sums.lines().find_map(|l| {
                let (hash, name) = l.split_once(char::is_whitespace)?;
                (name.trim().trim_start_matches('*') == info.installer_name).then(|| hash.trim().to_ascii_lowercase())
            })
        }
        _ => None,
    };
    tokio::fs::create_dir_all(dir).await?;
    let dest = dir.join(&info.installer_name);
    let mut res = client.get(&info.installer_url).timeout(std::time::Duration::from_secs(1800)).send().await?.error_for_status()?;
    let total = res.content_length().unwrap_or(info.size);
    let mut hasher = Sha256::new();
    let mut buf = Vec::with_capacity(total as usize);
    while let Some(chunk) = res.chunk().await? {
        hasher.update(&chunk);
        buf.extend_from_slice(&chunk);
        progress(buf.len() as u64, total);
    }
    let got = hex::encode(hasher.finalize());
    if let Some(exp) = expected {
        if exp != got {
            return Err(Error::HashMismatch { path: dest.display().to_string(), expected: exp, actual: got });
        }
    }
    tokio::fs::write(&dest, &buf).await?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags() {
        assert_eq!(parse_tag("v0.4.0-build9"), Some(((0, 4, 0), 9)));
        assert_eq!(parse_tag("v1.2"), Some(((1, 2, 0), 0)));
        assert_eq!(parse_tag("nightly"), None);
        assert!(((0, 4, 0), 9) > ((0, 3, 0), 12));
        assert!(((0, 4, 0), 10) > ((0, 4, 0), 9));
    }

    #[test]
    fn release_json() {
        let rel = serde_json::json!({
            "tag_name": "v0.4.0-build9", "draft": false, "body": "notes", "html_url": "https://github.com/x",
            "assets": [
                { "name": "Ember Launcher_0.4.0_x64-setup.exe", "size": 10, "browser_download_url": "https://github.com/blazebaal104/ember-launcher/releases/download/v0.4.0-build9/Ember.Launcher_0.4.0_x64-setup.exe" },
                { "name": "SHA256SUMS.txt", "browser_download_url": "https://github.com/blazebaal104/ember-launcher/releases/download/v0.4.0-build9/SHA256SUMS.txt" }
            ]
        });
        let i = to_info(&rel).unwrap();
        assert_eq!(i.version, "0.4.0");
        assert_eq!(i.build, 9);
        assert!(i.sums_url.is_some());
        assert!(github_url(&i.installer_url));
        assert!(!github_url("https://evil.example/x.exe"));
    }
}
