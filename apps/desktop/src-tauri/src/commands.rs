//! IPC commands. Everything the webview sends is treated as untrusted input:
//! ids are validated, download hosts are allow-listed, file names are sanitised.
use crate::state::{AppState, CURSEFORGE_KEY};
use launcher_core::auth::is_valid_client_id;
use launcher_core::settings::LauncherSettings;
use launcher_core::download::{download_all, DownloadJob, Progress};
use launcher_core::instance::{CreateInstance, HookReport, InstanceConfig};
use launcher_core::launch::{self, LaunchIdentity, LaunchOptions};
use launcher_core::versions::{fetch_manifest, supported_versions, GameVersion};
use launcher_core::{install, java, Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncBufReadExt, BufReader};

// ------------------------------------------------------------------ versions & instances

#[tauri::command]
pub async fn list_versions(state: State<'_, AppState>) -> Result<Vec<GameVersion>> {
    Ok(supported_versions(&fetch_manifest(&state.client).await?))
}

#[tauri::command]
pub async fn list_instances(state: State<'_, AppState>) -> Result<Vec<InstanceConfig>> {
    state.instances.list().await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    instance: InstanceConfig,
    reports: Vec<HookReport>,
}

/// Runs the hook pipeline, so the performance bundle is injected automatically.
#[tauri::command]
pub async fn create_instance(state: State<'_, AppState>, req: CreateInstance) -> Result<Created> {
    let (instance, reports) = state.instances.create(req).await?;
    Ok(Created { instance, reports })
}

#[tauri::command]
pub async fn delete_instance(state: State<'_, AppState>, id: String) -> Result<()> {
    state.instances.delete(&id).await
}

#[tauri::command]
pub async fn open_instance_folder(app: AppHandle, state: State<'_, AppState>, id: String, sub: Option<String>) -> Result<()> {
    let inst = state.instances.load(&id).await?; // validates the id exists
    let mut dir = state.paths.instance(&inst.id);
    if let Some(s) = sub {
        if launcher_core::paths::INSTANCE_DIRS.contains(&s.as_str()) {
            dir = dir.join(s);
        } else if let Some(world) = s.strip_prefix("saves/").filter(|w| !w.is_empty() && !w.contains(['/', '\\']) && *w != "..") {
            // One world's folder.
            dir = dir.join("saves").join(world);
        }
    }
    app.opener().open_path(dir.display().to_string(), None::<&str>).map_err(|e| Error::Other(e.to_string()))
}

// ------------------------------------------------------------------ auth

// ------------------------------------------------------------------ settings

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    #[serde(flatten)]
    settings: LauncherSettings,
    /// True when sign-in can be attempted (a valid client id is configured somewhere).
    sign_in_configured: bool,
    /// True when the id comes from the build, not from the user's settings.
    using_build_default: bool,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<SettingsView> {
    let settings = state.settings.lock().await.clone();
    let effective = state.client_id().await;
    Ok(SettingsView {
        using_build_default: settings.msa_client_id.as_deref().unwrap_or("").trim().is_empty() && effective.is_some(),
        sign_in_configured: effective.as_deref().map(is_valid_client_id).unwrap_or(false),
        settings,
    })
}

#[tauri::command]
pub async fn save_settings(state: State<'_, AppState>, settings: LauncherSettings) -> Result<SettingsView> {
    let mut settings = settings;
    if let Some(id) = settings.msa_client_id.as_mut() {
        *id = id.trim().to_string();
        if !id.is_empty() && !is_valid_client_id(id) {
            return Err(Error::AppMisconfigured("that doesn't look like a client ID. It has the form xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".into()));
        }
    }
    let changed_id = state.settings.lock().await.msa_client_id != settings.msa_client_id;
    settings.save(&state.paths).await?;
    *state.settings.lock().await = settings;
    if changed_id {
        // Tokens belong to the old app; the next sign-in uses the new one.
        *state.account.lock().await = None;
    }
    get_settings(state).await
}

// ------------------------------------------------------------------ sign-in
// Accounts (sign-in, switching, profile, skins...) live in accounts.rs.
pub(crate) use crate::accounts::ensure_account;

