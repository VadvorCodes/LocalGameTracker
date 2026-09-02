use serde::Serialize;

use crate::error::AppResult;
use crate::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub has_key: bool,
}

#[tauri::command]
pub fn get_api_key(state: tauri::State<AppState>) -> ApiKeyStatus {
    ApiKeyStatus { has_key: state.rawg.has_key() }
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
        match state.rawg.search("portal", 1).await {
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
    Ok(ApiKeyStatus { has_key: state.rawg.has_key() })
}
