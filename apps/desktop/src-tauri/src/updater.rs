//! In-app updates: check GitHub for a newer release, then download, verify and run the
//! installer (passive mode: a small progress window, no questions), and close Ember.
use crate::state::AppState;
use launcher_core::update::{self, UpdateInfo};
use launcher_core::{Error, Result};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentVersion {
    version: String,
    build: u32,
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> CurrentVersion {
    CurrentVersion { version: app.package_info().version.to_string(), build: update::current_build() }
}

#[tauri::command]
pub async fn app_update_check(app: AppHandle, state: State<'_, AppState>) -> Result<Option<UpdateInfo>> {
    update::check(&state.client, &app.package_info().version.to_string()).await
}

#[tauri::command]
pub async fn app_update_install(app: AppHandle, state: State<'_, AppState>, tag: String) -> Result<()> {
    if !cfg!(windows) {
        return Err(Error::Other("automatic install is only available on Windows; download it from the release page".into()));
    }
    if !state.running_servers.lock().await.is_empty() {
        return Err(Error::Other("stop your running servers first, then update".into()));
    }
    let info = update::by_tag(&state.client, &tag).await?;
    let dir = state.paths.root().join("updates");
    let emitter = app.clone();
    let mut last = 0u64;
    let path = update::download(&state.client, &info, &dir, move |done, total| {
        if done - last > 256 * 1024 || done == total {
            last = done;
            let _ = emitter.emit("update-progress", serde_json::json!({ "done": done, "total": total }));
        }
    })
    .await?;
    let _ = app.emit("update-progress", serde_json::json!({ "done": 1, "total": 1, "installing": true }));
    // /P = passive (progress bar only); /R = reopen Ember when done.
    std::process::Command::new(&path).args(["/P", "/R"]).spawn().map_err(|e| Error::Other(format!("couldn't start the installer: {e}")))?;
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    app.exit(0);
    Ok(())
}

/// Remove old downloaded installers on startup.
pub fn cleanup(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        let _ = std::fs::remove_dir_all(state.paths.root().join("updates"));
    }
}
