use sha2::{Digest, Sha256};
use tauri::Manager;

use crate::error::AppResult;

/// Downloads a remote image once into the app data dir and returns the local
/// path. The frontend displays it via `convertFileSrc`, so covers render even
/// when offline. Idempotent: already-cached URLs are a no-op.
#[tauri::command]
pub async fn cache_image(app: tauri::AppHandle, url: String) -> AppResult<String> {
    if url.is_empty() {
        return Err(crate::error::AppError::msg("empty url"));
    }
    let dir = app.path().app_data_dir()?.join("images");
    std::fs::create_dir_all(&dir)?;

    let mut hasher = Sha256::new();
    hasher.update(&url);
    let ext = url.rsplit('.').next().and_then(|e| {
        if e.len() <= 4 && e.chars().all(|c| c.is_ascii_alphanumeric()) {
            Some(e.to_ascii_lowercase())
        } else {
            None
        }
    });
    let name = format!("{:x}", hasher.finalize());
    let file_name = match ext.as_deref() {
        Some("jpg") | Some("jpeg") | Some("png") | Some("webp") => {
            format!("{name}.{}", ext.as_deref().unwrap())
        }
        _ => format!("{name}.jpg"),
    };
    let path = dir.join(file_name);

    if !path.exists() {
        let bytes = reqwest::get(&url)
            .await?
            .error_for_status()?
            .bytes()
            .await?;
        // Write atomically-ish: temp file then rename, so a partial download
        // never poisons the cache.
        let tmp = path.with_extension("part");
        std::fs::write(&tmp, &bytes)?;
        std::fs::rename(&tmp, &path)?;
    }
    Ok(path.to_string_lossy().into_owned())
}
