//! Version manifest + the "1.21 and newer" policy.
//!
//! Mojang moved to year-based numbering in December 2025 (26.1, 26.2, ... with
//! snapshots like `26.1-snapshot-1`). A string comparison on "1.21" would drop all of
//! those, so the cut-off is the *release time* of 1.21 taken from the manifest itself.
use crate::Result;
use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

pub const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub const CUTOFF_VERSION: &str = "1.21";

#[derive(Debug, Clone, Deserialize)]
pub struct VersionManifest {
    pub latest: Latest,
    pub versions: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Latest {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    pub sha1: String,
    pub release_time: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Channel {
    Release,
    ReleaseCandidate,
    PreRelease,
    Snapshot,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameVersion {
    pub id: String,
    pub channel: Channel,
    pub release_time: DateTime<Utc>,
    pub url: String,
    pub sha1: String,
}

fn rc_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    // 1.21.5-rc1, 26.1-rc-1
    R.get_or_init(|| Regex::new(r"(?i)-rc-?\d+$").unwrap())
}
fn pre_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    // 1.21-pre1, 26.1-pre-1
    R.get_or_init(|| Regex::new(r"(?i)-pre(-release)?-?\d+$").unwrap())
}

pub fn classify(id: &str, kind: &str) -> Option<Channel> {
    match kind {
        "release" => Some(Channel::Release),
        "snapshot" if rc_re().is_match(id) => Some(Channel::ReleaseCandidate),
        "snapshot" if pre_re().is_match(id) => Some(Channel::PreRelease),
        "snapshot" => Some(Channel::Snapshot),
        _ => None, // old_alpha / old_beta
    }
}

/// Every version released at or after 1.21 (plus its own pre-releases / RCs).
pub fn supported_versions(manifest: &VersionManifest) -> Vec<GameVersion> {
    let cutoff = manifest
        .versions
        .iter()
        .find(|v| v.id == CUTOFF_VERSION)
        .map(|v| v.release_time);

    manifest
        .versions
        .iter()
        .filter(|v| {
            // 1.21's own pre-releases/RCs predate its release, keep them explicitly.
            let is_121_dev = v.id.starts_with("1.21-");
            match cutoff {
                Some(c) => v.release_time >= c || is_121_dev,
                None => true, // manifest without 1.21 would be bizarre; don't hide everything
            }
        })
        .filter_map(|v| {
            classify(&v.id, &v.kind).map(|channel| GameVersion {
                id: v.id.clone(),
                channel,
                release_time: v.release_time,
                url: v.url.clone(),
                sha1: v.sha1.clone(),
            })
        })
        .collect()
}

pub async fn fetch_manifest(client: &reqwest::Client) -> Result<VersionManifest> {
    Ok(client.get(MANIFEST_URL).send().await?.error_for_status()?.json().await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, kind: &str, t: &str) -> String {
        format!(r#"{{"id":"{id}","type":"{kind}","url":"u","sha1":"s","time":"{t}","releaseTime":"{t}"}}"#)
    }

    #[test]
    fn filters_and_classifies() {
        let json = format!(
            r#"{{"latest":{{"release":"26.2","snapshot":"26.3-snapshot-9"}},"versions":[{}]}}"#,
            [
                entry("26.3-snapshot-9", "snapshot", "2026-08-20T10:00:00+00:00"),
                entry("26.2", "release", "2026-07-01T10:00:00+00:00"),
                entry("26.1-rc-1", "snapshot", "2026-03-10T10:00:00+00:00"),
                entry("26.1-pre-2", "snapshot", "2026-03-01T10:00:00+00:00"),
                entry("1.21.11", "release", "2025-12-09T10:00:00+00:00"),
                entry("1.21", "release", "2024-06-13T08:24:03+00:00"),
                entry("1.21-rc1", "snapshot", "2024-06-10T08:24:03+00:00"),
                entry("1.20.6", "release", "2024-04-29T12:00:00+00:00"),
                entry("24w14potato", "snapshot", "2024-04-01T12:00:00+00:00"),
                entry("b1.7.3", "old_beta", "2011-07-08T00:00:00+00:00"),
            ]
            .join(",")
        );
        let m: VersionManifest = serde_json::from_str(&json).unwrap();
        let v = supported_versions(&m);
        let ids: Vec<_> = v.iter().map(|g| g.id.as_str()).collect();
        assert_eq!(ids, ["26.3-snapshot-9", "26.2", "26.1-rc-1", "26.1-pre-2", "1.21.11", "1.21", "1.21-rc1"]);
        assert_eq!(v[0].channel, Channel::Snapshot);
        assert_eq!(v[2].channel, Channel::ReleaseCandidate);
        assert_eq!(v[3].channel, Channel::PreRelease);
        assert_eq!(v[6].channel, Channel::ReleaseCandidate);
    }
}