// ------------------------------------------------------------------ launching

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LaunchProgress {
    instance_id: String,
    stage: &'static str,
    done: u64,
    total: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GameLog {
    instance_id: String,
    line: String,
}

#[tauri::command]
pub async fn launch_instance(app: AppHandle, state: State<'_, AppState>, id: String, server: Option<String>, world: Option<String>) -> Result<()> {
    if state.running_games.lock().await.contains_key(&id) {
        return Err(Error::Other("this instance is already running".into()));
    }
    let mut inst = state.instances.load(&id).await?;
    let account = ensure_account(&state).await?;
    let settings = state.settings.lock().await.clone();

    let emit = |stage: &'static str| {
        let app = app.clone();
        let id = id.clone();
        Arc::new(move |done, total| {
            let _ = app.emit("launch-progress", LaunchProgress { instance_id: id.clone(), stage, done, total });
        }) as Progress
    };

    let prepared = install::prepare(&state.client, &state.paths, &inst, Some(emit("files"))).await?;
    // Fabric/Quilt: put back Fabric API (and add Cloth Config / Mod Menu once) if missing.
    match launcher_core::perf_bundle::ensure_essentials(&state.client, &state.paths.instance(&inst.id), &inst).await {
        Ok(added) if !added.is_empty() => tracing::info!(?added, "added essential mods"),
        Ok(_) => {}
        Err(e) => tracing::warn!(error = %e, "could not check essential mods (offline?)"),
    }
    // In-game menu: install into older instances, update after an Ember update, honour the toggle.
    // Prefer the separately published menu (updates without an app update); falls back to
    // the copy bundled with the app when offline or when no build is published.
    let newer = if inst.overlay {
        launcher_core::overlay_remote::jar_for(&state.client, &state.paths.root().join("overlay-cache"), &inst.game_version).await
    } else {
        None
    };
    match launcher_core::perf_bundle::ensure_overlay(&state.paths.bundled_resources(), &state.paths.instance(&inst.id), &inst, newer).await {
        Ok(s) => tracing::info!(state = ?s, "ember overlay"),
        Err(e) => tracing::warn!(error = %e, "could not update the in-game menu"),
    }
    // The in-game menu uses the launcher's theme and accent colour.
    {
        let ui = state.settings.lock().await.ui.clone().unwrap_or_default();
        let pick = |k: &str| ui.get(k).cloned().unwrap_or(serde_json::Value::Null);
        let theme = serde_json::json!({
            "theme": pick("theme"),
            "accent": pick("accent"),
            "glass": pick("glass"),
            "glassStrength": pick("glassStrength"),
        });
        let dir = state.paths.instance(&inst.id).join("config");
        if tokio::fs::create_dir_all(&dir).await.is_ok() {
            let _ = tokio::fs::write(dir.join("ember-theme.json"), serde_json::to_vec_pretty(&theme).unwrap_or_default()).await;
        }
    }
    let component = prepared.json.java_version.as_ref().map(|j| j.component.clone()).unwrap_or_else(|| "java-runtime-delta".into());
    let java = java::ensure_runtime(&state.client, &state.paths, &component, Some(emit("java"))).await?;

    // Game settings profile → options.txt (once, or every launch if the user asked).
    if let Some(pid) = inst.game_profile.clone() {
        if !inst.profile_applied || inst.profile_every_launch {
            let profile = state.profiles.lock().await.get(&pid).cloned();
            if let Some(profile) = profile {
                let jar = state.paths.version_jar(&prepared.vanilla_id);
                match launcher_core::profiles::apply_to_instance(&state.paths.instance(&inst.id), &profile, &jar).await {
                    Ok(true) => inst.profile_applied = true,
                    Ok(false) => {}
                    Err(e) => tracing::warn!(error = %e, "could not apply game profile"),
                }
            }
        }
    }

    // World packs: switch on queued resource packs / shader, and copy global data packs into worlds.
    let dir = state.paths.instance(&inst.id);
    if let Err(e) = launcher_core::world_packs::apply_pending(&dir).await {
        tracing::warn!(error = %e, "could not apply queued packs");
    }
    if let Err(e) = launcher_core::world_packs::sync_global_datapacks(&dir).await {
        tracing::warn!(error = %e, "could not copy data packs into worlds");
    }

    let mut run_inst = inst.clone();
    if let Some(extra) = settings.default_jvm_args.clone() {
        run_inst.jvm_args.splice(0..0, extra);
    }
    let who = LaunchIdentity { username: account.username.clone(), uuid: account.uuid.clone(), access_token: account.mc_access_token.clone(), xuid: account.xuid.clone() };
    let cmd = launch::build(&state.paths, &run_inst, &prepared, java, &who, &LaunchOptions { quick_play_server: server, quick_play_singleplayer: world.filter(|w| !w.contains(['/', '\\']) && w != ".."), ..Default::default() });
    let mut child = launch::spawn(&cmd)?;
    if let Some(pid) = child.id() {
        state.running_games.lock().await.insert(id.clone(), pid);
    }

    // Stream logs (the access token is never logged: it only exists in argv).
    for (stream, is_err) in [(child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Send + Unpin>), false), (child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Send + Unpin>), true)] {
        let Some(stream) = stream else { continue };
        let app = app.clone();
        let id = id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let line = if is_err { format!("[stderr] {line}") } else { line };
                let _ = app.emit("game-log", GameLog { instance_id: id.clone(), line });
            }
        });
    }

    let started = std::time::Instant::now();
    let launched_at = std::time::SystemTime::now();
    let exit_app = app.clone();
    let exit_id = id.clone();
    let instance_dir = state.paths.instance(&inst.id);
    let session_base = crate::stats::Session {
        start: launched_at.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0),
        minutes: 0,
        account: account.uuid.clone(),
        instance: inst.id.clone(),
        instance_name: inst.name.clone(),
        version: inst.game_version.clone(),
        loader: format!("{:?}", inst.loader),
    };
    tokio::spawn(async move {
        let code = child.wait().await.ok().and_then(|s| s.code());
        let minutes = started.elapsed().as_secs() / 60;
        // Look for a crash report written during this session.
        let crash = newest_crash_report(&instance_dir, launched_at).await;
        if let Some(state) = exit_app.try_state::<AppState>() {
            state.running_games.lock().await.remove(&exit_id);
            if let Ok(mut cfg) = state.instances.load(&exit_id).await {
                cfg.play_minutes += minutes;
                let _ = state.instances.save(&cfg).await;
            }
            // Account page: play time per account and the servers you joined.
            let servers = crate::stats::servers_in_log(&instance_dir).await;
            crate::stats::record(&state, crate::stats::Session { minutes, ..session_base }, servers).await;
        }
        if let Some(w) = exit_app.get_webview_window("main") {
            let _ = w.unminimize();
        }
        let _ = exit_app.emit("game-exit", serde_json::json!({ "instanceId": exit_id, "code": code, "minutes": minutes, "crashReport": crash }));
    });

    inst.last_played = Some(launcher_core::chrono::Utc::now());
    state.instances.save(&inst).await?;
    let _ = app.emit("launch-progress", LaunchProgress { instance_id: id, stage: "running", done: 1, total: 1 });

    match settings.on_launch.as_deref() {
        Some("minimize") => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.minimize();
            }
        }
        Some("close") => app.exit(0),
        _ => {}
    }
    Ok(())
}

