//! Ember Launcher core.
//!
//! Everything here is UI-agnostic and testable without Tauri. The desktop shell
//! (`apps/desktop/src-tauri`) only wires these functions to IPC commands.
//!
//! Layout on disk (see [`paths::LauncherPaths`]):
//! ```text
//! <data>/
//!   shared/            content-addressed, safe to share between instances
//!     versions/<id>/<id>.json, <id>.jar
//!     libraries/<maven path>
//!     assets/{indexes,objects,log_configs}
//!     runtimes/<java component>/
//!   instances/<instance-id>/      <- passed as --gameDir: FULLY isolated user content
//!     instance.json  mods/  config/  saves/  resourcepacks/  shaderpacks/  datapacks/  screenshots/  logs/
//!     .ember/natives/  .ember/bundle.lock.json
//! ```

pub mod auth;
pub mod content;
pub mod download;
pub mod error;
pub mod fabric;
pub mod install;
pub mod instance;
pub mod java;
pub mod launch;
pub mod modrinth;
pub mod mrpack;
pub mod nbt;
pub mod net;
pub mod neoforge;
pub mod paths;
pub mod perf_bundle;
pub mod profiles;
pub mod rules;
pub mod server;
pub mod settings;
pub mod version_json;
pub mod versions;
pub mod world_packs;

pub use chrono;
pub use error::{Error, Result};

pub const LAUNCHER_NAME: &str = "ember-launcher";
pub const LAUNCHER_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Modrinth and Mojang ask clients to identify themselves.
pub fn user_agent() -> String {
    format!("{LAUNCHER_NAME}/{LAUNCHER_VERSION} (+https://github.com/your-org/ember-launcher)")
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(user_agent())
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .expect("reqwest client")
}
