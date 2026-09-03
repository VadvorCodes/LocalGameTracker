use rusqlite::Connection;
use std::path::Path;

use crate::error::AppResult;

const MIGRATIONS: &[&str] = &[
    // v1: initial schema
    "
    CREATE TABLE profile (
        id               INTEGER PRIMARY KEY,
        username         TEXT NOT NULL UNIQUE,
        category_weights TEXT NOT NULL DEFAULT '{\"gameplay\":25,\"story\":25,\"music\":25,\"technical\":25}',
        created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE game_cache (
        rawg_id      INTEGER PRIMARY KEY,
        name         TEXT NOT NULL,
        cover_url    TEXT,
        genres       TEXT NOT NULL DEFAULT '[]',    -- JSON array of names
        platforms    TEXT NOT NULL DEFAULT '[]',    -- JSON array of names
        release_date TEXT,
        developer    TEXT,
        raw_json     TEXT NOT NULL,
        fetched_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE library_entry (
        id               INTEGER PRIMARY KEY,
        profile_id       INTEGER NOT NULL REFERENCES profile(id),
        rawg_id          INTEGER NOT NULL REFERENCES game_cache(rawg_id),
        status           TEXT NOT NULL DEFAULT 'WantToPlay'
            CHECK (status IN ('WantToPlay','Playing','Completed','Dropped')),
        favourite        INTEGER NOT NULL DEFAULT 0,
        playtime_minutes INTEGER NOT NULL DEFAULT 0,
        started_at       TEXT,
        finished_at      TEXT,
        notes            TEXT NOT NULL DEFAULT '',
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (profile_id, rawg_id)
    );

    CREATE TABLE rating (
        library_entry_id INTEGER PRIMARY KEY REFERENCES library_entry(id) ON DELETE CASCADE,
        star_rating      REAL,                       -- 0..5, half steps, nullable
        gameplay         INTEGER,                    -- 0..100, nullable each
        story            INTEGER,
        music            INTEGER,
        technical        INTEGER,
        computed_overall REAL,
        rated_at         TEXT,                       -- first rating timestamp (for trends)
        rated_updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_library_profile ON library_entry(profile_id);
    CREATE INDEX idx_game_cache_name ON game_cache(name);
    ",
    // v2: re-rate mode — hidden "Recently Rerated" tag (excludes the game from
    // the next re-rate cycle only; cleared when the cycle after that starts).
    "
    ALTER TABLE rating ADD COLUMN rerated_at TEXT;
    CREATE INDEX idx_rating_rerated ON rating(rerated_at);
    ",
    // v3: move the "Recently Rerated" tag out of `rating` into its own table.
    // The tag is scheduling state, not a rating — storing it in `rating` forced
    // tag-only rows whose star_rating/rated_at were NULL, so "a row exists"
    // stopped meaning "this entry has been rated". A dedicated table keeps
    // `rating` clean and makes the eligibility filter a plain sargable IS NULL.
    "
    CREATE TABLE rerate_tag (
        library_entry_id INTEGER PRIMARY KEY REFERENCES library_entry(id) ON DELETE CASCADE,
        rerated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO rerate_tag (library_entry_id, rerated_at)
    SELECT library_entry_id, rerated_at FROM rating WHERE rerated_at IS NOT NULL;

    DROP INDEX idx_rating_rerated;
    ALTER TABLE rating DROP COLUMN rerated_at;
    ",
];

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

pub(crate) fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
        [],
    )?;
    let current: i64 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);

    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let v = (i + 1) as i64;
        if v > current {
            conn.execute_batch(sql)?;
            conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [v])?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v3_moves_existing_tags_out_of_rating() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        // Stop at v2 and plant a cooldown tag the old way (a tag-only rating row).
        conn.execute("CREATE TABLE schema_version (version INTEGER NOT NULL)", [])
            .unwrap();
        conn.execute_batch(MIGRATIONS[0]).unwrap();
        conn.execute("INSERT INTO schema_version (version) VALUES (1)", []).unwrap();
        conn.execute_batch(MIGRATIONS[1]).unwrap();
        conn.execute("INSERT INTO schema_version (version) VALUES (2)", []).unwrap();
        conn.execute("INSERT INTO profile (username) VALUES ('tester')", []).unwrap();
        conn.execute(
            "INSERT INTO game_cache (rawg_id, name, raw_json) VALUES (1, 'Game 1', '{}')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO library_entry (id, profile_id, rawg_id, status) VALUES (1, 1, 1, 'Completed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO rating (library_entry_id, rerated_at) VALUES (1, datetime('now'))",
            [],
        )
        .unwrap();

        migrate(&conn).unwrap(); // applies v3 on top

        let tag: String = conn
            .query_row("SELECT rerated_at FROM rerate_tag WHERE library_entry_id = 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(!tag.is_empty());
        let dropped: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('rating') WHERE name = 'rerated_at'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(dropped, 0);
    }
}