async fn newest_crash_report(instance_dir: &std::path::Path, since: std::time::SystemTime) -> Option<String> {
    let mut rd = tokio::fs::read_dir(instance_dir.join("crash-reports")).await.ok()?;
    let mut best: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    while let Ok(Some(e)) = rd.next_entry().await {
        let Ok(m) = e.metadata().await else { continue };
        let Ok(t) = m.modified() else { continue };
        if t >= since && best.as_ref().map(|(bt, _)| t > *bt).unwrap_or(true) {
            best = Some((t, e.path()));
        }
    }
    best.map(|(_, p)| p.display().to_string())
}

/// Force-stop a running game (like closing its window).
#[tauri::command]
pub async fn stop_instance(state: State<'_, AppState>, id: String) -> Result<()> {
    let pid = state.running_games.lock().await.get(&id).copied().ok_or_else(|| Error::Other("not running".into()))?;
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]), true);
    if let Some(p) = sys.process(sysinfo::Pid::from_u32(pid)) {
        p.kill();
    }
    Ok(())
}

// ------------------------------------------------------------------ content installation

/// Files must come from these hosts (Modrinth CDN, CurseForge CDN).
const DOWNLOAD_HOSTS: &[&str] = &["cdn.modrinth.com", "edge.forgecdn.net", "mediafilez.forgecdn.net"];
const CONTENT_DIRS: &[&str] = &["mods", "resourcepacks", "shaderpacks", "datapacks"];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallFile {
    url: String,
    file_name: String,
    sha1: Option<String>,
    size: Option<u64>,
    /// "mods" | "resourcepacks" | "shaderpacks" | "datapacks"
    #[serde(default = "mods")]
    dir: String,
}
fn mods() -> String {
    "mods".into()
}

