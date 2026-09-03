use rusqlite::{params, Connection};
use serde::Deserialize;

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

/// Offline fallback: name search over previously cached games. An optional
/// ISO-year range mirrors the RAWG `dates` query param; when one is set,
/// undated (TBA) rows are excluded, matching the server-side behaviour.
/// Popularity fields live only in `raw_json`; rows cached before those fields
/// were captured deserialize as `None`, so offline ranking degrades gracefully
/// to text + recency.
pub fn search_cached(
    conn: &Connection,
    query: &str,
    from_year: Option<i32>,
    to_year: Option<i32>,
    limit: u32,
) -> AppResult<Vec<CachedGame>> {
    const SELECT: &str =
        "SELECT rawg_id, name, cover_url, genres, platforms, release_date, developer, raw_json
         FROM game_cache";
    let date_filtered = from_year.is_some() || to_year.is_some();
    let (sql, bind) = if date_filtered {
        (
            format!(
                "{SELECT} WHERE name LIKE ?1 AND release_date BETWEEN ?2 AND ?3
                 ORDER BY CASE WHEN name LIKE ?4 THEN 0 ELSE 1 END, fetched_at DESC LIMIT ?5"
            ),
            (
                format!("{}-01-01", from_year.unwrap_or(1)),
                format!("{}-12-31", to_year.unwrap_or(9999)),
            ),
        )
    } else {
        (
            format!(
                "{SELECT} WHERE name LIKE ?1
                 ORDER BY CASE WHEN name LIKE ?2 THEN 0 ELSE 1 END, fetched_at DESC LIMIT ?3"
            ),
            ("0001-01-01".to_string(), "9999-12-31".to_string()),
        )
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = if date_filtered {
        stmt.query_map(
            params![
                format!("%{}%", query),
                bind.0,
                bind.1,
                format!("{}%", query),
                limit
            ],
            map_row,
        )?
    } else {
        stmt.query_map(
            params![format!("%{}%", query), format!("{}%", query), limit],
            map_row,
        )?
    };
    Ok(rows.filter_map(|x| x.ok()).collect())
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<CachedGame> {
    let pop: RawgPopularity = serde_json::from_str(&r.get::<_, String>(7)?).unwrap_or_default();
    Ok(CachedGame {
        rawg_id: r.get(0)?,
        name: r.get(1)?,
        cover_url: r.get(2)?,
        genres: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(),
        platforms: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or_default(),
        release_date: r.get(5)?,
        developer: r.get(6)?,
        added: pop.added,
        metacritic: pop.metacritic,
    })
}

/// The slice of `raw_json` search ranking needs. `default` keeps old cached
/// rows (serialized before these fields existed) deserializable as `None`.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct RawgPopularity {
    added: Option<i64>,
    metacritic: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE game_cache (
                rawg_id INTEGER PRIMARY KEY, name TEXT NOT NULL, cover_url TEXT,
                genres TEXT NOT NULL DEFAULT '[]', platforms TEXT NOT NULL DEFAULT '[]',
                release_date TEXT, developer TEXT, raw_json TEXT NOT NULL,
                fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .unwrap();
        conn
    }

    fn seed(conn: &Connection, id: i64, name: &str, released: Option<&str>, raw_json: &str) {
        conn.execute(
            "INSERT INTO game_cache (rawg_id, name, release_date, raw_json) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, released, raw_json],
        )
        .unwrap();
    }

    #[test]
    fn reads_popularity_from_raw_json_and_tolerates_old_rows() {
        let conn = conn();
        seed(
            &conn,
            1,
            "Call of Duty",
            Some("2003-10-29"),
            r#"{"id":1,"name":"Call of Duty","added":1500,"metacritic":91}"#,
        );
        seed(
            &conn,
            2,
            "Old Row Game",
            None,
            r#"{"id":2,"name":"Old Row Game"}"#,
        );

        let games = search_cached(&conn, "of duty", None, None, 10).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].added, Some(1500));
        assert_eq!(games[0].metacritic, Some(91));

        let old = search_cached(&conn, "Old Row", None, None, 10).unwrap();
        assert_eq!(old[0].added, None);
        assert_eq!(old[0].metacritic, None);
    }

    #[test]
    fn year_range_filters_but_keeps_undated_rows_when_open() {
        let conn = conn();
        seed(
            &conn,
            1,
            "Alpha Game",
            Some("1998-05-01"),
            r#"{"id":1,"name":"Alpha Game"}"#,
        );
        seed(
            &conn,
            2,
            "Alpha Game 2",
            Some("2020-05-01"),
            r#"{"id":2,"name":"Alpha Game 2"}"#,
        );
        seed(
            &conn,
            3,
            "Alpha TBA",
            None,
            r#"{"id":3,"name":"Alpha TBA"}"#,
        );

        let all = search_cached(&conn, "Alpha", None, None, 10).unwrap();
        assert_eq!(all.len(), 3); // open range keeps everything, including undated

        let modern = search_cached(&conn, "Alpha", Some(2010), None, 10).unwrap();
        assert_eq!(modern.len(), 1);
        assert_eq!(modern[0].name, "Alpha Game 2");

        let nineties = search_cached(&conn, "Alpha", None, Some(2000), 10).unwrap();
        assert_eq!(nineties.len(), 1);
        assert_eq!(nineties[0].name, "Alpha Game");
    }
}
