//! Launcher-wide settings (settings.json in the data folder), editable from the UI.
use crate::paths::LauncherPaths;
use crate::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LauncherSettings {
    /// Azure app (public client) id used for Microsoft sign-in. Overrides the build-time default.
    pub msa_client_id: Option<String>,
    /// Default memory for new instances, in MB.
    pub default_memory_mb: Option<u32>,
    /// What the launcher window does when a game starts: "keep" | "minimize" | "close".
    pub on_launch: Option<String>,
    /// Extra JVM arguments added to every instance.
    pub default_jvm_args: Option<Vec<String>>,
    /// Appearance and UI preferences, owned by the frontend (theme, accent, glass, motion...).
    pub ui: Option<serde_json::Value>,
    /// Set once the first-run tour has been shown.
    pub onboarded: Option<bool>,
}

impl LauncherSettings {
    pub async fn load(paths: &LauncherPaths) -> LauncherSettings {
        match tokio::fs::read(paths.root().join("settings.json")).await {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
            Err(_) => LauncherSettings::default(),
        }
    }

    pub async fn save(&self, paths: &LauncherPaths) -> Result<()> {
        tokio::fs::create_dir_all(paths.root()).await?;
        tokio::fs::write(paths.root().join("settings.json"), serde_json::to_vec_pretty(self)?).await?;
        Ok(())
    }
}
