use rusqlite::params;

use crate::error::{AppError, AppResult};
use crate::models::CategoryWeights;
use crate::AppState;

#[tauri::command]
pub fn get_profile(state: tauri::State<AppState>) -> AppResult<Option<crate::models::Profile>> {
    let conn = state.db.lock().unwrap();
    read_profile(&conn)
}

#[tauri::command]
pub fn create_profile(state: tauri::State<AppState>, username: String) -> AppResult<crate::models::Profile> {
    let username = username.trim().to_string();
    if username.is_empty() || username.len() > 32 {
        return Err(AppError::msg("Username must be 1-32 characters."));
    }
    let conn = state.db.lock().unwrap();
    if let Some(existing) = read_profile(&conn)? {
        return Ok(existing); // single-profile app; idempotent
    }
    conn.execute(
        "INSERT INTO profile (username) VALUES (?1)",
        params![username],
    )?;
    read_profile(&conn)?.ok_or_else(|| AppError::msg("profile creation failed"))
}

#[tauri::command]
pub fn update_weights(
    state: tauri::State<AppState>,
    weights: CategoryWeights,
) -> AppResult<()> {
    let total = weights.gameplay + weights.story + weights.music + weights.technical;
    if total <= 0.0 || weights.gameplay < 0.0 || weights.story < 0.0 || weights.music < 0.0 || weights.technical < 0.0 {
        return Err(AppError::msg("Weights must be non-negative and not all zero."));
    }
    let conn = state.db.lock().unwrap();
    let profile = read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;
    conn.execute(
        "UPDATE profile SET category_weights = ?1 WHERE id = ?2",
        params![serde_json::to_string(&weights)?, profile.id],
    )?;
    // Recompute all cached overall scores under the new weights.
    let rows: Vec<(i64, Option<i64>, Option<i64>, Option<i64>, Option<i64>)> = {
        let mut stmt = conn.prepare(
            "SELECT r.library_entry_id, r.gameplay, r.story, r.music, r.technical
             FROM rating r JOIN library_entry e ON e.id = r.library_entry_id
             WHERE e.profile_id = ?1",
        )?;
        let it = stmt.query_map(params![profile.id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?;
        it.filter_map(|x| x.ok()).collect()
    };
    for (id, gp, st, mu, te) in rows {
        let overall = crate::scoring::compute_overall(gp, st, mu, te, &weights);
        conn.execute(
            "UPDATE rating SET computed_overall = ?1 WHERE library_entry_id = ?2",
            params![overall, id],
        )?;
    }
    Ok(())
}

pub(crate) fn read_profile(conn: &rusqlite::Connection) -> AppResult<Option<crate::models::Profile>> {
    let mut stmt = conn.prepare("SELECT id, username, category_weights, created_at FROM profile LIMIT 1")?;
    let mut rows = stmt.query_map([], |r| {
        let weights_json: String = r.get(2)?;
        Ok(crate::models::Profile {
            id: r.get(0)?,
            username: r.get(1)?,
            category_weights: serde_json::from_str(&weights_json).unwrap_or_default(),
            created_at: r.get(3)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}
