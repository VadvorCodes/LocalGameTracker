use serde::Serialize;

use crate::error::AppResult;
use crate::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub has_key: bool,
}

/// UI preferences surfaced to the frontend (colour theme + extended sorting).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    pub theme: String,
    pub custom_theme: Option<crate::settings::CustomTheme>,
    pub extended_sorting: bool,
}

pub const DEFAULT_THEME: &str = "midnight";

fn ui_settings(settings: &crate::settings::Settings) -> UiSettings {
    UiSettings {
        theme: settings
            .theme
            .clone()
            .unwrap_or_else(|| DEFAULT_THEME.into()),
        custom_theme: settings.custom_theme.clone(),
        extended_sorting: settings.extended_sorting.unwrap_or(false),
    }
}

/// Normalize + validate a #rrggbb colour string.
fn validate_hex(value: &str) -> AppResult<String> {
    let t = value.trim().to_ascii_lowercase();
    let valid = t.len() == 7 && t.starts_with('#') && t[1..].chars().all(|c| c.is_ascii_hexdigit());
    if valid {
        Ok(t)
    } else {
        Err(crate::error::AppError::msg(
            "Colour must be a #rrggbb value like #4460e0.",
        ))
    }
}

fn persist(app: &tauri::AppHandle, state: &tauri::State<AppState>) -> AppResult<UiSettings> {
    use tauri::Manager;
    let path = app.path().app_config_dir()?.join("settings.json");
    let snapshot = {
        let settings = state.settings.lock().unwrap();
        settings.save(&path)?;
        settings.clone()
    };
    Ok(ui_settings(&snapshot))
}

#[tauri::command]
pub fn get_api_key(state: tauri::State<AppState>) -> ApiKeyStatus {
    ApiKeyStatus {
        has_key: state.rawg.has_key(),
    }
}

#[tauri::command]
pub async fn set_api_key(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    key: String,
) -> AppResult<ApiKeyStatus> {
    use tauri::Manager;
    let key = key.trim().to_string();
    // Validate against RAWG before accepting (empty string clears the key).
    let old = state.settings.lock().unwrap().rawg_api_key.clone();
    let validated = if key.is_empty() {
        None
    } else {
        state.rawg.set_api_key(Some(key.clone()));
        match state
            .rawg
            .search("portal", 1, &crate::models::SearchFilters::default())
            .await
        {
            Ok(_) => Some(key),
            Err(e) => {
                state.rawg.set_api_key(old);
                return Err(crate::error::AppError::msg(format!(
                    "RAWG rejected this key ({e}). Nothing was saved."
                )));
            }
        }
    };

    state.rawg.set_api_key(validated.clone());
    {
        let mut settings = state.settings.lock().unwrap();
        settings.rawg_api_key = validated;
        let path = app.path().app_config_dir()?.join("settings.json");
        settings.save(&path)?;
    }
    Ok(ApiKeyStatus {
        has_key: state.rawg.has_key(),
    })
}

#[tauri::command]
pub fn get_settings(state: tauri::State<AppState>) -> AppResult<UiSettings> {
    let snapshot = state.settings.lock().unwrap().clone();
    Ok(ui_settings(&snapshot))
}

#[tauri::command]
pub fn set_theme(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    theme: String,
) -> AppResult<UiSettings> {
    state.settings.lock().unwrap().theme = Some(theme);
    persist(&app, &state)
}

#[tauri::command]
pub fn set_custom_theme(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    base: String,
    accent: String,
) -> AppResult<UiSettings> {
    let base = validate_hex(&base)?;
    let accent = validate_hex(&accent)?;
    {
        let mut settings = state.settings.lock().unwrap();
        settings.theme = Some("custom".into());
        settings.custom_theme = Some(crate::settings::CustomTheme { base, accent });
    }
    persist(&app, &state)
}

#[tauri::command]
pub fn set_extended_sorting(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> AppResult<UiSettings> {
    state.settings.lock().unwrap().extended_sorting = Some(enabled);
    persist(&app, &state)
}
