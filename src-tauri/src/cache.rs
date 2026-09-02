use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::CachedGame;

/// Upsert a RAWG search result page into the local cache so the app keeps
/// working offline. Genres/platforms are stored as JSON arrays.
pub fn upsert_games(conn: &Connection, games: &[crate::rawg::RawgGame]) -> AppResult<()> {
    for g in games {
        let cached = CachedGame::from(g);
        conn.execute(
            "INSERT INTO game_cache (rawg_id, name, cover_url, genres, platforms, release_date, developer, raw_json, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))
             ON CONFLICT(rawg_id) DO UPDATE SET
                name=excluded.name, cover_url=excluded.cover_url, genres=excluded.genres,
                platforms=excluded.platforms, release_date=excluded.release_date,
                developer=excluded.developer, raw_json=excluded.raw_json, fetched_at=excluded.fetched_at",
            params![
                cached.rawg_id,
                cached.name,
                cached.cover_url,
                serde_json::to_string(&cached.genres)?,
                serde_json::to_string(&cached.platforms)?,
                cached.release_date,
                cached.developer,
                serde_json::to_string(g)?,
            ],
        )?;
    }
    Ok(())
}

/// Offline fallback: name search over previously cached games.
pub fn search_cached(conn: &Connection, query: &str, limit: u32) -> AppResult<Vec<CachedGame>> {
    let mut stmt = conn.prepare(
        "SELECT rawg_id, name, cover_url, genres, platforms, release_date, developer
         FROM game_cache
         WHERE name LIKE ?1
         ORDER BY CASE WHEN name LIKE ?2 THEN 0 ELSE 1 END, fetched_at DESC
         LIMIT ?3",
    )?;
    let rows = stmt.query_map(
        params![format!("%{}%", query), format!("{}%", query), limit],
        |r| {
            Ok(CachedGame {
                rawg_id: r.get(0)?,
                name: r.get(1)?,
                cover_url: r.get(2)?,
                genres: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(),
                platforms: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or_default(),
                release_date: r.get(5)?,
                developer: r.get(6)?,
            })
        },
    )?;
    Ok(rows.filter_map(|x| x.ok()).collect())
}
