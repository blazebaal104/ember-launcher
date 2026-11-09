//! Minimal Modrinth client used by the Rust side (performance bundle, updates).
//! The rich client used by the UI lives in `packages/content-engine`.
use crate::Result;
use serde::{Deserialize, Serialize};

pub const API: &str = "https://api.modrinth.com/v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrVersion {
    pub id: String,
    pub project_id: String,
    pub version_number: String,
    pub version_type: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub date_published: String,
    pub files: Vec<MrFile>,
    #[serde(default)]
    pub dependencies: Vec<MrDependency>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
    pub hashes: MrHashes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrHashes {
    pub sha1: String,
    pub sha512: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrDependency {
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub dependency_type: String,
}

impl MrVersion {
    pub fn primary_file(&self) -> Option<&MrFile> {
        self.files.iter().find(|f| f.primary).or_else(|| self.files.first())
    }
}

pub async fn project_versions(client: &reqwest::Client, id_or_slug: &str, loaders: &[&str], game_versions: &[&str]) -> Result<Vec<MrVersion>> {
    let res = client
        .get(format!("{API}/project/{id_or_slug}/version"))
        .query(&[
            ("loaders", serde_json::to_string(loaders)?),
            ("game_versions", serde_json::to_string(game_versions)?),
        ])
        .send()
        .await?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(vec![]);
    }
    Ok(res.error_for_status()?.json().await?)
}

/// release > beta > alpha, newest first.
pub fn best(mut versions: Vec<MrVersion>) -> Option<MrVersion> {
    let rank = |t: &str| match t {
        "release" => 0,
        "beta" => 1,
        _ => 2,
    };
    versions.sort_by(|a, b| rank(&a.version_type).cmp(&rank(&b.version_type)).then(b.date_published.cmp(&a.date_published)));
    versions.into_iter().find(|v| v.version_type != "alpha")
}
