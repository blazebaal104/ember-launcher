//! IPC commands for instances' content, profiles, favorites, modpacks and dedicated servers.
//! As in commands.rs, all input from the webview is validated before touching disk.
use crate::state::{AppState, RunningServer};
use launcher_core::content::{self, ContentFile, Favorite, Screenshot, World};
use launcher_core::download::{download_all, DownloadJob, Progress};
use launcher_core::instance::{InstanceConfig, InstancePatch};
use launcher_core::mrpack::{self, PackRequest, PackResult};
use launcher_core::profiles::{profile_from_options, GameProfile, ProfileStore};
use launcher_core::server::{lan_ip, CreateServer, ServerConfig};
use launcher_core::{java, Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

// ------------------------------------------------------------------ instances

#[tauri::command]
pub async fn update_instance(state: State<'_, AppState>, id: String, patch: InstancePatch) -> Result<InstanceConfig> {
    state.instances.update(&id, patch).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    total_memory_mb: u64,
    cpu_threads: usize,
    os: String,
}

#[tauri::command]
pub async fn system_info() -> Result<SystemInfo> {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    Ok(SystemInfo {
        total_memory_mb: sys.total_memory() / 1_048_576,
        cpu_threads: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4),
        os: std::env::consts::OS.into(),
    })
}

#[tauri::command]
pub async fn list_content(state: State<'_, AppState>, instance_id: String, dir: String) -> Result<Vec<ContentFile>> {
    let inst = state.instances.load(&instance_id).await?;
    content::list(&state.paths, &inst.id, &dir).await
}

#[tauri::command]
pub async fn set_content_enabled(state: State<'_, AppState>, instance_id: String, dir: String, file: String, enabled: bool) -> Result<String> {
    let inst = state.instances.load(&instance_id).await?;
    content::set_enabled(&state.paths, &inst.id, &dir, &file, enabled).await
}

#[tauri::command]
pub async fn delete_content(state: State<'_, AppState>, instance_id: String, dir: String, file: String) -> Result<()> {
    let inst = state.instances.load(&instance_id).await?;
    content::delete(&state.paths, &inst.id, &dir, &file).await
}

/// Copy files the user picked in a native dialog (paths come from the dialog plugin).
#[tauri::command]
pub async fn import_content(state: State<'_, AppState>, instance_id: String, dir: String, paths: Vec<PathBuf>) -> Result<usize> {
    let inst = state.instances.load(&instance_id).await?;
    content::import_files(&state.paths, &inst.id, &dir, &paths).await
}

#[tauri::command]
pub async fn list_worlds(state: State<'_, AppState>, instance_id: String) -> Result<Vec<World>> {
    let inst = state.instances.load(&instance_id).await?;
    content::worlds(&state.paths, &inst.id).await
}

#[tauri::command]
pub async fn list_screenshots(state: State<'_, AppState>, instance_id: String) -> Result<Vec<Screenshot>> {
    let inst = state.instances.load(&instance_id).await?;
    content::screenshots(&state.paths, &inst.id).await
}

// ------------------------------------------------------------------ favorites

#[tauri::command]
pub async fn favorites_list(state: State<'_, AppState>) -> Result<Vec<Favorite>> {
    Ok(content::load_favorites(&state.paths).await)
}

#[tauri::command]
pub async fn favorites_toggle(state: State<'_, AppState>, favorite: Favorite) -> Result<Vec<Favorite>> {
    content::toggle_favorite(&state.paths, favorite).await
}

// ------------------------------------------------------------------ game settings profiles

#[tauri::command]
pub async fn profiles_get(state: State<'_, AppState>) -> Result<ProfileStore> {
    Ok(state.profiles.lock().await.clone())
}

#[tauri::command]
pub async fn profile_save(state: State<'_, AppState>, profile: GameProfile) -> Result<ProfileStore> {
    let mut store = state.profiles.lock().await;
    let saved = store.upsert(profile);
    if store.default_profile.is_none() {
        store.default_profile = Some(saved.id);
    }
    store.save(&state.paths).await?;
    // Instances using this profile pick up the change on their next launch.
    for mut inst in state.instances.list().await? {
        if inst.game_profile.as_deref().is_some_and(|p| store.get(p).is_some()) && inst.profile_applied {
            inst.profile_applied = false;
            state.instances.save(&inst).await?;
        }
    }
    Ok(store.clone())
}

