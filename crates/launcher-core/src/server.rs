//! Dedicated servers (Vanilla, Fabric, Paper) managed by the launcher.
//! Each server lives in `<data>/servers/<id>/` with its own world, plugins/mods and config.
use crate::download::{download_one, DownloadJob};
use crate::paths::LauncherPaths;
use crate::version_json::VersionJson;
use crate::versions::{fetch_manifest, supported_versions};
use crate::{Error, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerKind {
    Vanilla,
    Fabric,
    Paper,
}

impl ServerKind {
    /// Folder that holds add-ons for this server type.
    pub fn addon_dir(&self) -> Option<&'static str> {
        match self {
            ServerKind::Vanilla => None,
            ServerKind::Fabric => Some("mods"),
            ServerKind::Paper => Some("plugins"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub kind: ServerKind,
    pub game_version: String,
    pub memory_mb: u32,
    pub port: u16,
    pub eula_accepted: bool,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub java_component: Option<String>,
    #[serde(default)]
    pub installed: bool,
    /// Forward the port on the router (UPnP) when the server starts.
    #[serde(default = "yes")]
    pub auto_network: bool,
    /// Run the playit.gg tunnel while the server runs.
    #[serde(default)]
    pub playit: bool,
    /// Daily world backup when the server starts (keeps the last few).
    #[serde(default = "yes")]
    pub auto_backup: bool,
    /// Start again automatically if the server crashes.
    #[serde(default = "yes")]
    pub restart_on_crash: bool,
    /// Stop the server after this many minutes with nobody online (None = never).
    #[serde(default)]
    pub stop_when_empty_mins: Option<u32>,
    /// Pre-generate this radius (blocks) around spawn the next time the server is ready.
    #[serde(default)]
    pub pending_pregen: Option<u32>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateServer {
    /// Pre-generate this many blocks around spawn on first start.
    #[serde(default)]
    pub pregen_radius: Option<u32>,
    #[serde(default)]
    pub seed: Option<String>,
    pub name: String,
    pub kind: ServerKind,
    pub game_version: String,
    #[serde(default)]
    pub memory_mb: Option<u32>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub motd: Option<String>,
    #[serde(default)]
    pub max_players: Option<u32>,
    #[serde(default)]
    pub gamemode: Option<String>,
    #[serde(default)]
    pub difficulty: Option<String>,
}

/// Aikar's flags (https://docs.papermc.io/paper/aikars-flags), minus the size-dependent ones.
pub const AIKAR_FLAGS: &[&str] = &[
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=200",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:+AlwaysPreTouch",
    "-XX:G1HeapWastePercent=5",
    "-XX:G1MixedGCCountTarget=4",
    "-XX:InitiatingHeapOccupancyPercent=15",
    "-XX:G1MixedGCLiveThresholdPercent=90",
    "-XX:G1RSetUpdatingPauseTimePercent=5",
    "-XX:SurvivorRatio=32",
    "-XX:+PerfDisableSharedMem",
    "-XX:MaxTenuringThreshold=1",
    "-Dusing.aikars.flags=https://mcflags.emc.gs",
    "-Daikars.new.flags=true",
];

/// Server-side optimisation mods for Fabric servers (all server-safe, no client needed).
pub const SERVER_MODS: &[&str] = &["fabric-api", "lithium", "ferrite-core", "krypton", "modernfix"];

/// Add the server optimisation mods that are missing (by file name). Returns what was added.
pub async fn ensure_server_mods(client: &reqwest::Client, mods_dir: &std::path::Path, game_version: &str) -> Result<Vec<String>> {
    tokio::fs::create_dir_all(mods_dir).await?;
    let mut names = Vec::new();
    let mut rd = tokio::fs::read_dir(mods_dir).await?;
    while let Some(e) = rd.next_entry().await? {
        names.push(e.file_name().to_string_lossy().into_owned());
    }
    let missing: Vec<&str> = SERVER_MODS.iter().copied().filter(|s| !crate::perf_bundle::has_mod(&names, s)).collect();
    let gv = [game_version];
    let found = futures::future::join_all(missing.iter().map(|s| crate::modrinth::project_versions(client, s, &["fabric"], &gv))).await;
    let mut jobs = Vec::new();
    let mut added = Vec::new();
    for (slug, res) in missing.iter().zip(found) {
        let Ok(list) = res else { continue };
        let Some(v) = crate::modrinth::best(list) else { continue };
        let Some(f) = v.primary_file() else { continue };
        jobs.push(DownloadJob { url: f.url.clone(), dest: mods_dir.join(&f.filename), sha1: Some(f.hashes.sha1.clone()), size: Some(f.size) });
        added.push((*slug).to_string());
    }
    crate::download::download_all(client, jobs, 4, None).await?;
    Ok(added)
}

/// Optional extras that can be switched on per server.
pub const ADDON_CHUNKY: &str = "chunky";
pub const ADDON_C2ME: &str = "c2me-fabric";
pub const ADDON_VOXY: &str = "voxy-server-side";

fn addon_loaders(kind: &ServerKind) -> &'static [&'static str] {
    match kind {
        ServerKind::Paper => &["paper", "spigot", "bukkit"],
        _ => &["fabric"],
    }
}

/// Files in the server's mods/plugins folder that belong to `slug`.
pub fn addon_files(dir: &std::path::Path, kind: &ServerKind, slug: &str) -> Vec<std::path::PathBuf> {
    let Some(sub) = kind.addon_dir() else { return vec![] };
    let Ok(rd) = std::fs::read_dir(dir.join(sub)) else { return vec![] };
    rd.flatten()
        .filter(|e| crate::perf_bundle::has_mod(&[e.file_name().to_string_lossy().into_owned()], slug))
        .map(|e| e.path())
        .collect()
}

/// Install (or remove) an optional extra. Returns Ok(false) when no build exists for this
/// server's version/type, so the UI can explain instead of failing.
pub async fn set_addon(client: &reqwest::Client, dir: &std::path::Path, kind: &ServerKind, game_version: &str, slug: &str, enabled: bool) -> Result<bool> {
    let Some(sub) = kind.addon_dir() else { return Err(Error::Other("vanilla servers can't run mods or plugins; switch to Fabric or Paper".into())) };
    if !enabled {
        for f in addon_files(dir, kind, slug) {
            tokio::fs::remove_file(f).await?;
        }
        return Ok(true);
    }
    if !addon_files(dir, kind, slug).is_empty() {
        return Ok(true);
    }
    let gv = [game_version];
    let list = crate::modrinth::project_versions(client, slug, addon_loaders(kind), &gv).await?;
    let Some(v) = crate::modrinth::best(list) else { return Ok(false) };
    let Some(f) = v.primary_file() else { return Ok(false) };
    let dest = dir.join(sub);
    tokio::fs::create_dir_all(&dest).await?;
    crate::download::download_one(client, &DownloadJob { url: f.url.clone(), dest: dest.join(&f.filename), sha1: Some(f.hashes.sha1.clone()), size: Some(f.size) }).await?;
    Ok(true)
}

pub struct ServerManager {
    paths: LauncherPaths,
    client: reqwest::Client,
}

fn servers_root(paths: &LauncherPaths) -> PathBuf {
    paths.root().join("servers")
}

pub fn server_dir(paths: &LauncherPaths, id: &str) -> PathBuf {
    servers_root(paths).join(id)
}

fn valid_id(id: &str) -> Result<()> {
    if id.is_empty() || id.contains(['/', '\\']) || id.contains("..") {
        return Err(Error::Other("invalid server id".into()));
    }
    Ok(())
}

impl ServerManager {
    pub fn new(paths: LauncherPaths, client: reqwest::Client) -> Self {
        Self { paths, client }
    }

    pub fn dir(&self, id: &str) -> PathBuf {
        server_dir(&self.paths, id)
    }

    pub async fn create(&self, req: CreateServer) -> Result<ServerConfig> {
        let slug: String = req.name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
        let slug = slug.split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-");
        let id = format!("{}-{}", if slug.is_empty() { "server" } else { &slug }, &uuid::Uuid::new_v4().simple().to_string()[..6]);
        let cfg = ServerConfig {
            id: id.clone(),
            name: req.name.trim().to_string(),
            kind: req.kind,
            game_version: req.game_version,
            memory_mb: req.memory_mb.unwrap_or(4096).clamp(1024, 65536),
            port: req.port.unwrap_or(25565),
            eula_accepted: false,
            created_at: Utc::now(),
            java_component: None,
            installed: false,
            auto_network: true,
            playit: false,
            auto_backup: true,
            restart_on_crash: true,
            stop_when_empty_mins: None,
            pending_pregen: req.pregen_radius.filter(|r| *r >= 256),
        };
        let dir = self.dir(&id);
        tokio::fs::create_dir_all(&dir).await?;
        if let Some(addons) = cfg.kind.addon_dir() {
            tokio::fs::create_dir_all(dir.join(addons)).await?;
        }
        let mut props = BTreeMap::new();
        props.insert("server-port".to_string(), cfg.port.to_string());
        props.insert("motd".to_string(), req.motd.unwrap_or_else(|| format!("{} \u{00a7}7(hosted with Ember)", cfg.name)));
        props.insert("max-players".to_string(), req.max_players.unwrap_or(10).to_string());
        props.insert("gamemode".to_string(), req.gamemode.unwrap_or_else(|| "survival".into()));
        props.insert("difficulty".to_string(), req.difficulty.unwrap_or_else(|| "normal".into()));
        props.insert("online-mode".to_string(), "true".into());
        if let Some(seed) = req.seed.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            props.insert("level-seed".to_string(), seed.replace(['\n', '\r'], ""));
        }
        props.insert("enable-command-block".to_string(), "false".into());
        // Lighter defaults that keep the game smooth for a home-hosted server.
        // Players choose their own render distance up to this.
        props.insert("view-distance".to_string(), "16".into());
        props.insert("simulation-distance".to_string(), "8".into());
        props.insert("sync-chunk-writes".to_string(), "false".into());
        props.insert("network-compression-threshold".to_string(), "256".into());
        write_properties(&dir.join("server.properties"), &props).await?;
        self.save(&cfg).await?;
        Ok(cfg)
    }

    pub async fn save(&self, cfg: &ServerConfig) -> Result<()> {
        valid_id(&cfg.id)?;
        tokio::fs::write(self.dir(&cfg.id).join("ember-server.json"), serde_json::to_vec_pretty(cfg)?).await?;
        Ok(())
    }

    pub async fn load(&self, id: &str) -> Result<ServerConfig> {
        valid_id(id)?;
        let b = tokio::fs::read(self.dir(id).join("ember-server.json")).await.map_err(|_| Error::NotFound(format!("server {id}")))?;
        Ok(serde_json::from_slice(&b)?)
    }

    pub async fn list(&self) -> Result<Vec<ServerConfig>> {
        let mut out = Vec::new();
        let Ok(mut rd) = tokio::fs::read_dir(servers_root(&self.paths)).await else { return Ok(out) };
        while let Some(e) = rd.next_entry().await? {
            if let Some(id) = e.file_name().to_str() {
                if let Ok(c) = self.load(id).await {
                    out.push(c);
                }
            }
        }
        out.sort_by_key(|b| std::cmp::Reverse(b.created_at));
        Ok(out)
    }

    pub async fn delete(&self, id: &str) -> Result<()> {
        valid_id(id)?;
        tokio::fs::remove_dir_all(self.dir(id)).await?;
        Ok(())
    }

    /// The player must accept Mojang's EULA themselves; this records their choice.
    pub async fn accept_eula(&self, id: &str) -> Result<ServerConfig> {
        let mut cfg = self.load(id).await?;
        tokio::fs::write(self.dir(id).join("eula.txt"), "# Accepted in Ember Launcher: https://aka.ms/MinecraftEULA\neula=true\n").await?;
        cfg.eula_accepted = true;
        self.save(&cfg).await?;
        Ok(cfg)
    }

    /// Download server.jar for the configured type and version. Idempotent.
    pub async fn install(&self, id: &str) -> Result<ServerConfig> {
        let mut cfg = self.load(id).await?;
        let dir = self.dir(id);
        let jar = dir.join("server.jar");

        // Java component comes from the vanilla version JSON for every server type.
        let manifest = fetch_manifest(&self.client).await?;
        let entry = supported_versions(&manifest)
            .into_iter()
            .find(|v| v.id == cfg.game_version)
            .ok_or_else(|| Error::UnsupportedVersion(cfg.game_version.clone()))?;
        let vjson: VersionJson = self.client.get(&entry.url).send().await?.error_for_status()?.json().await?;
        cfg.java_component = vjson.java_version.as_ref().map(|j| j.component.clone());
        let raw: serde_json::Value = self.client.get(&entry.url).send().await?.error_for_status()?.json().await?;

        match cfg.kind {
            ServerKind::Vanilla => {
                let s = &raw["downloads"]["server"];
                let url = s["url"].as_str().ok_or_else(|| Error::NotFound("vanilla server download".into()))?;
                download_one(&self.client, &DownloadJob { url: url.into(), dest: jar.clone(), sha1: s["sha1"].as_str().map(String::from), size: s["size"].as_u64() }).await?;
            }
            ServerKind::Fabric => {
                let loader = crate::fabric::latest_loader(&self.client, &cfg.game_version).await?;
                let installers: Vec<serde_json::Value> = self.client.get(format!("{}/versions/installer", crate::fabric::FABRIC_META)).send().await?.error_for_status()?.json().await?;
                let installer = installers.iter().find(|i| i["stable"].as_bool().unwrap_or(false)).or(installers.first()).and_then(|i| i["version"].as_str()).ok_or_else(|| Error::NotFound("Fabric installer".into()))?;
                let url = format!("{}/versions/loader/{}/{}/{}/server/jar", crate::fabric::FABRIC_META, cfg.game_version, loader, installer);
                let _ = tokio::fs::remove_file(&jar).await; // no hash available: always refresh
                download_one(&self.client, &DownloadJob { url, dest: jar.clone(), sha1: None, size: None }).await?;
                match ensure_server_mods(&self.client, &dir.join("mods"), &cfg.game_version).await {
                    Ok(added) if !added.is_empty() => tracing::info!(?added, "server performance mods"),
                    Ok(_) => {}
                    Err(e) => tracing::warn!(error = %e, "could not add server performance mods"),
                }
            }
            ServerKind::Paper => {
                let builds: Vec<serde_json::Value> = self
                    .client
                    .get(format!("https://fill.papermc.io/v3/projects/paper/versions/{}/builds", cfg.game_version))
                    .send()
                    .await?
                    .error_for_status()
                    .map_err(|_| Error::NotFound(format!("Paper for Minecraft {} (Paper is often a few days behind new releases)", cfg.game_version)))?
                    .json()
                    .await?;
                let build = builds.iter().find(|b| b["channel"] == "STABLE").or(builds.first()).ok_or_else(|| Error::NotFound(format!("Paper build for {}", cfg.game_version)))?;
                let dl = &build["downloads"]["server:default"];
                let url = dl["url"].as_str().ok_or_else(|| Error::NotFound("Paper download".into()))?;
                let sha256 = dl["checksums"]["sha256"].as_str().map(String::from);
                let _ = tokio::fs::remove_file(&jar).await;
                download_one(&self.client, &DownloadJob { url: url.into(), dest: jar.clone(), sha1: None, size: dl["size"].as_u64() }).await?;
                if let Some(expected) = sha256 {
                    let actual = hex::encode(Sha256::digest(tokio::fs::read(&jar).await?));
                    if !actual.eq_ignore_ascii_case(&expected) {
                        let _ = tokio::fs::remove_file(&jar).await;
                        return Err(Error::HashMismatch { path: jar.display().to_string(), expected, actual });
                    }
                }
            }
        }
        cfg.installed = true;
        self.save(&cfg).await?;
        Ok(cfg)
    }

    pub fn command(&self, cfg: &ServerConfig, java: PathBuf) -> (PathBuf, Vec<String>, PathBuf) {
        // Same min and max heap plus Aikar's G1 flags: the standard tuning for Minecraft servers.
        let big = cfg.memory_mb >= 12 * 1024;
        let mut args = vec![format!("-Xms{}m", cfg.memory_mb), format!("-Xmx{}m", cfg.memory_mb)];
        args.extend(AIKAR_FLAGS.iter().map(|s| s.to_string()));
        if big {
            args.extend(["-XX:G1NewSizePercent=40", "-XX:G1MaxNewSizePercent=50", "-XX:G1HeapRegionSize=16M", "-XX:G1ReservePercent=15"].map(String::from));
        } else {
            args.extend(["-XX:G1NewSizePercent=30", "-XX:G1MaxNewSizePercent=40", "-XX:G1HeapRegionSize=8M", "-XX:G1ReservePercent=20"].map(String::from));
        }
        args.extend(["-jar", "server.jar", "nogui"].map(String::from));
        if cfg.kind == ServerKind::Paper {
            args.insert(0, "-Dpaper.disableChannelLimit=true".into());
        }
        (java, args, self.dir(&cfg.id))
    }

    pub async fn properties(&self, id: &str) -> Result<BTreeMap<String, String>> {
        valid_id(id)?;
        read_properties(&self.dir(id).join("server.properties")).await
    }

    pub async fn set_properties(&self, id: &str, changes: BTreeMap<String, String>) -> Result<BTreeMap<String, String>> {
        valid_id(id)?;
        let path = self.dir(id).join("server.properties");
        let mut props = read_properties(&path).await?;
        for (k, v) in changes {
            if k.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') && !v.contains('\n') {
                props.insert(k, v);
            }
        }
        write_properties(&path, &props).await?;
        if let Some(port) = props.get("server-port").and_then(|p| p.parse::<u16>().ok()) {
            let mut cfg = self.load(id).await?;
            cfg.port = port;
            self.save(&cfg).await?;
        }
        Ok(props)
    }
}

pub async fn read_properties(path: &std::path::Path) -> Result<BTreeMap<String, String>> {
    let text = tokio::fs::read_to_string(path).await.unwrap_or_default();
    Ok(text
        .lines()
        .filter(|l| !l.trim_start().starts_with('#'))
        .filter_map(|l| l.split_once('=').map(|(k, v)| (k.trim().to_string(), v.to_string())))
        .collect())
}

pub async fn write_properties(path: &std::path::Path, props: &BTreeMap<String, String>) -> Result<()> {
    let mut s = String::from("# Minecraft server properties (managed by Ember Launcher)\n");
    for (k, v) in props {
        s.push_str(&format!("{k}={v}\n"));
    }
    tokio::fs::write(path, s).await?;
    Ok(())
}

/// This computer's address on the local network (no traffic is sent).
pub fn lan_ip() -> Option<String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("1.1.1.1:80").ok()?;
    sock.local_addr().ok().map(|a| a.ip().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn create_writes_properties_and_eula_needs_consent() {
        let tmp = tempfile::tempdir().unwrap();
        let m = ServerManager::new(LauncherPaths::new(tmp.path()), reqwest::Client::new());
        let cfg = m.create(CreateServer { name: "Friends SMP".into(), kind: ServerKind::Paper, game_version: "26.3".into(), memory_mb: None, port: Some(25570), motd: None, max_players: Some(8), gamemode: None, difficulty: None, pregen_radius: Some(2000), seed: Some("42".into()) }).await.unwrap();
        assert!(cfg.id.starts_with("friends-smp-"));
        assert_eq!(cfg.pending_pregen, Some(2000));
        assert!(std::fs::read_to_string(m.dir(&cfg.id).join("server.properties")).unwrap().contains("level-seed=42"));
        assert!(!cfg.eula_accepted);
        assert!(m.dir(&cfg.id).join("plugins").is_dir());
        let props = m.properties(&cfg.id).await.unwrap();
        assert_eq!(props["server-port"], "25570");
        assert_eq!(props["max-players"], "8");
        assert!(!m.dir(&cfg.id).join("eula.txt").exists());
        let cfg = m.accept_eula(&cfg.id).await.unwrap();
        assert!(cfg.eula_accepted);
        let changed = m.set_properties(&cfg.id, BTreeMap::from([("server-port".into(), "25600".into()), ("bad\nkey".into(), "x".into())])).await.unwrap();
        assert_eq!(changed["server-port"], "25600");
        assert_eq!(m.load(&cfg.id).await.unwrap().port, 25600);
        assert!(!changed.contains_key("bad\nkey"));
        assert_eq!(m.list().await.unwrap().len(), 1);
    }
}
