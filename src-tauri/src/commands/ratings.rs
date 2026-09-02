use rusqlite::params;

use crate::error::{AppError, AppResult};
use crate::models::LibraryEntry;
use crate::AppState;

#[tauri::command]
pub fn set_star_rating(
    state: tauri::State<AppState>,
    entry_id: i64,
    stars: Option<f64>,
) -> AppResult<LibraryEntry> {
    let stars = match stars {
        None => None,
        Some(s) => {
            if !(0.0..=5.0).contains(&s) {
                return Err(AppError::msg("star rating must be between 0 and 5"));
            }
            // Snap to half steps.
            Some((s * 2.0).round() / 2.0)
        }
    };
    let conn = state.db.lock().unwrap();
    upsert_rating(&conn, entry_id, |sql_args| {
        sql_args.push(("star_rating", stars));
    })?;
    super::games::get_entry(&conn, entry_id).ok_or_else(|| AppError::msg("entry not found"))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryScores {
    pub gameplay: Option<i64>,
    pub story: Option<i64>,
    pub music: Option<i64>,
    pub technical: Option<i64>,
}

#[tauri::command]
pub fn set_category_scores(
    state: tauri::State<AppState>,
    entry_id: i64,
    scores: CategoryScores,
) -> AppResult<LibraryEntry> {
    for v in [scores.gameplay, scores.story, scores.music, scores.technical].into_iter().flatten() {
        if !(0..=100).contains(&v) {
            return Err(AppError::msg("category scores must be between 0 and 100"));
        }
    }
    let conn = state.db.lock().unwrap();
    let profile = super::profile::read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;
    let overall =
        crate::scoring::compute_overall(scores.gameplay, scores.story, scores.music, scores.technical, &profile.category_weights);

    upsert_rating(&conn, entry_id, |sql_args| {
        sql_args.push(("gameplay", scores.gameplay.map(|v| v as f64)));
        sql_args.push(("story", scores.story.map(|v| v as f64)));
        sql_args.push(("music", scores.music.map(|v| v as f64)));
        sql_args.push(("technical", scores.technical.map(|v| v as f64)));
        sql_args.push(("computed_overall", overall));
    })?;
    super::games::get_entry(&conn, entry_id).ok_or_else(|| AppError::msg("entry not found"))
}

/// Creates the rating row if needed (preserving the original `rated_at` for
/// trend analysis), then applies the column updates and bumps rated_updated_at.
fn upsert_rating(
    conn: &rusqlite::Connection,
    entry_id: i64,
    apply: impl FnOnce(&mut Vec<(&'static str, Option<f64>)>),
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO rating (library_entry_id, rated_at) VALUES (?1, datetime('now'))
         ON CONFLICT(library_entry_id) DO NOTHING",
        params![entry_id],
    )?;
    let mut sets: Vec<(&'static str, Option<f64>)> = vec![];
    apply(&mut sets);
    let assignments: Vec<String> = sets
        .iter()
        .map(|(col, v)| {
            format!(
                "{col} = {}",
                if v.is_none() { String::from("NULL") } else { String::from("?") }
            )
        })
        .collect();
    let sql = format!(
        "UPDATE rating SET {}, rated_updated_at = datetime('now') WHERE library_entry_id = ?",
        assignments.join(", ")
    );
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = sets
        .iter()
        .filter(|(_, v)| v.is_some())
        .map(|(_, v)| Box::new(v) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    params_vec.push(Box::new(entry_id));
    conn.execute(&sql, rusqlite::params_from_iter(params_vec.iter().map(|b| b.as_ref())))?;
    Ok(())
}
