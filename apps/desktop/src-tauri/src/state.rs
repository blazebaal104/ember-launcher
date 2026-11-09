use launcher_core::auth::{Account, DeviceCode, MicrosoftAuth};
use launcher_core::instance::InstanceManager;
use launcher_core::paths::LauncherPaths;
use launcher_core::settings::LauncherSettings;
use tokio::sync::Mutex;

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
    pub account: Mutex<Option<Account>>,
    pub pending_login: Mutex<Option<DeviceCode>>,
}

impl AppState {
    pub fn new(paths: LauncherPaths, client: reqwest::Client, instances: InstanceManager, settings: LauncherSettings) -> Self {
        Self {
            paths,
            client,
            instances,
            settings: Mutex::new(settings),
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
