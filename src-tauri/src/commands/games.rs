use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::cache;
use crate::error::{AppError, AppResult};
use crate::models::{CachedGame, LibraryEntry, LibraryQuery, PlayStatus};
use crate::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOutcome {
    pub games: Vec<CachedGame>,
    pub source: String, // "live" | "cache"
}

/// Search RAWG; on any network/API failure fall back to the local cache so the
/// app remains usable offline. Results are always upserted into the cache.
#[tauri::command]
pub async fn search_games(
    state: tauri::State<'_, AppState>,
    query: String,
    page: Option<u32>,
) -> AppResult<SearchOutcome> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(SearchOutcome { games: vec![], source: "live".into() });
    }
    let page = page.unwrap_or(1);

    match state.rawg.search(&query, page).await {
        Ok(resp) => {
            let games: Vec<CachedGame> = resp.results.iter().map(CachedGame::from).collect();
            let conn = state.db.lock().unwrap();
            cache::upsert_games(&conn, &resp.results)?;
            Ok(SearchOutcome { games, source: "live".into() })
        }
        Err(_) => {
            let conn = state.db.lock().unwrap();
            let games = cache::search_cached(&conn, &query, 24)?;
            Ok(SearchOutcome { games, source: "cache".into() })
        }
    }
}

#[tauri::command]
pub async fn add_to_library(
    state: tauri::State<'_, AppState>,
    game: CachedGame,
    status: String,
) -> AppResult<LibraryEntry> {
    let status = PlayStatus::from_str(&status).ok_or_else(|| AppError::msg("invalid status"))?;
    let conn = state.db.lock().unwrap();
    let profile = super::profile::read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;

    // The game must exist in the cache; upsert a minimal row if somehow missing.
    let exists: bool = conn
        .query_row("SELECT 1 FROM game_cache WHERE rawg_id = ?1", params![game.rawg_id], |_| Ok(true))
        .unwrap_or(false);
    if !exists {
        conn.execute(
            "INSERT INTO game_cache (rawg_id, name, cover_url, genres, platforms, release_date, developer, raw_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '{}')",
            params![
                game.rawg_id,
                game.name,
                game.cover_url,
                serde_json::to_string(&game.genres)?,
                serde_json::to_string(&game.platforms)?,
                game.release_date,
                game.developer,
            ],
        )?;
    }

    conn.execute(
        "INSERT INTO library_entry (profile_id, rawg_id, status) VALUES (?1, ?2, ?3)
         ON CONFLICT(profile_id, rawg_id) DO NOTHING",
        params![profile.id, game.rawg_id, status.as_str()],
    )?;
    let entry_id: i64 = conn.query_row(
        "SELECT id FROM library_entry WHERE profile_id = ?1 AND rawg_id = ?2",
        params![profile.id, game.rawg_id],
        |r| r.get(0),
    )?;
    get_entry(&conn, entry_id).ok_or_else(|| AppError::msg("entry not found after insert"))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct EntryPatch {
    pub status: Option<String>,
    pub favourite: Option<bool>,
    pub playtime_minutes: Option<i64>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn update_library_entry(
    state: tauri::State<AppState>,
    entry_id: i64,
    patch: EntryPatch,
) -> AppResult<LibraryEntry> {
    let conn = state.db.lock().unwrap();
    // Validate the merged date range before applying anything: string compare
    // is safe because both values are ISO YYYY-MM-DD.
    let (cur_started, cur_finished): (Option<String>, Option<String>) = conn.query_row(
        "SELECT started_at, finished_at FROM library_entry WHERE id = ?1",
        params![entry_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let merged_started = patch
        .started_at
        .clone()
        .map(|s| if s.is_empty() { None } else { Some(s) })
        .or(Some(cur_started))
        .flatten();
    let merged_finished = patch
        .finished_at
        .clone()
        .map(|f| if f.is_empty() { None } else { Some(f) })
        .or(Some(cur_finished))
        .flatten();
    if let (Some(s), Some(f)) = (&merged_started, &merged_finished) {
        if s > f {
            return Err(AppError::msg(
                "Started date cannot be after the Finished date.",
            ));
        }
    }
    if let Some(s) = &patch.status {
        PlayStatus::from_str(s).ok_or_else(|| AppError::msg("invalid status"))?;
        conn.execute("UPDATE library_entry SET status = ?1 WHERE id = ?2", params![s, entry_id])?;
    }
    if let Some(f) = patch.favourite {
        conn.execute("UPDATE library_entry SET favourite = ?1 WHERE id = ?2", params![f as i64, entry_id])?;
    }
    if let Some(p) = patch.playtime_minutes {
        if p < 0 {
            return Err(AppError::msg("playtime cannot be negative"));
        }
        conn.execute("UPDATE library_entry SET playtime_minutes = ?1 WHERE id = ?2", params![p, entry_id])?;
    }
    if let Some(d) = &patch.started_at {
        conn.execute("UPDATE library_entry SET started_at = NULLIF(?1, '') WHERE id = ?2", params![d, entry_id])?;
    }
    if let Some(d) = &patch.finished_at {
        conn.execute("UPDATE library_entry SET finished_at = NULLIF(?1, '') WHERE id = ?2", params![d, entry_id])?;
    }
    if let Some(n) = &patch.notes {
        conn.execute("UPDATE library_entry SET notes = ?1 WHERE id = ?2", params![n, entry_id])?;
    }
    let changed = conn.execute("UPDATE library_entry SET updated_at = datetime('now') WHERE id = ?1", params![entry_id])?;
    if changed == 0 {
        return Err(AppError::msg("entry not found"));
    }
    get_entry(&conn, entry_id).ok_or_else(|| AppError::msg("entry not found"))
}

#[tauri::command]
pub fn remove_from_library(state: tauri::State<AppState>, entry_id: i64) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM rating WHERE library_entry_id = ?1", params![entry_id])?;
    conn.execute("DELETE FROM library_entry WHERE id = ?1", params![entry_id])?;
    Ok(())
}

#[tauri::command]
pub fn get_library_entry(state: tauri::State<AppState>, entry_id: i64) -> AppResult<LibraryEntry> {
    let conn = state.db.lock().unwrap();
    get_entry(&conn, entry_id).ok_or_else(|| AppError::msg("entry not found"))
}

const SORTS: &[(&str, &str)] = &[
    ("name", "c.name COLLATE NOCASE"),
    ("added", "e.created_at"),
    ("updated", "e.updated_at"),
    ("releaseDate", "c.release_date"),
    ("playtime", "e.playtime_minutes"),
    ("stars", "r.star_rating"),
    ("score", "r.computed_overall"),
    ("gameplay", "r.gameplay"),
    ("story", "r.story"),
    ("music", "r.music"),
    ("technical", "r.technical"),
    ("ratedAt", "r.rated_at"),
];

#[tauri::command]
pub fn library_query(
    state: tauri::State<AppState>,
    query: LibraryQuery,
) -> AppResult<Vec<LibraryEntry>> {
    let conn = state.db.lock().unwrap();
    let profile = super::profile::read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;

    let mut sql = String::from(
        "FROM library_entry e
         JOIN game_cache c ON c.rawg_id = e.rawg_id
         LEFT JOIN rating r ON r.library_entry_id = e.id
         WHERE e.profile_id = ?1",
    );
    let mut args: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(profile.id)];

    if let Some(s) = query.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        sql.push_str(" AND c.name LIKE ?");
        args.push(Box::new(format!("%{}%", s)));
    }
    if !query.statuses.is_empty() {
        sql.push_str(&format!(
            " AND e.status IN ({})",
            query.statuses.iter().map(|_| "?").collect::<Vec<_>>().join(",")
        ));
        for s in &query.statuses {
            PlayStatus::from_str(s).ok_or_else(|| AppError::msg("invalid status filter"))?;
            args.push(Box::new(s.clone()));
        }
    }
    if query.favourites_only {
        sql.push_str(" AND e.favourite = 1");
    }
    for (col, values) in [("genres", &query.genres), ("platforms", &query.platforms)] {
        if !values.is_empty() {
            // JSON array containment via LIKE on the JSON text.
            let mut parts = vec![];
            for v in values {
                parts.push(format!("c.{col} LIKE ?"));
                args.push(Box::new(format!("%\"{}\"%", v.replace('%', ""))));
            }
            sql.push_str(&format!(" AND ({})", parts.join(" OR ")));
        }
    }
    if let Some(v) = query.min_stars {
        sql.push_str(" AND r.star_rating >= ?");
        args.push(Box::new(v));
    }
    if let Some(v) = query.max_stars {
        sql.push_str(" AND r.star_rating <= ?");
        args.push(Box::new(v));
    }
    if let Some(v) = query.min_score {
        sql.push_str(" AND r.computed_overall >= ?");
        args.push(Box::new(v));
    }
    if let Some(v) = query.max_score {
        sql.push_str(" AND r.computed_overall <= ?");
        args.push(Box::new(v));
    }

    let sort_col = SORTS
        .iter()
        .find(|(k, _)| Some(*k) == query.sort.as_deref())
        .map(|(_, v)| *v)
        .unwrap_or("e.created_at");
    let dir = if query.sort_desc.unwrap_or(true) { "DESC" } else { "ASC" };
    sql.push_str(&format!(
        " ORDER BY {sort_col} {dir} NULLS LAST, c.name COLLATE NOCASE ASC LIMIT 2000"
    ));

    let full = format!(
        "SELECT e.id, c.rawg_id, c.name, c.cover_url, c.genres, c.platforms, c.release_date, c.developer,
                e.status, e.favourite, e.playtime_minutes, e.started_at, e.finished_at, e.notes, e.created_at, e.updated_at,
                r.star_rating, r.gameplay, r.story, r.music, r.technical, r.computed_overall, r.rated_at
         {sql}"
    );
    let mut stmt = conn.prepare(&full)?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    let rows = stmt.query_map(refs.as_slice(), map_entry)?;
    Ok(rows.filter_map(|x| x.ok()).collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenrePlatformInfo {
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
}

/// All distinct genres/platforms the user's library covers (for filter UI).
#[tauri::command]
pub fn get_genres_and_platforms(state: tauri::State<AppState>) -> AppResult<GenrePlatformInfo> {
    let conn = state.db.lock().unwrap();
    let profile = super::profile::read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;
    let mut stmt = conn.prepare(
        "SELECT c.genres, c.platforms FROM library_entry e JOIN game_cache c ON c.rawg_id = e.rawg_id WHERE e.profile_id = ?1",
    )?;
    let rows = stmt.query_map(params![profile.id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut genres = std::collections::BTreeSet::new();
    let mut platforms = std::collections::BTreeSet::new();
    for row in rows.flatten() {
        if let Ok(g) = serde_json::from_str::<Vec<String>>(&row.0) {
            genres.extend(g);
        }
        if let Ok(p) = serde_json::from_str::<Vec<String>>(&row.1) {
            platforms.extend(p);
        }
    }
    Ok(GenrePlatformInfo {
        genres: genres.into_iter().collect(),
        platforms: platforms.into_iter().collect(),
    })
}

pub(crate) fn get_entry(conn: &rusqlite::Connection, entry_id: i64) -> Option<LibraryEntry> {
    conn.query_row(
        "SELECT e.id, c.rawg_id, c.name, c.cover_url, c.genres, c.platforms, c.release_date, c.developer,
                e.status, e.favourite, e.playtime_minutes, e.started_at, e.finished_at, e.notes, e.created_at, e.updated_at,
                r.star_rating, r.gameplay, r.story, r.music, r.technical, r.computed_overall, r.rated_at
         FROM library_entry e
         JOIN game_cache c ON c.rawg_id = e.rawg_id
         LEFT JOIN rating r ON r.library_entry_id = e.id
         WHERE e.id = ?1",
        params![entry_id],
        map_entry,
    )
    .ok()
}

fn map_entry(r: &rusqlite::Row) -> rusqlite::Result<LibraryEntry> {
    Ok(LibraryEntry {
        id: r.get(0)?,
        rawg_id: r.get(1)?,
        name: r.get(2)?,
        cover_url: r.get(3)?,
        genres: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or_default(),
        platforms: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or_default(),
        release_date: r.get(6)?,
        developer: r.get(7)?,
        status: PlayStatus::from_str(&r.get::<_, String>(8)?).unwrap_or(PlayStatus::WantToPlay),
        favourite: r.get::<_, i64>(9)? != 0,
        playtime_minutes: r.get(10)?,
        started_at: r.get(11)?,
        finished_at: r.get(12)?,
        notes: r.get(13)?,
        created_at: r.get(14)?,
        updated_at: r.get(15)?,
        star_rating: r.get(16)?,
        gameplay: r.get(17)?,
        story: r.get(18)?,
        music: r.get(19)?,
        technical: r.get(20)?,
        computed_overall: r.get(21)?,
        rated_at: r.get(22)?,
    })
}
