//! Tauri shell: thin IPC layer over `launcher-core`. No game logic lives here.
mod commands;
mod state;

use launcher_core::instance::InstanceManager;
use launcher_core::paths::LauncherPaths;
use launcher_core::perf_bundle::PerformanceBundleHook;
use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            let resources = app.path().resource_dir()?;
            let paths = LauncherPaths::new(data).with_resources(resources);
            let client = launcher_core::http_client();
            let instances = InstanceManager::new(paths.clone(), client.clone()).with_hook(Arc::new(PerformanceBundleHook));
            let settings = tauri::async_runtime::block_on(launcher_core::settings::LauncherSettings::load(&paths));
            app.manage(state::AppState::new(paths, client, instances, settings));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_versions,
            commands::list_instances,
            commands::create_instance,
            commands::delete_instance,
            commands::open_instance_folder,
            commands::get_settings,
            commands::save_settings,
            commands::login_start,
            commands::login_cancel,
            commands::login_finish,
            commands::current_account,
            commands::logout,
            commands::launch_instance,
            commands::install_files,
            commands::curseforge_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ember Launcher");
}
