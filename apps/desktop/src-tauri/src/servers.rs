//! Running hosted servers: start/stop/restart, the live dashboard data, automatic
//! backups, crash restarts, stop-when-empty, Chunky pre-generation, router setup and the
//! playit.gg tunnel.
use crate::state::{AppState, NetworkStatus, PlayitLive, RunningServer, Sample, ServerLive};
use launcher_core::server::{lan_ip, ServerConfig, ServerKind, ADDON_C2ME, ADDON_CHUNKY, ADDON_VOXY};
use launcher_core::{java, playit, server_world, Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServerLog {
    pub server_id: String,
    pub line: String,
}

fn say(app: &AppHandle, id: &str, line: impl Into<String>) {
    let line = line.into();
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(running) = state.running_servers.try_lock() {
            if let Some(r) = running.get(id) {
                if let Ok(mut l) = r.live.lock() {
                    l.on_line(&line);
                }
            }
        }
    }
    let _ = app.emit("server-log", ServerLog { server_id: id.to_string(), line });
}

/// Recent crash restarts per server, so a server that crashes on boot isn't restarted forever.
static CRASHES: StdMutex<Option<HashMap<String, Vec<Instant>>>> = StdMutex::new(None);

async fn send(app: &AppHandle, id: &str, command: &str) -> Result<()> {
    let state = app.state::<AppState>();
    let mut running = state.running_servers.lock().await;
    let srv = running.get_mut(id).ok_or_else(|| Error::Other("server isn't running".into()))?;
    let line = command.trim().trim_start_matches('/').replace(['\n', '\r'], " ");
    srv.stdin.write_all(format!("{line}\n").as_bytes()).await?;
    srv.stdin.flush().await?;
    Ok(())
}

fn playit_dir(state: &AppState) -> PathBuf {
    state.paths.root().join("playit")
}