/// Used by Discover installs and by the Transfer Tool's one-click install.
#[tauri::command]
pub async fn install_files(app: AppHandle, state: State<'_, AppState>, instance_id: String, files: Vec<InstallFile>) -> Result<usize> {
    let inst = state.instances.load(&instance_id).await?;
    let base = state.paths.instance(&inst.id);
    let mut jobs = Vec::with_capacity(files.len());
    for f in files {
        let url = url::Url::parse(&f.url).map_err(|_| Error::Other(format!("bad url {}", f.url)))?;
        if url.scheme() != "https" || !DOWNLOAD_HOSTS.contains(&url.host_str().unwrap_or("")) {
            return Err(Error::Other(format!("refusing download from {}", url.host_str().unwrap_or("?"))));
        }
        // "world:<folder>" puts data packs straight into that world's datapacks folder.
        let target = if let Some(world) = f.dir.strip_prefix("world:") {
            launcher_core::content::check_file_name(world)?;
            if tokio::fs::metadata(base.join("saves").join(world).join("level.dat")).await.is_err() {
                return Err(Error::Other(format!("world {world} not found")));
            }
            base.join("saves").join(world).join("datapacks")
        } else if CONTENT_DIRS.contains(&f.dir.as_str()) {
            base.join(&f.dir)
        } else {
            return Err(Error::Other(format!("invalid target folder {}", f.dir)));
        };
        let name = sanitize_file_name(&f.file_name).ok_or_else(|| Error::Other(format!("invalid file name {}", f.file_name)))?;
        jobs.push(DownloadJob { url: f.url, dest: target.join(name), sha1: f.sha1, size: f.size });
    }
    let n = jobs.len();
    let id = instance_id.clone();
    let progress: Progress = Arc::new(move |done, total| {
        let _ = app.emit("install-progress", serde_json::json!({ "instanceId": id, "done": done, "total": total }));
    });
    download_all(&state.client, jobs, 8, Some(progress)).await?;
    Ok(n)
}

fn sanitize_file_name(name: &str) -> Option<String> {
    let n = name.rsplit(['/', '\\']).next()?.trim();
    let ok = !n.is_empty() && n != "." && n != ".." && n.chars().all(|c| c.is_ascii_alphanumeric() || "._-+ ()[]".contains(c));
    ok.then(|| n.to_string())
}

// ------------------------------------------------------------------ CurseForge proxy

const CF_ALLOWED: &[(&str, &str)] = &[
    ("GET", "/v1/mods/search"),
    ("GET", "/v1/mods/"), // /v1/mods/{id}/files
    ("POST", "/v1/mods"),
    ("POST", "/v1/fingerprints/432"),
];

/// Read-only CurseForge proxy so the API key never reaches the webview.
#[tauri::command]
pub async fn curseforge_request(state: State<'_, AppState>, method: String, path: String, body: Option<serde_json::Value>) -> Result<serde_json::Value> {
    let key = CURSEFORGE_KEY.ok_or_else(|| Error::Other("CurseForge is not configured in this build".into()))?;
    let allowed = CF_ALLOWED.iter().any(|(m, p)| *m == method && (path == *p || (p.ends_with('/') && path.starts_with(p))));
    if !allowed || path.contains("..") {
        return Err(Error::Other(format!("CurseForge path not allowed: {method} {path}")));
    }
    let url = format!("https://api.curseforge.com{path}");
    let req = match method.as_str() {
        "GET" => state.client.get(url),
        _ => state.client.post(url).json(&body.unwrap_or(serde_json::Value::Null)),
    };
    let res = req.header("x-api-key", key).header("Accept", "application/json").send().await?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(Error::NotFound(path));
    }
    Ok(res.error_for_status()?.json().await?)
}
