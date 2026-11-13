//! Tauri shell: thin IPC layer over `launcher-core`. No game logic lives here.
mod accounts;
mod commands;
mod stats;
mod features;
mod servers;
mod updater;
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
            updater::cleanup(app.handle());
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
            accounts::login_start,
            accounts::login_cancel,
            accounts::login_finish,
            accounts::current_account,
            accounts::logout,
            accounts::accounts_list,
            accounts::account_switch,
            accounts::account_remove,
            accounts::account_details,
            accounts::account_upload_skin,
            accounts::account_set_variant,
            accounts::account_reset_skin,
            accounts::account_set_cape,
            accounts::account_name_check,
            accounts::account_name_change,
            accounts::skins_list,
            accounts::skin_save,
            accounts::skin_save_current,
            accounts::skin_rename,
            accounts::skin_delete,
            accounts::skin_apply,
            stats::account_stats_cmd,
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
            features::world_packs_list,
            features::world_packs_save,
            features::world_pack_activate,
            features::instance_shader_state,
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
            updater::app_version,
            updater::app_update_check,
            updater::app_update_install,
            servers::server_start,
            servers::server_stop,
            servers::server_restart,
            servers::server_update,
            servers::server_world,
            servers::server_backup,
            servers::server_restore,
            servers::server_delete_backup,
            servers::server_reset_world,
            servers::server_import_world,
            servers::server_open_backups,
            servers::server_players,
            servers::server_pregen,
            servers::server_addons,
            servers::server_set_addon,
            servers::playit_status,
            servers::playit_claim_start,
            servers::playit_claim_poll,
            servers::playit_disconnect,
            servers::playit_tunnel,
            servers::server_playit_start,
            servers::server_content,
            servers::server_content_enabled,
            servers::server_content_delete,
            servers::server_command,
            servers::server_live,
            servers::server_log,
            features::server_running,
            features::server_properties,
            features::server_set_properties,
            features::server_install_files,
            features::server_open_folder,
            features::network_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Ember Launcher")
        .run(|app, event| {
            // Closing Ember stops hosted servers properly (saving the world) instead of leaving
            // them running invisibly, where they'd lock the world for the next start.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let state = app.state::<state::AppState>();
                let running = state.running_servers.try_lock().map(|r| !r.is_empty()).unwrap_or(true);
                if running && !servers::SHUTTING_DOWN.swap(true, std::sync::atomic::Ordering::SeqCst) {
                    api.prevent_exit();
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        servers::stop_all(&app).await;
                        app.exit(0);
                    });
                }
            }
        });
}
