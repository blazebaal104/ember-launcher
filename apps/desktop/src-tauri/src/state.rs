use launcher_core::auth::{Account, DeviceCode, MicrosoftAuth};
use launcher_core::instance::InstanceManager;
use launcher_core::paths::LauncherPaths;
use launcher_core::profiles::ProfileStore;
use launcher_core::server::ServerManager;
use launcher_core::settings::LauncherSettings;
use std::collections::HashMap;
use tokio::sync::Mutex;

/// A dedicated server started from the launcher.
pub struct RunningServer {
    pub stdin: tokio::process::ChildStdin,
    pub started: std::time::Instant,
}

/// Optional build-time default Azure client id (EMBER_MSA_CLIENT_ID=... npm run build).
/// Users can always set their own in Settings, which takes precedence.
pub const DEFAULT_MSA_CLIENT_ID: Option<&str> = option_env!("EMBER_MSA_CLIENT_ID");

/// CurseForge key stays in the Rust binary, never in the JS bundle.
pub const CURSEFORGE_KEY: Option<&str> = option_env!("EMBER_CURSEFORGE_KEY");

pub const KEYRING_SERVICE: &str = "dev.ember.launcher";
pub const KEYRING_USER: &str = "msa-refresh-token";

pub struct AppState {
    pub paths: LauncherPaths,
    pub client: reqwest::Client,
    pub instances: InstanceManager,
    pub settings: Mutex<LauncherSettings>,
    pub profiles: Mutex<ProfileStore>,
    pub servers: ServerManager,
    pub running_servers: Mutex<HashMap<String, RunningServer>>,
    /// instance id → game process id, for "Stop" and "is running".
    pub running_games: Mutex<HashMap<String, u32>>,
    pub account: Mutex<Option<Account>>,
    pub pending_login: Mutex<Option<DeviceCode>>,
}

impl AppState {
    pub fn new(paths: LauncherPaths, client: reqwest::Client, instances: InstanceManager, settings: LauncherSettings, profiles: ProfileStore) -> Self {
        Self {
            servers: ServerManager::new(paths.clone(), client.clone()),
            paths,
            client,
            instances,
            settings: Mutex::new(settings),
            profiles: Mutex::new(profiles),
            running_servers: Mutex::new(HashMap::new()),
            running_games: Mutex::new(HashMap::new()),
            account: Mutex::new(None),
            pending_login: Mutex::new(None),
        }
    }

    /// The client id in effect: Settings first, then the build-time default.
    pub async fn client_id(&self) -> Option<String> {
        let s = self.settings.lock().await;
        s.msa_client_id.clone().filter(|id| !id.trim().is_empty()).or_else(|| DEFAULT_MSA_CLIENT_ID.map(String::from))
    }

    pub async fn auth(&self) -> MicrosoftAuth {
        MicrosoftAuth::new(self.client.clone(), self.client_id().await.unwrap_or_default().trim().to_string())
    }
}