fn playit_secret(state: &AppState) -> Option<String> {
    std::fs::read_to_string(playit_dir(state).join("secret.txt")).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn playitd_path(state: &AppState) -> PathBuf {
    let exe = if cfg!(windows) { "playitd.exe" } else { "playitd" };
    state.paths.bundled_resources().join("playit").join(exe)
}

/// Start a server and everything around it. Used by the Start button, Restart and crash recovery.
pub async fn start_server(app: AppHandle, id: String) -> Result<()> {
    let state = app.state::<AppState>();
    if state.running_servers.lock().await.contains_key(&id) {
        return Err(Error::Other("already running".into()));
    }
    let mut cfg = state.servers.load(&id).await?;
    if !cfg.eula_accepted {
        return Err(Error::Other("accept the Minecraft EULA first".into()));
    }
    let dir = state.servers.dir(&id);
    if !cfg.installed || tokio::fs::metadata(dir.join("server.jar")).await.is_err() {
        say(&app, &id, "[Ember] Downloading server files...");
        cfg = state.servers.install(&id).await?;
    }
    if cfg.pending_pregen.is_some() && server_kind_has_addons(&cfg.kind) && launcher_core::server::addon_files(&dir, &cfg.kind, ADDON_CHUNKY).is_empty() {
        say(&app, &id, "[Ember] Adding Chunky for world pre-generation...");
        let _ = launcher_core::server::set_addon(&state.client, &dir, &cfg.kind, &cfg.game_version, ADDON_CHUNKY, true).await;
    }
    // Daily backup, taken while the world is closed.
    if cfg.auto_backup && server_world::has_world(&dir) && server_world::last_backup_age(&dir).is_none_or(|age| age > 20 * 3600) {
        say(&app, &id, "[Ember] Taking the daily world backup...");
        let d = dir.clone();
        match tokio::task::spawn_blocking(move || server_world::backup(&d, "auto")).await {
            Ok(Ok(_)) => say(&app, &id, "[Ember] Backup saved."),
            Ok(Err(e)) => say(&app, &id, format!("[Ember] Backup failed: {e}")),
            Err(e) => say(&app, &id, format!("[Ember] Backup failed: {e}")),
        }
    }

    let component = cfg.java_component.clone().unwrap_or_else(|| "java-runtime-delta".into());
    let java = java::ensure_runtime(&state.client, &state.paths, &component, None).await?;
    let (java, args, cwd) = state.servers.command(&cfg, java);
    let mut cmd = tokio::process::Command::new(java);
    cmd.args(&args).current_dir(&cwd).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let mut child = cmd.spawn()?;
    let stdin = child.stdin.take().ok_or_else(|| Error::Other("no stdin".into()))?;
    let pid = child.id();
    let live = Arc::new(StdMutex::new(ServerLive { port: cfg.port, playit: PlayitLive { state: "off".into(), ..Default::default() }, ..Default::default() }));
    state.running_servers.lock().await.insert(id.clone(), RunningServer { stdin, started: Instant::now(), live: live.clone(), pid, playit_child: None });

    // Console output → dashboard state + UI.
    for stream in [child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Send + Unpin>), child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Send + Unpin>)] {
        let Some(stream) = stream else { continue };
        let (app, id, live) = (app.clone(), id.clone(), live.clone());
        tokio::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut l) = live.lock() {
                    l.on_line(&line);
                }
                let _ = app.emit("server-log", ServerLog { server_id: id.clone(), line });
            }
        });
    }

    spawn_sampler(app.clone(), id.clone(), live.clone(), pid, cfg.clone());
    spawn_network(app.clone(), id.clone(), live.clone(), cfg.clone());
    if cfg.playit {
        spawn_playit(app.clone(), id.clone(), live.clone(), cfg.port);
    }

    // Exit: clean up, and restart if it crashed.
    let (exit_app, exit_id) = (app.clone(), id.clone());
    tokio::spawn(async move {
        let code = child.wait().await.ok().and_then(|s| s.code());
        let (mut upnp, mut port, mut stopping, mut ready) = (false, 25565, false, false);
        if let Ok(mut l) = live.lock() {
            l.exited = true;
            upnp = l.network.upnp;
            port = l.port;
            stopping = l.stopping;
            ready = l.ready;
        }
        let state = exit_app.state::<AppState>();
        if let Some(mut r) = state.running_servers.lock().await.remove(&exit_id) {
            if let Some(mut c) = r.playit_child.take() {
                let _ = c.kill().await;
            }
        }
        if upnp {
            let _ = launcher_core::net::close_port(port).await;
        }
        let _ = exit_app.emit("server-exit", serde_json::json!({ "serverId": exit_id, "code": code }));
        let crashed = !stopping && code != Some(0);
        if crashed {
            let cfg = state.servers.load(&exit_id).await.ok();
            if cfg.as_ref().is_some_and(|c| c.restart_on_crash) {
                let recent = {
                    let mut g = CRASHES.lock().unwrap_or_else(|e| e.into_inner());
                    let list = g.get_or_insert_with(HashMap::new).entry(exit_id.clone()).or_default();
                    list.retain(|t| t.elapsed() < Duration::from_secs(600));
                    list.push(Instant::now());
                    list.len()
                };
                if recent <= 2 && ready {
                    say(&exit_app, &exit_id, format!("[Ember] The server stopped unexpectedly (code {}). Restarting in 5 seconds...", code.map(|c| c.to_string()).unwrap_or_else(|| "?".into())));
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    if let Err(e) = start_boxed(exit_app.clone(), exit_id.clone()).await {
                        say(&exit_app, &exit_id, format!("[Ember] Couldn't restart: {e}"));
                    }
                } else {
                    say(&exit_app, &exit_id, "[Ember] The server stopped unexpectedly. It wasn't restarted automatically because it failed again soon after starting (or before it finished starting); check the console above for the error.");
                }
            }
        }
    });
    Ok(())
}

/// Boxed so the crash-restart path (which calls back into start_server) has a known, Send type.
fn start_boxed(app: AppHandle, id: String) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send>> {
    Box::pin(start_server(app, id))
}

fn server_kind_has_addons(k: &ServerKind) -> bool {
    k.addon_dir().is_some()
}