#[tauri::command]
pub async fn profile_delete(state: State<'_, AppState>, id: String) -> Result<ProfileStore> {
    let mut store = state.profiles.lock().await;
    store.remove(&id);
    store.save(&state.paths).await?;
    Ok(store.clone())
}

#[tauri::command]
pub async fn profile_set_default(state: State<'_, AppState>, id: Option<String>) -> Result<ProfileStore> {
    let mut store = state.profiles.lock().await;
    store.default_profile = id.filter(|i| store.get(i).is_some());
    store.save(&state.paths).await?;
    Ok(store.clone())
}

/// "Save this instance's in-game settings as a profile."
#[tauri::command]
pub async fn profile_from_instance(state: State<'_, AppState>, instance_id: String, name: String) -> Result<ProfileStore> {
    let inst = state.instances.load(&instance_id).await?;
    let text = tokio::fs::read_to_string(state.paths.instance(&inst.id).join("options.txt"))
        .await
        .map_err(|_| Error::Other("this instance has no settings yet: launch it once first".into()))?;
    let mut store = state.profiles.lock().await;
    store.upsert(profile_from_options(name.trim(), &text));
    store.save(&state.paths).await?;
    Ok(store.clone())
}

// ------------------------------------------------------------------ modpacks

#[tauri::command]
pub async fn install_modpack(app: AppHandle, state: State<'_, AppState>, req: PackRequest) -> Result<PackResult> {
    let mut req = req;
    if req.game_profile.is_none() {
        req.game_profile = state.profiles.lock().await.default_profile.clone();
    }
    let label = req.name.clone().unwrap_or_else(|| "modpack".into());
    let progress: Progress = Arc::new(move |done, total| {
        let _ = app.emit("pack-progress", serde_json::json!({ "name": label, "done": done, "total": total }));
    });
    mrpack::install(&state.client, &state.instances, req, Some(progress)).await
}

// ------------------------------------------------------------------ dedicated servers

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerView {
    #[serde(flatten)]
    config: ServerConfig,
    running: bool,
    uptime_secs: Option<u64>,
}

#[tauri::command]
pub async fn server_list(state: State<'_, AppState>) -> Result<Vec<ServerView>> {
    let running = state.running_servers.lock().await;
    Ok(state
        .servers
        .list()
        .await?
        .into_iter()
        .map(|c| {
            let r = running.get(&c.id);
            ServerView { running: r.is_some(), uptime_secs: r.map(|r| r.started.elapsed().as_secs()), config: c }
        })
        .collect())
}

#[tauri::command]
pub async fn server_create(state: State<'_, AppState>, req: CreateServer) -> Result<ServerConfig> {
    state.servers.create(req).await
}

#[tauri::command]
pub async fn server_delete(state: State<'_, AppState>, id: String) -> Result<()> {
    if state.running_servers.lock().await.contains_key(&id) {
        return Err(Error::Other("stop the server before deleting it".into()));
    }
    state.servers.delete(&id).await
}

#[tauri::command]
pub async fn server_accept_eula(state: State<'_, AppState>, id: String) -> Result<ServerConfig> {
    state.servers.accept_eula(&id).await
}

