//! Fabric loader metadata (Quilt's meta API has the same shape at meta.quiltmc.org/v3).
//! NeoForge needs its installer processors and is wired as a separate step (see docs).
use crate::version_json::VersionJson;
use crate::{Error, Result};
use serde::Deserialize;

pub const FABRIC_META: &str = "https://meta.fabricmc.net/v2";

#[derive(Debug, Deserialize)]
pub struct LoaderEntry {
    pub loader: LoaderVersion,
}
#[derive(Debug, Deserialize)]
pub struct LoaderVersion {
    pub version: String,
    pub stable: bool,
}

/// Latest stable loader that supports this game version (Fabric supports snapshots too).
pub async fn latest_loader(client: &reqwest::Client, game_version: &str) -> Result<String> {
    let list: Vec<LoaderEntry> = client
        .get(format!("{FABRIC_META}/versions/loader/{game_version}"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    list.iter()
        .find(|e| e.loader.stable)
        .or_else(|| list.first())
        .map(|e| e.loader.version.clone())
        .ok_or_else(|| Error::NotFound(format!("Fabric loader for {game_version}")))
}

/// The launcher profile JSON (`inheritsFrom` the vanilla version).
pub async fn profile(client: &reqwest::Client, game_version: &str, loader_version: &str) -> Result<VersionJson> {
    Ok(client
        .get(format!("{FABRIC_META}/versions/loader/{game_version}/{loader_version}/profile/json"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?)
}
