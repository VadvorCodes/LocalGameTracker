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
];

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> AppResult<()> {
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
