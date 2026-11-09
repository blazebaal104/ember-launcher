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
    /// What the dashboard shows; updated by the log reader, the sampler and the network task.
    pub live: std::sync::Arc<std::sync::Mutex<ServerLive>>,
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    /// Seconds since start.
    pub t: u64,
    /// Percent of the whole CPU (all cores = 100).
    pub cpu: f32,
    pub memory_mb: u64,
    pub players: u32,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatus {
    pub checking: bool,
    pub lan_ip: Option<String>,
    pub public_ip: Option<String>,
    /// The router forwarded the port automatically (UPnP).
    pub upnp: bool,
    pub upnp_error: Option<String>,
    /// The public address is shared (carrier-grade NAT): direct joins can't work.
    pub shared_ip: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLive {
    pub ready: bool,
    pub port: u16,
    pub players: Vec<String>,
    pub samples: std::collections::VecDeque<Sample>,
    pub lag_warnings: u32,
    pub last_lag: Option<String>,
    pub network: NetworkStatus,
    #[serde(skip)]
    pub log: std::collections::VecDeque<String>,
    #[serde(skip)]
    pub exited: bool,
}

impl ServerLive {
    pub const MAX_LOG: usize = 500;
    pub const MAX_SAMPLES: usize = 150; // 5 minutes at one sample per 2s

    /// Update state from one console line.
    pub fn on_line(&mut self, line: &str) {
        if self.log.len() >= Self::MAX_LOG {
            self.log.pop_front();
        }
        self.log.push_back(line.to_string());
        let msg = line.split_once("]: ").map(|(_, m)| m).unwrap_or(line).trim();
        if msg.starts_with("Done (") && msg.contains("For help") {
            self.ready = true;
        } else if let Some(name) = msg.strip_suffix(" joined the game").and_then(|s| s.split_whitespace().last()) {
            if !self.players.iter().any(|p| p == name) {
                self.players.push(name.to_string());
            }
        } else if let Some(name) = msg.strip_suffix(" left the game").and_then(|s| s.split_whitespace().last()) {
            self.players.retain(|p| p != name);
        } else if msg.starts_with("Can't keep up!") {
            self.lag_warnings += 1;
            self.last_lag = Some(msg.to_string());
        } else if let Some(rest) = msg.strip_prefix("There are ").filter(|_| msg.contains("players online:")) {
            // Reply to "list": resync the player list.
            if let Some((_, names)) = rest.split_once("online:") {
                self.players = names.split(',').map(|n| n.trim().to_string()).filter(|n| !n.is_empty()).collect();
            }
        }
    }
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
