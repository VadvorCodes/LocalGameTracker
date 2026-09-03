// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod error;
mod game_cache;
mod models;
mod rawg;
mod scoring;
mod settings;

use std::sync::Mutex;

use tauri::Manager;

struct AppState {
    db: Mutex<rusqlite::Connection>,
    rawg: rawg::RawgClient,
    settings: Mutex<settings::Settings>,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let config_dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(&config_dir)?;

            let conn = db::open(&data_dir.join("gametracker.db"))?;
            let settings = settings::Settings::load(&config_dir.join("settings.json"))?;

            let state = AppState {
                db: Mutex::new(conn),
                rawg: rawg::RawgClient::new(settings.rawg_api_key.clone()),
                settings: Mutex::new(settings),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::profile::get_profile,
            commands::profile::create_profile,
            commands::profile::update_weights,
            commands::profile::rename_profile,
            commands::games::search_games,
            commands::games::library_query,
            commands::games::add_to_library,
            commands::games::update_library_entry,
            commands::games::remove_from_library,
            commands::games::get_library_entry,
            commands::games::get_genres_and_platforms,
            commands::ratings::set_star_rating,
            commands::ratings::set_category_scores,
            commands::rerate::start_rerate_session,
            commands::rerate::mark_rerated,
            commands::analytics::get_analytics,
            commands::settings::get_api_key,
            commands::settings::set_api_key,
            commands::settings::get_settings,
            commands::settings::set_theme,
            commands::settings::set_custom_theme,
            commands::settings::set_extended_sorting,
            commands::images::cache_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GameTracker");
}
