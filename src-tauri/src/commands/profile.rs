use rusqlite::params;

use crate::error::{AppError, AppResult};
use crate::models::CategoryWeights;
use crate::AppState;

/// Absolute tolerance for the "weights sum to 100" check. The frontend slider
/// edits integers (SettingsModal requires `total === 100`), so this only needs
/// to absorb floating-point noise, not real slack.
const WEIGHT_SUM_TOLERANCE: f64 = 0.05;

/// Trim and validate a profile name (1-32 chars after trimming).
fn validated_username(username: &str) -> AppResult<String> {
    let username = username.trim();
    if username.is_empty() || username.len() > 32 {
        return Err(AppError::msg("Username must be 1-32 characters."));
    }
    Ok(username.to_string())
}

#[tauri::command]
pub fn get_profile(state: tauri::State<AppState>) -> AppResult<Option<crate::models::Profile>> {
    let conn = state.db.lock().unwrap();
    read_profile(&conn)
}

#[tauri::command]
pub fn create_profile(
    state: tauri::State<AppState>,
    username: String,
) -> AppResult<crate::models::Profile> {
    let username = validated_username(&username)?;
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
pub fn rename_profile(
    state: tauri::State<AppState>,
    username: String,
) -> AppResult<crate::models::Profile> {
    let username = validated_username(&username)?;
    let conn = state.db.lock().unwrap();
    let profile = read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;
    conn.execute(
        "UPDATE profile SET username = ?1 WHERE id = ?2",
        params![username, profile.id],
    )?;
    read_profile(&conn)?.ok_or_else(|| AppError::msg("profile rename failed"))
}

fn validate_weights(weights: &CategoryWeights) -> AppResult<()> {
    let total = weights.gameplay + weights.story + weights.music + weights.technical;
    if total <= 0.0
        || weights.gameplay < 0.0
        || weights.story < 0.0
        || weights.music < 0.0
        || weights.technical < 0.0
    {
        return Err(AppError::msg(
            "Weights must be non-negative and not all zero.",
        ));
    }
    if (total - 100.0).abs() > WEIGHT_SUM_TOLERANCE {
        return Err(AppError::msg("Weights must total exactly 100."));
    }
    Ok(())
}

/// The four raw category scores stored on a rating row, keyed by entry.
struct EntryScores {
    entry_id: i64,
    gameplay: Option<i64>,
    story: Option<i64>,
    music: Option<i64>,
    technical: Option<i64>,
}

#[tauri::command]
pub fn update_weights(state: tauri::State<AppState>, weights: CategoryWeights) -> AppResult<()> {
    validate_weights(&weights)?;
    let conn = state.db.lock().unwrap();
    let profile = read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;

    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE profile SET category_weights = ?1 WHERE id = ?2",
        params![serde_json::to_string(&weights)?, profile.id],
    )?;
    // Recompute all cached overall scores under the new weights.
    let rows: Vec<EntryScores> = {
        let mut stmt = tx.prepare(
            "SELECT r.library_entry_id, r.gameplay, r.story, r.music, r.technical
             FROM rating r JOIN library_entry e ON e.id = r.library_entry_id
             WHERE e.profile_id = ?1",
        )?;
        let it = stmt.query_map(params![profile.id], |r| {
            Ok(EntryScores {
                entry_id: r.get(0)?,
                gameplay: r.get(1)?,
                story: r.get(2)?,
                music: r.get(3)?,
                technical: r.get(4)?,
            })
        })?;
        it.filter_map(|x| x.ok()).collect()
    };
    for s in rows {
        let overall =
            crate::scoring::compute_overall(s.gameplay, s.story, s.music, s.technical, &weights);
        tx.execute(
            "UPDATE rating SET computed_overall = ?1 WHERE library_entry_id = ?2",
            params![overall, s.entry_id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub(crate) fn read_profile(
    conn: &rusqlite::Connection,
) -> AppResult<Option<crate::models::Profile>> {
    let mut stmt =
        conn.prepare("SELECT id, username, category_weights, created_at FROM profile LIMIT 1")?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn weights(gameplay: f64, story: f64, music: f64, technical: f64) -> CategoryWeights {
        CategoryWeights {
            gameplay,
            story,
            music,
            technical,
        }
    }

    #[test]
    fn weight_sum_uses_absolute_tolerance() {
        assert!(validate_weights(&weights(50.0, 50.0, 0.0, 0.0)).is_ok());
        // Within the 0.05 tolerance (float noise from slider edits).
        assert!(validate_weights(&weights(50.0, 50.04, 0.0, 0.0)).is_ok());
        assert!(validate_weights(&weights(50.0, 49.96, 0.0, 0.0)).is_ok());
        // Outside it.
        assert!(validate_weights(&weights(50.0, 50.06, 0.0, 0.0)).is_err());
        assert!(validate_weights(&weights(50.0, 49.94, 0.0, 0.0)).is_err());
    }

    #[test]
    fn weight_rejects_negative_and_all_zero() {
        assert!(validate_weights(&weights(-1.0, 101.0, 0.0, 0.0)).is_err());
        assert!(validate_weights(&weights(0.0, 0.0, 0.0, 0.0)).is_err());
    }
}