#[tauri::command]
pub async fn server_install(state: State<'_, AppState>, id: String) -> Result<ServerConfig> {
    state.servers.install(&id).await
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ServerLog {
    server_id: String,
    line: String,
}

#[tauri::command]
pub async fn server_start(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    if state.running_servers.lock().await.contains_key(&id) {
        return Err(Error::Other("already running".into()));
    }
    let mut cfg = state.servers.load(&id).await?;
    if !cfg.eula_accepted {
        return Err(Error::Other("accept the Minecraft EULA first".into()));
    }
    if !cfg.installed || tokio::fs::metadata(state.servers.dir(&id).join("server.jar")).await.is_err() {
        let _ = app.emit("server-log", ServerLog { server_id: id.clone(), line: "[Ember] Downloading server files...".into() });
        cfg = state.servers.install(&id).await?;
    }
    let component = cfg.java_component.clone().unwrap_or_else(|| "java-runtime-delta".into());
    let java = java::ensure_runtime(&state.client, &state.paths, &component, None).await?;
    let (java, args, cwd) = state.servers.command(&cfg, java);

    let mut cmd = tokio::process::Command::new(java);
    cmd.args(&args).current_dir(&cwd).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn()?;
    let stdin = child.stdin.take().ok_or_else(|| Error::Other("no stdin".into()))?;
    state.running_servers.lock().await.insert(id.clone(), RunningServer { stdin, started: std::time::Instant::now() });

    for stream in [child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Send + Unpin>), child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Send + Unpin>)] {
        let Some(stream) = stream else { continue };
        let app = app.clone();
        let id = id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("server-log", ServerLog { server_id: id.clone(), line });
            }
        });
    }
    let exit_app = app.clone();
    tokio::spawn(async move {
        let code = child.wait().await.ok().and_then(|s| s.code());
        if let Some(state) = tauri::Manager::try_state::<AppState>(&exit_app) {
            state.running_servers.lock().await.remove(&id);
        }
        let _ = exit_app.emit("server-exit", serde_json::json!({ "serverId": id, "code": code }));
    });
    Ok(())
}

/// Send a console command (without the leading slash), e.g. "op Steve".
#[tauri::command]
pub async fn server_command(state: State<'_, AppState>, id: String, command: String) -> Result<()> {
    let mut running = state.running_servers.lock().await;
    let srv = running.get_mut(&id).ok_or_else(|| Error::Other("server isn't running".into()))?;
    let line = command.trim().trim_start_matches('/').replace(['\n', '\r'], " ");
    srv.stdin.write_all(format!("{line}\n").as_bytes()).await?;
    srv.stdin.flush().await?;
    Ok(())
}

#[tauri::command]
pub async fn server_stop(state: State<'_, AppState>, id: String) -> Result<()> {
    server_command(state, id, "stop".into()).await
}

#[tauri::command]
pub async fn server_running(state: State<'_, AppState>) -> Result<Vec<String>> {
    Ok(state.running_servers.lock().await.keys().cloned().collect())
}

#[tauri::command]
pub async fn server_properties(state: State<'_, AppState>, id: String) -> Result<BTreeMap<String, String>> {
    state.servers.properties(&id).await
}

#[tauri::command]
pub async fn server_set_properties(state: State<'_, AppState>, id: String, changes: BTreeMap<String, String>) -> Result<BTreeMap<String, String>> {
    state.servers.set_properties(&id, changes).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFile {
    url: String,
    file_name: String,
    sha1: Option<String>,
    size: Option<u64>,
}

/// Install plugins (Paper) or mods (Fabric) into a server.
#[tauri::command]
pub async fn server_install_files(state: State<'_, AppState>, id: String, files: Vec<ServerFile>) -> Result<usize> {
    let cfg = state.servers.load(&id).await?;
    let dir = cfg.kind.addon_dir().ok_or_else(|| Error::Other("vanilla servers can't load plugins or mods".into()))?;
    let base = state.servers.dir(&id).join(dir);
    let mut jobs = Vec::new();
    for f in files {
        let host = url::Url::parse(&f.url).ok().and_then(|u| u.host_str().map(String::from)).unwrap_or_default();
        if !f.url.starts_with("https://") || !["cdn.modrinth.com", "edge.forgecdn.net", "mediafilez.forgecdn.net"].contains(&host.as_str()) {
            return Err(Error::Other(format!("refusing download from {host}")));
        }
        content::check_file_name(&f.file_name)?;
        jobs.push(DownloadJob { url: f.url, dest: base.join(&f.file_name), sha1: f.sha1, size: f.size });
    }
    let n = jobs.len();
    download_all(&state.client, jobs, 6, None).await?;
    Ok(n)
}

#[tauri::command]
pub async fn server_open_folder(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    let cfg = state.servers.load(&id).await?;
    app.opener().open_path(state.servers.dir(&cfg.id).display().to_string(), None::<&str>).map_err(|e| Error::Other(e.to_string()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    lan_ip: Option<String>,
}

#[tauri::command]
pub async fn network_info() -> Result<NetworkInfo> {
    Ok(NetworkInfo { lan_ip: lan_ip() })
}