/// CPU/memory/player samples every 2s, plus: pre-generation once ready, and stop-when-empty.
fn spawn_sampler(app: AppHandle, id: String, live: Arc<StdMutex<ServerLive>>, pid: Option<u32>, cfg: ServerConfig) {
    tokio::spawn(async move {
        use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
        let mut sys = System::new();
        let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f32;
        let start = Instant::now();
        let mut last_seen_player = Instant::now();
        let mut pregen_sent = false;
        loop {
            let (cpu, mem) = match pid {
                Some(pid) => {
                    let pid = Pid::from_u32(pid);
                    sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), true, ProcessRefreshKind::nothing().with_cpu().with_memory());
                    sys.process(pid).map(|p| (p.cpu_usage() / cores, p.memory() / 1_048_576)).unwrap_or((0.0, 0))
                }
                None => (0.0, 0),
            };
            let (ready, players) = {
                let Ok(mut l) = live.lock() else { break };
                if l.exited {
                    break;
                }
                if l.samples.len() >= ServerLive::MAX_SAMPLES {
                    l.samples.pop_front();
                }
                let players = l.players.len() as u32;
                l.samples.push_back(Sample { t: start.elapsed().as_secs(), cpu: cpu.clamp(0.0, 100.0), memory_mb: mem, players });
                (l.ready, players)
            };
            if players > 0 || !ready {
                last_seen_player = Instant::now();
            }
            if ready && !pregen_sent {
                pregen_sent = true;
                if let Some(radius) = cfg.pending_pregen {
                    run_pregen(&app, &id, radius).await;
                }
            }
            if let Some(mins) = cfg.stop_when_empty_mins.filter(|m| *m > 0) {
                let busy = live.lock().map(|l| l.pregen.as_ref().is_some_and(|p| p.state == "running")).unwrap_or(false);
                if ready && !busy && last_seen_player.elapsed() > Duration::from_secs(mins as u64 * 60) {
                    say(&app, &id, format!("[Ember] Nobody has been online for {mins} minutes, stopping the server to save resources."));
                    if let Ok(mut l) = live.lock() {
                        l.stopping = true;
                    }
                    let _ = send(&app, &id, "stop").await;
                    last_seen_player = Instant::now();
                }
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}

async fn run_pregen(app: &AppHandle, id: &str, radius: u32) {
    say(app, id, format!("[Ember] Pre-generating {radius} blocks around spawn. Playing during this is fine but slower."));
    for c in ["chunky quiet 10", "chunky spawn", "chunky shape square", &format!("chunky radius {radius}"), "chunky start", "chunky confirm"] {
        let _ = send(app, id, c).await;
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    let state = app.state::<AppState>();
    if let Ok(mut cfg) = state.servers.load(id).await {
        cfg.pending_pregen = None;
        let _ = state.servers.save(&cfg).await;
    }
}

/// Router port-forward (UPnP) and public address.
fn spawn_network(app: AppHandle, _id: String, live: Arc<StdMutex<ServerLive>>, cfg: ServerConfig) {
    tokio::spawn(async move {
        let client = app.state::<AppState>().client.clone();
        if let Ok(mut l) = live.lock() {
            l.network = NetworkStatus { checking: true, lan_ip: lan_ip(), ..Default::default() };
        }
        let port = cfg.port;
        let (forward, public) = if cfg.auto_network {
            tokio::join!(launcher_core::net::open_port(port), launcher_core::net::public_ip(&client))
        } else {
            (Err(Error::Other("automatic router setup is off for this server".into())), launcher_core::net::public_ip(&client).await)
        };
        let shared = forward.as_ref().ok().and_then(|f| f.external_ip.as_deref()).is_some_and(launcher_core::net::is_shared_address);
        let public = forward.as_ref().ok().and_then(|f| f.external_ip.clone()).filter(|ip| !launcher_core::net::is_shared_address(ip)).or(public);
        if let Ok(mut l) = live.lock() {
            l.network.checking = false;
            l.network.public_ip = public;
            l.network.upnp = forward.is_ok();
            l.network.upnp_error = forward.err().map(|e| e.to_string());
            l.network.shared_ip = shared;
        }
    });
}

/// Run the playit.gg agent and make sure this server has a tunnel.
fn spawn_playit(app: AppHandle, id: String, live: Arc<StdMutex<ServerLive>>, port: u16) {
    tokio::spawn(async move {
        let state = app.state::<AppState>();
        let set = |st: &str, address: Option<String>, error: Option<String>| {
            if let Ok(mut l) = live.lock() {
                l.playit = PlayitLive { state: st.into(), address, error };
            }
        };
        set("starting", None, None);
        let Some(secret) = playit_secret(&state) else {
            set("error", None, Some("playit.gg isn't connected yet. Open Invite friends to connect it.".into()));
            return;
        };
        let bin = playitd_path(&state);
        if !bin.exists() {
            set("error", None, Some("this build of Ember doesn't include the playit.gg program. Update Ember, or use the manual steps in Invite friends.".into()));
            return;
        }
        let dir = playit_dir(&state);
        let mut cmd = tokio::process::Command::new(&bin);
        cmd.arg("--secret-path").arg(dir.join("secret.txt")).arg("-l").arg(dir.join("playit.log"));
        #[cfg(windows)]
        cmd.arg("--socket-path").arg(format!(r"\\.\pipe\ember-playit-{}", std::process::id()));
        #[cfg(not(windows))]
        cmd.arg("--socket-path").arg(dir.join("playit.sock"));
        cmd.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).kill_on_drop(true);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        match cmd.spawn() {
            Ok(child) => {
                let mut running = state.running_servers.lock().await;
                match running.get_mut(&id) {
                    Some(r) => r.playit_child = Some(child),
                    None => return, // server already stopped; dropping kills the agent
                }
            }
            Err(e) => {
                set("error", None, Some(format!("couldn't start the playit.gg program: {e}")));
                return;
            }
        }
        if let Err(e) = playit::ensure_tunnel(&state.client, &secret, &id, port).await {
            set("error", None, Some(e.to_string()));
            return;
        }
        // The address appears once playit assigns it (usually within seconds).
        for _ in 0..60 {
            if live.lock().map(|l| l.exited).unwrap_or(true) {
                return;
            }
            match playit::tunnel_for(&state.client, &secret, &id).await {
                Ok(Some(t)) if t.address.is_some() => {
                    let addr = t.address.clone();
                    set("online", addr.clone(), None);
                    if let Some(a) = addr {
                        say(&app, &id, format!("[Ember] playit.gg is ready. Friends can join at {a}"));
                    }
                    return;
                }
                Ok(_) => {}
                Err(e) => set("starting", None, Some(e.to_string())),
            }
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
        set("error", None, Some("playit.gg didn't give an address in time; check playit.gg/account/tunnels".into()));
    });
}

// ------------------------------------------------------------------ commands

#[tauri::command]
pub async fn server_start(app: AppHandle, id: String) -> Result<()> {
    start_server(app, id).await
}

#[tauri::command]
pub async fn server_command(app: AppHandle, id: String, command: String) -> Result<()> {
    send(&app, &id, &command).await
}

async fn stop_and_wait(app: &AppHandle, id: &str) -> Result<()> {
    let state = app.state::<AppState>();
    let pid = {
        let running = state.running_servers.lock().await;
        let Some(r) = running.get(id) else { return Ok(()) };
        if let Ok(mut l) = r.live.lock() {
            l.stopping = true;
        }
        r.pid
    };
    send(app, id, "stop").await?;
    // Saving a big world can take a while; force it after 60 seconds.
    for i in 0..240 {
        if !state.running_servers.lock().await.contains_key(id) {
            return Ok(());
        }
        if i == 239 {
            if let Some(pid) = pid {
                let mut sys = sysinfo::System::new();
                let p = sysinfo::Pid::from_u32(pid);
                sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[p]), true);
                if let Some(proc_) = sys.process(p) {
                    proc_.kill();
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn server_stop(app: AppHandle, id: String) -> Result<()> {
    let app2 = app.clone();
    let id2 = id.clone();
    // Return right away; the UI follows the server-exit event.
    tokio::spawn(async move {
        let _ = stop_and_wait(&app2, &id2).await;
    });
    let state = app.state::<AppState>();
    if !state.running_servers.lock().await.contains_key(&id) {
        return Err(Error::Other("server isn't running".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn server_restart(app: AppHandle, id: String) -> Result<()> {
    say(&app, &id, "[Ember] Restarting...");
    stop_and_wait(&app, &id).await?;
    tokio::time::sleep(Duration::from_millis(500)).await;
    start_server(app, id).await
}

#[tauri::command]
pub async fn server_live(state: State<'_, AppState>, id: String) -> Result<Option<ServerLive>> {
    let running = state.running_servers.lock().await;
    Ok(running.get(&id).and_then(|r| r.live.lock().ok().map(|l| l.clone())))
}

#[tauri::command]
pub async fn server_log(state: State<'_, AppState>, id: String) -> Result<Vec<String>> {
    let running = state.running_servers.lock().await;
    Ok(running.get(&id).and_then(|r| r.live.lock().ok().map(|l| l.log.iter().cloned().collect())).unwrap_or_default())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPatch {
    name: Option<String>,
    memory_mb: Option<u32>,
    auto_network: Option<bool>,
    playit: Option<bool>,
    auto_backup: Option<bool>,
    restart_on_crash: Option<bool>,
    /// 0 = never
    stop_when_empty_mins: Option<u32>,
}

#[tauri::command]
pub async fn server_update(state: State<'_, AppState>, id: String, patch: ServerPatch) -> Result<ServerConfig> {
    let mut cfg = state.servers.load(&id).await?;
    if let Some(n) = patch.name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()) {
        cfg.name = n.chars().take(48).collect();
    }
    if let Some(m) = patch.memory_mb {
        cfg.memory_mb = m.clamp(1024, 64 * 1024);
    }
    if let Some(v) = patch.auto_network {
        cfg.auto_network = v;
    }
    if let Some(v) = patch.playit {
        cfg.playit = v;
    }
    if let Some(v) = patch.auto_backup {
        cfg.auto_backup = v;
    }
    if let Some(v) = patch.restart_on_crash {
        cfg.restart_on_crash = v;
    }
    if let Some(v) = patch.stop_when_empty_mins {
        cfg.stop_when_empty_mins = (v > 0).then_some(v);
    }
    state.servers.save(&cfg).await?;
    Ok(cfg)
}

// ---- world

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldInfo {
    level_name: String,
    exists: bool,
    size_mb: f64,
    info: launcher_core::nbt::LevelInfo,
    backups: Vec<server_world::Backup>,
    pending_pregen: Option<u32>,
}

async fn ensure_stopped(state: &AppState, id: &str) -> Result<()> {
    if state.running_servers.lock().await.contains_key(id) {
        return Err(Error::Other("stop the server first".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn server_world(state: State<'_, AppState>, id: String) -> Result<WorldInfo> {
    let cfg = state.servers.load(&id).await?;
    let dir = state.servers.dir(&cfg.id);
    tokio::task::spawn_blocking(move || {
        let level = server_world::level_name(&dir);
        let wdir = dir.join(&level);
        Ok(WorldInfo {
            exists: server_world::has_world(&dir),
            size_mb: server_world::world_dirs(&dir).iter().map(|d| server_world::size_mb(d)).sum(),
            info: std::fs::read(wdir.join("level.dat")).ok().map(|b| launcher_core::nbt::level_info(&b)).unwrap_or_default(),
            backups: server_world::list(&dir)?,
            level_name: level,
            pending_pregen: cfg.pending_pregen,
        })
    })
    .await
    .map_err(|e| Error::Other(e.to_string()))?
}

#[tauri::command]
pub async fn server_backup(state: State<'_, AppState>, app: AppHandle, id: String) -> Result<Option<server_world::Backup>> {
    let cfg = state.servers.load(&id).await?;
    let dir = state.servers.dir(&cfg.id);
    let running = state.running_servers.lock().await.contains_key(&id);
    if running {
        // Flush everything to disk and pause saving while we copy.
        let _ = send(&app, &id, "save-off").await;
        let _ = send(&app, &id, "save-all flush").await;
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
    let res = tokio::task::spawn_blocking(move || server_world::backup(&dir, "manual")).await.map_err(|e| Error::Other(e.to_string()))?;
    if running {
        let _ = send(&app, &id, "save-on").await;
    }
    res
}

#[tauri::command]
pub async fn server_restore(state: State<'_, AppState>, id: String, file: String) -> Result<()> {
    ensure_stopped(&state, &id).await?;
    let dir = state.servers.dir(&state.servers.load(&id).await?.id);
    tokio::task::spawn_blocking(move || server_world::restore(&dir, &file)).await.map_err(|e| Error::Other(e.to_string()))?
}

#[tauri::command]
pub async fn server_delete_backup(state: State<'_, AppState>, id: String, file: String) -> Result<()> {
    let dir = state.servers.dir(&state.servers.load(&id).await?.id);
    server_world::delete_backup(&dir, &file)
}

#[tauri::command]
pub async fn server_reset_world(state: State<'_, AppState>, id: String) -> Result<()> {
    ensure_stopped(&state, &id).await?;
    let dir = state.servers.dir(&state.servers.load(&id).await?.id);
    tokio::task::spawn_blocking(move || server_world::reset(&dir)).await.map_err(|e| Error::Other(e.to_string()))?
}

/// Copy a singleplayer world from an instance into the server.
#[tauri::command]
pub async fn server_import_world(state: State<'_, AppState>, id: String, instance_id: String, folder: String) -> Result<()> {
    ensure_stopped(&state, &id).await?;
    if folder.contains(['/', '\\']) || folder == ".." || folder.is_empty() {
        return Err(Error::Other("bad world name".into()));
    }
    let inst = state.instances.load(&instance_id).await?;
    let src = state.paths.instance(&inst.id).join("saves").join(&folder);
    let dir = state.servers.dir(&state.servers.load(&id).await?.id);
    tokio::task::spawn_blocking(move || server_world::import(&dir, &src)).await.map_err(|e| Error::Other(e.to_string()))?
}

#[tauri::command]
pub async fn server_open_backups(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    let dir = state.servers.dir(&state.servers.load(&id).await?.id).join("backups");
    tokio::fs::create_dir_all(&dir).await?;
    app.opener().open_path(dir.display().to_string(), None::<&str>).map_err(|e| Error::Other(e.to_string()))
}

#[tauri::command]
pub async fn server_players(state: State<'_, AppState>, id: String) -> Result<server_world::PlayerLists> {
    let dir = state.servers.dir(&state.servers.load(&id).await?.id);
    Ok(server_world::player_lists(&dir))
}

// ---- pre-generation

/// start (with radius) / pause / resume / cancel. When the server is off (or Chunky has
/// to be installed first) the job is queued for the next start: returns "queued".
#[tauri::command]
pub async fn server_pregen(app: AppHandle, state: State<'_, AppState>, id: String, action: String, radius: Option<u32>) -> Result<String> {
    let mut cfg = state.servers.load(&id).await?;
    let dir = state.servers.dir(&cfg.id);
    let running = state.running_servers.lock().await.contains_key(&id);
    match action.as_str() {
        "start" => {
            let radius = radius.unwrap_or(3000).clamp(256, 30_000);
            let had_chunky = !launcher_core::server::addon_files(&dir, &cfg.kind, ADDON_CHUNKY).is_empty();
            if cfg.kind.addon_dir().is_none() {
                return Err(Error::Other("pre-generation needs a Fabric or Paper server".into()));
            }
            if !had_chunky && !launcher_core::server::set_addon(&state.client, &dir, &cfg.kind, &cfg.game_version, ADDON_CHUNKY, true).await? {
                return Err(Error::Other(format!("Chunky isn't available for {} yet", cfg.game_version)));
            }
            if running && had_chunky {
                run_pregen(&app, &id, radius).await;
                Ok("started".into())
            } else {
                cfg.pending_pregen = Some(radius);
                state.servers.save(&cfg).await?;
                Ok(if running { "restart".into() } else { "queued".into() })
            }
        }
        "pause" | "continue" | "cancel" if running => {
            send(&app, &id, &format!("chunky {action}")).await?;
            if action == "cancel" {
                tokio::time::sleep(Duration::from_millis(300)).await;
                send(&app, &id, "chunky confirm").await?;
            }
            Ok("ok".into())
        }
        "cancel" => {
            cfg.pending_pregen = None;
            state.servers.save(&cfg).await?;
            Ok("ok".into())
        }
        _ => Err(Error::Other("start the server first".into())),
    }
}

// ---- optional extras

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Addons {
    chunky: bool,
    c2me: bool,
    voxy: bool,
}

#[tauri::command]
pub async fn server_addons(state: State<'_, AppState>, id: String) -> Result<Addons> {
    let cfg = state.servers.load(&id).await?;
    let dir = state.servers.dir(&cfg.id);
    let has = |s| !launcher_core::server::addon_files(&dir, &cfg.kind, s).is_empty();
    Ok(Addons { chunky: has(ADDON_CHUNKY), c2me: has(ADDON_C2ME), voxy: has(ADDON_VOXY) })
}

/// Switch an extra on/off. Returns false when there's no build for this server's version.
#[tauri::command]
pub async fn server_set_addon(state: State<'_, AppState>, id: String, addon: String, enabled: bool) -> Result<bool> {
    let cfg = state.servers.load(&id).await?;
    let slug = match addon.as_str() {
        "c2me" => ADDON_C2ME,
        "voxy" => ADDON_VOXY,
        "chunky" => ADDON_CHUNKY,
        _ => return Err(Error::Other("unknown extra".into())),
    };
    if slug == ADDON_C2ME && cfg.kind != ServerKind::Fabric {
        return Err(Error::Other("faster world generation (C2ME) is for Fabric servers; Paper already generates on several cores".into()));
    }
    let dir = state.servers.dir(&cfg.id);
    if slug == ADDON_C2ME && enabled && server_world::has_world(&dir) {
        let d = dir.clone();
        tokio::task::spawn_blocking(move || server_world::backup(&d, "before-c2me")).await.map_err(|e| Error::Other(e.to_string()))??;
    }
    launcher_core::server::set_addon(&state.client, &dir, &cfg.kind, &cfg.game_version, slug, enabled).await
}

// ---- playit.gg account link

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayitStatus {
    connected: bool,
    /// The playit program ships with this build.
    bundled: bool,
}

#[tauri::command]
pub async fn playit_status(state: State<'_, AppState>) -> Result<PlayitStatus> {
    Ok(PlayitStatus { connected: playit_secret(&state).is_some(), bundled: playitd_path(&state).exists() })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayitClaim {
    code: String,
    url: String,
}

/// Begin linking: opens the playit.gg approval page in the browser.
#[tauri::command]
pub async fn playit_claim_start(app: AppHandle) -> Result<PlayitClaim> {
    let code = playit::new_claim_code();
    let url = playit::claim_url(&code);
    let _ = app.opener().open_url(&url, None::<&str>);
    Ok(PlayitClaim { code, url })
}

/// Poll while the user approves in the browser; saves the key once approved.
#[tauri::command]
pub async fn playit_claim_poll(state: State<'_, AppState>, code: String) -> Result<playit::ClaimStatus> {
    if !code.chars().all(|c| c.is_ascii_hexdigit()) || code.len() > 32 {
        return Err(Error::Other("bad code".into()));
    }
    let status = playit::claim_status(&state.client, &code).await?;
    if status == playit::ClaimStatus::Approved {
        let secret = playit::claim_exchange(&state.client, &code).await?;
        let dir = playit_dir(&state);
        tokio::fs::create_dir_all(&dir).await?;
        tokio::fs::write(dir.join("secret.txt"), secret).await?;
    }
    Ok(status)
}

#[tauri::command]
pub async fn playit_disconnect(state: State<'_, AppState>) -> Result<()> {
    let _ = tokio::fs::remove_file(playit_dir(&state).join("secret.txt")).await;
    Ok(())
}

/// This server's playit address (creating the tunnel if needed), without starting the server.
#[tauri::command]
pub async fn playit_tunnel(state: State<'_, AppState>, id: String) -> Result<Option<playit::Tunnel>> {
    let cfg = state.servers.load(&id).await?;
    let Some(secret) = playit_secret(&state) else { return Ok(None) };
    playit::ensure_tunnel(&state.client, &secret, &cfg.id, cfg.port).await?;
    playit::tunnel_for(&state.client, &secret, &cfg.id).await
}

// ---- mods / plugins installed on the server

fn addon_dir(cfg: &ServerConfig) -> Result<&'static str> {
    cfg.kind.addon_dir().ok_or_else(|| Error::Other("vanilla servers can't run mods or plugins".into()))
}

#[tauri::command]
pub async fn server_content(state: State<'_, AppState>, id: String) -> Result<Vec<launcher_core::content::ContentFile>> {
    let cfg = state.servers.load(&id).await?;
    let Ok(sub) = addon_dir(&cfg) else { return Ok(vec![]) };
    launcher_core::content::list_at(&state.servers.dir(&cfg.id), sub).await
}

#[tauri::command]
pub async fn server_content_enabled(state: State<'_, AppState>, id: String, file: String, enabled: bool) -> Result<String> {
    let cfg = state.servers.load(&id).await?;
    launcher_core::content::set_enabled_at(&state.servers.dir(&cfg.id), addon_dir(&cfg)?, &file, enabled).await
}

#[tauri::command]
pub async fn server_content_delete(state: State<'_, AppState>, id: String, file: String) -> Result<()> {
    let cfg = state.servers.load(&id).await?;
    launcher_core::content::delete_at(&state.servers.dir(&cfg.id), addon_dir(&cfg)?, &file).await
}
