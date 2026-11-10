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
    pub pid: Option<u32>,
    /// The playit.gg agent carrying this server's tunnel, if enabled.
    pub playit_child: Option<tokio::process::Child>,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pregen {
    pub percent: f32,
    pub chunks: u64,
    pub eta: Option<String>,
    pub rate: Option<f32>,
    /// running | paused | done | cancelled
    pub state: String,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayitLive {
    /// off | starting | online | error
    pub state: String,
    pub address: Option<String>,
    pub error: Option<String>,
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
    pub pregen: Option<Pregen>,
    pub playit: PlayitLive,
    /// The user asked it to stop (so an exit isn't treated as a crash).
    pub stopping: bool,
    #[serde(skip)]
    pub log: std::collections::VecDeque<String>,
    #[serde(skip)]
    pub exited: bool,
}

/// Parse Chunky's progress lines, e.g.
/// `[Chunky] Task running for world. Processed: 51384 chunks (13.15%), ETA: 0:12:34, Rate: 67.8 cps, Current: -21, 103`
pub fn parse_chunky(msg: &str) -> Option<Pregen> {
    let rest = msg.strip_prefix("[Chunky] ").unwrap_or(msg);
    let state = if rest.starts_with("Task running for") {
        "running"
    } else if rest.starts_with("Task finished for") {
        "done"
    } else if rest.starts_with("Task paused for") {
        "paused"
    } else if rest.starts_with("Task cancelled for") || rest.starts_with("Task stopped for") {
        "cancelled"
    } else {
        return None;
    };
    let between = |a: &str, b: &str| rest.split_once(a).and_then(|(_, r)| r.split_once(b).map(|(v, _)| v.trim().to_string()));
    Some(Pregen {
        state: state.into(),
        chunks: between("Processed: ", " chunks").and_then(|v| v.parse().ok()).unwrap_or(0),
        percent: between("(", "%)").and_then(|v| v.parse().ok()).unwrap_or(if state == "done" { 100.0 } else { 0.0 }),
        eta: between("ETA: ", ",").filter(|e| !e.is_empty()),
        rate: between("Rate: ", " cps").and_then(|v| v.parse().ok()),
    })
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
        } else if let Some(p) = parse_chunky(msg) {
            self.pregen = Some(p);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunky_progress() {
        let p = parse_chunky("[Chunky] Task running for minecraft:overworld. Processed: 51384 chunks (13.15%), ETA: 0:12:34, Rate: 67.8 cps, Current: -21, 103").unwrap();
        assert_eq!(p.chunks, 51384);
        assert!((p.percent - 13.15).abs() < 0.01);
        assert_eq!(p.eta.as_deref(), Some("0:12:34"));
        assert_eq!(p.rate, Some(67.8));
        assert_eq!(parse_chunky("[Chunky] Task finished for world. Processed: 390625 chunks (100.00%), Total time: 1:02:03").unwrap().state, "done");
        assert!(parse_chunky("Steve joined the game").is_none());
        let mut l = ServerLive::default();
        l.on_line("[12:00:00] [Server thread/INFO]: Steve joined the game");
        l.on_line("[12:00:01] [Server thread/INFO]: [Chunky] Task paused for world. Processed: 10 chunks (1.00%), ETA: 1:00:00, Rate: 5.0 cps, Current: 0, 0");
        assert_eq!(l.players, vec!["Steve"]);
        assert_eq!(l.pregen.unwrap().state, "paused");
    }
}
