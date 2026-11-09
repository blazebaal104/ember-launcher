//! Tauri shell: thin IPC layer over `launcher-core`. No game logic lives here.
mod commands;
mod features;
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
            let profiles = tauri::async_runtime::block_on(launcher_core::profiles::ProfileStore::load(&paths));
            app.manage(state::AppState::new(paths, client, instances, settings, profiles));
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
            commands::stop_instance,
            features::update_instance,
            features::system_info,
            features::list_content,
            features::set_content_enabled,
            features::delete_content,
            features::import_content,
            features::list_worlds,
            features::list_screenshots,
            features::favorites_list,
            features::favorites_toggle,
            features::profiles_get,
            features::profile_save,
            features::profile_delete,
            features::profile_set_default,
            features::profile_from_instance,
            features::install_modpack,
            features::server_list,
            features::server_create,
            features::server_delete,
            features::server_accept_eula,
            features::server_install,
            features::server_start,
            features::server_stop,
            features::server_command,
            features::server_running,
            features::server_properties,
            features::server_set_properties,
            features::server_install_files,
            features::server_open_folder,
            features::network_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ember Launcher");
}
