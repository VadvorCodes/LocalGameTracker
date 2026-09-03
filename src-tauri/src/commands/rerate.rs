use rusqlite::{params, Connection};
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::models::{LibraryEntry, PlayStatus};
use crate::AppState;

/// One game in a re-rate cycle, paired with the library's closest genre matches.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReratePoolItem {
    pub entry: LibraryEntry,
    pub similar: Vec<LibraryEntry>,
}

/// The maximum cycle size; smaller libraries contribute half their (eligible) games.
const MAX_POOL: usize = 10;
/// How many genre-similar companion games to show beside the card.
const SIMILAR_COUNT: usize = 3;

#[tauri::command]
pub fn start_rerate_session(
    state: tauri::State<AppState>,
    statuses: Vec<String>,
) -> AppResult<Vec<ReratePoolItem>> {
    let conn = state.db.lock().unwrap();
    let profile = super::profile::read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;
    let statuses = validate_statuses(statuses)?;

    let pool = pick_cycle_pool(&conn, profile.id, &statuses)?;

    // Genre matches come from the whole library (rated or not), so fetch it once.
    let library = super::games::list_library(&conn, profile.id)?;

    Ok(pool
        .into_iter()
        .map(|entry| {
            let similar = closest_by_genre(&entry, &library, SIMILAR_COUNT);
            ReratePoolItem { entry, similar }
        })
        .collect())
}

#[tauri::command]
pub fn mark_rerated(state: tauri::State<AppState>, entry_id: i64) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    tag_rerated(&conn, entry_id)
}

/// The two scope definitions are expressed exactly: the caller sends the
/// in-scope statuses, so the pool always matches what the UI counted.
fn validate_statuses(statuses: Vec<String>) -> AppResult<Vec<String>> {
    if statuses.is_empty() {
        return Err(AppError::msg("no statuses selected"));
    }
    statuses
        .iter()
        .map(|s| {
            PlayStatus::from_str(s)
                .map(|p| p.as_str().to_string())
                .ok_or_else(|| AppError::msg("invalid status filter"))
        })
        .collect()
}

/// Build one re-rate cycle's pool from already-validated statuses.
///
/// Lifecycle: the previous cycle's tags are still active during selection
/// (that's what excludes those games), and are only cleared once a cycle
/// actually starts — returning an empty pool never touches them, so merely
/// opening a cycle cannot discard the previous exclusions.
fn pick_cycle_pool(
    conn: &Connection,
    profile_id: i64,
    statuses: &[String],
) -> AppResult<Vec<LibraryEntry>> {
    let mut pool = select_eligible(conn, profile_id, statuses)?;

    if pool.is_empty() && count_in_scope(conn, profile_id, statuses)? > 0 {
        // Everything in scope is sitting out the cooldown. Reset the tags and
        // start a fresh cycle anyway — tags only ever clear when a cycle
        // starts, so without this a small library could never cycle again.
        conn.execute("DELETE FROM rerate_tag", [])?;
        pool = select_eligible(conn, profile_id, statuses)?;
    }

    if pool.is_empty() {
        // Empty scope: nothing to cycle, and the previous tags must stay.
        return Ok(vec![]);
    }

    // The cycle is really starting: the previous cycle's tags have served
    // their purpose (exactly one cycle of exclusion) — clear them so those
    // games become eligible again after this one.
    conn.execute("DELETE FROM rerate_tag", [])?;

    let pool_size = pool_size_for(pool.len());
    pool.truncate(pool_size);
    Ok(pool)
}

/// In-scope games without an active cooldown tag. The `IS NULL` predicate on
/// `rerate_tag` is sargable via that table's primary key.
fn select_eligible(
    conn: &Connection,
    profile_id: i64,
    statuses: &[String],
) -> AppResult<Vec<LibraryEntry>> {
    let placeholders = statuses.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "{} {} WHERE e.profile_id = ?1 AND rt.rerated_at IS NULL \
         AND e.status IN ({placeholders}) ORDER BY RANDOM()",
        super::games::ENTRY_SELECT,
        super::games::ENTRY_FROM,
    );
    query_entries(conn, &sql, profile_id, statuses)
}

fn count_in_scope(
    conn: &Connection,
    profile_id: i64,
    statuses: &[String],
) -> AppResult<i64> {
    let placeholders = statuses.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT COUNT(*) FROM library_entry WHERE profile_id = ?1 AND status IN ({placeholders})"
    );
    let mut args: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(profile_id)];
    for s in statuses {
        args.push(Box::new(s.clone()));
    }
    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    Ok(stmt.query_row(refs.as_slice(), |r| r.get(0))?)
}

fn query_entries(
    conn: &Connection,
    sql: &str,
    profile_id: i64,
    statuses: &[String],
) -> AppResult<Vec<LibraryEntry>> {
    let mut args: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(profile_id)];
    for s in statuses {
        args.push(Box::new(s.clone()));
    }
    let mut stmt = conn.prepare(sql)?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    let rows = stmt.query_map(refs.as_slice(), super::games::map_entry)?;
    Ok(rows.filter_map(|x| x.ok()).collect())
}

fn tag_rerated(conn: &Connection, entry_id: i64) -> AppResult<()> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM library_entry WHERE id = ?1",
            params![entry_id],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if !exists {
        return Err(AppError::msg("entry not found"));
    }
    // The tag is scheduling state and lives in its own table; no rating row is
    // created or modified.
    conn.execute(
        "INSERT INTO rerate_tag (library_entry_id, rerated_at) VALUES (?1, datetime('now'))
         ON CONFLICT(library_entry_id) DO UPDATE SET rerated_at = excluded.rerated_at",
        params![entry_id],
    )?;
    Ok(())
}

/// 10 games per cycle, or half the library when fewer than 10 are eligible.
fn pool_size_for(eligible: usize) -> usize {
    if eligible >= MAX_POOL {
        MAX_POOL
    } else {
        (eligible / 2).max(1)
    }
}

/// Rank other library entries by genre similarity: Jaccard — shared genres
/// divided by total unique genres across both games. Raw counts favour generic
/// multi-genre games (Adventure/Action are on everything); Jaccard rewards
/// precise matches. Games sharing no genre are excluded — better to show
/// nothing than an arbitrary pick. `library` arrives in random SQL order, so
/// exact ties still vary between cycles.
fn closest_by_genre(
    target: &LibraryEntry,
    library: &[LibraryEntry],
    count: usize,
) -> Vec<LibraryEntry> {
    let target_genres: std::collections::HashSet<&str> =
        target.genres.iter().map(|s| s.as_str()).collect();
    let mut scored: Vec<(f64, &LibraryEntry)> = library
        .iter()
        .filter(|e| e.id != target.id)
        .filter_map(|e| {
            let shared = e
                .genres
                .iter()
                .filter(|g| target_genres.contains(g.as_str()))
                .count();
            if shared == 0 {
                return None;
            }
            let union = target_genres.len() + e.genres.len() - shared;
            Some((shared as f64 / union as f64, e))
        })
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
    scored
        .into_iter()
        .map(|(_, e)| e.clone())
        .take(count)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: i64, genres: &[&str]) -> LibraryEntry {
        LibraryEntry {
            id,
            rawg_id: id,
            name: format!("Game {id}"),
            cover_url: None,
            genres: genres.iter().map(|s| s.to_string()).collect(),
            platforms: vec![],
            release_date: None,
            developer: None,
            status: crate::models::PlayStatus::Completed,
            favourite: false,
            playtime_minutes: 0,
            started_at: None,
            finished_at: None,
            notes: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
            star_rating: None,
            gameplay: None,
            story: None,
            music: None,
            technical: None,
            computed_overall: None,
            rated_at: None,
            rerated_at: None,
        }
    }

    fn test_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        conn.execute("INSERT INTO profile (username) VALUES ('tester')", [])
            .unwrap();
        conn
    }

    fn add_entry(conn: &rusqlite::Connection, id: i64, status: &str) {
        conn.execute(
            "INSERT INTO game_cache (rawg_id, name, raw_json) VALUES (?1, ?2, '{}')",
            params![id, format!("Game {id}")],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO library_entry (id, profile_id, rawg_id, status) VALUES (?1, 1, ?1, ?2)",
            params![id, status],
        )
        .unwrap();
    }

    fn sorted_ids(pool: &[LibraryEntry]) -> Vec<i64> {
        let mut v: Vec<i64> = pool.iter().map(|e| e.id).collect();
        v.sort_unstable();
        v
    }

    fn tag_count(conn: &rusqlite::Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM rerate_tag", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn pool_size_full_library() {
        assert_eq!(pool_size_for(10), 10);
        assert_eq!(pool_size_for(500), MAX_POOL);
    }

    #[test]
    fn pool_size_small_library_is_half() {
        assert_eq!(pool_size_for(9), 4);
        assert_eq!(pool_size_for(7), 3);
        assert_eq!(pool_size_for(2), 1);
    }

    #[test]
    fn pool_size_never_zero() {
        assert_eq!(pool_size_for(1), 1);
        assert_eq!(pool_size_for(0), 1);
    }

    #[test]
    fn jaccard_ranks_best_first_and_excludes_zero_overlap() {
        let target = entry(1, &["Action", "RPG", "Adventure"]);
        let library = vec![
            entry(2, &["Action", "RPG"]),                  // 2/3 ≈ 0.67
            entry(3, &["Action", "RPG", "Adventure"]),     // 3/3 = 1.0
            entry(4, &["Puzzle"]),                         // 0 shared -> excluded
            target.clone(),
            entry(5, &["Strategy"]),                       // 0 shared -> excluded
            entry(6, &["Action", "Strategy"]),             // 1/4 = 0.25
        ];
        let top = closest_by_genre(&target, &library, 3);
        let ids: Vec<i64> = top.iter().map(|e| e.id).collect();
        assert_eq!(ids, vec![3, 2, 6]);
    }

    #[test]
    fn jaccard_prefers_precise_over_generic() {
        // A 2-genre game matching both beats a 5-genre game matching the same
        // two — the raw shared count (2 vs 2) would have called them equal.
        let target = entry(1, &["Action", "RPG"]);
        let broad = entry(2, &["Action", "RPG", "Indie", "Strategy", "Adventure"]);
        let precise = entry(3, &["Action", "RPG"]);
        let library = vec![broad, precise, target.clone()];
        let top = closest_by_genre(&target, &library, 2);
        assert_eq!(top[0].id, 3);
        assert_eq!(top[1].id, 2);
    }

    #[test]
    fn genreless_target_has_no_matches() {
        let target = entry(1, &[]);
        let library = vec![entry(2, &["Action"]), entry(3, &[])];
        assert!(closest_by_genre(&target, &library, 3).is_empty());
    }

    #[test]
    fn status_validation_rejects_empty_and_unknown() {
        assert!(validate_statuses(vec![]).is_err());
        assert!(validate_statuses(vec!["Beaten".to_string()]).is_err());
        assert_eq!(
            validate_statuses(vec!["Playing".to_string(), "Completed".to_string()]).unwrap(),
            vec!["Playing".to_string(), "Completed".to_string()]
        );
    }

    #[test]
    fn eligible_pool_matches_the_requested_scope_exactly() {
        let conn = test_conn();
        add_entry(&conn, 1, "WantToPlay");
        add_entry(&conn, 2, "Playing");
        add_entry(&conn, 3, "Completed");
        add_entry(&conn, 4, "Dropped");

        let played = select_eligible(
            &conn,
            1,
            &["Playing".to_string(), "Completed".to_string(), "Dropped".to_string()],
        )
        .unwrap();
        assert_eq!(sorted_ids(&played), vec![2, 3, 4]);

        let finished =
            select_eligible(&conn, 1, &["Completed".to_string(), "Dropped".to_string()]).unwrap();
        assert_eq!(sorted_ids(&finished), vec![3, 4]);
    }

    #[test]
    fn successful_start_clears_previous_cycle_tags() {
        let conn = test_conn();
        add_entry(&conn, 1, "Completed");
        add_entry(&conn, 2, "Completed");
        tag_rerated(&conn, 1).unwrap();

        // Game 1 is cooling down; only game 2 is eligible.
        let pool = pick_cycle_pool(&conn, 1, &["Completed".to_string()]).unwrap();
        assert_eq!(sorted_ids(&pool), vec![2]);

        // The cycle started, so game 1's tag was cleared and it is eligible again.
        assert_eq!(tag_count(&conn), 0);
        let next = select_eligible(&conn, 1, &["Completed".to_string()]).unwrap();
        assert_eq!(sorted_ids(&next), vec![1, 2]);
    }

    #[test]
    fn fully_tagged_scope_resets_cooldown_and_cycles() {
        let conn = test_conn();
        add_entry(&conn, 1, "Completed");
        add_entry(&conn, 2, "Completed");
        tag_rerated(&conn, 1).unwrap();
        tag_rerated(&conn, 2).unwrap();

        // Nothing is untagged, but the scope has games: starting clears the
        // cooldown instead of dead-ending the feature.
        let pool = pick_cycle_pool(&conn, 1, &["Completed".to_string()]).unwrap();
        assert_eq!(pool.len(), 1); // pool_size_for(2) == 1
        assert_eq!(tag_count(&conn), 0);
    }

    #[test]
    fn empty_scope_leaves_previous_tags_alone() {
        let conn = test_conn();
        add_entry(&conn, 1, "Completed");
        tag_rerated(&conn, 1).unwrap();

        // No Dropped games exist: an empty pool must not wipe game 1's tag.
        let pool = pick_cycle_pool(&conn, 1, &["Dropped".to_string()]).unwrap();
        assert!(pool.is_empty());
        assert_eq!(tag_count(&conn), 1);
    }

    #[test]
    fn tag_is_scheduling_state_not_a_rating_row() {
        let conn = test_conn();
        add_entry(&conn, 1, "Completed");

        tag_rerated(&conn, 1).unwrap();
        let rating_rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM rating WHERE library_entry_id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rating_rows, 0);
        let tag: String = conn
            .query_row("SELECT rerated_at FROM rerate_tag WHERE library_entry_id = 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(!tag.is_empty());

        // Re-tagging updates in place instead of duplicating.
        tag_rerated(&conn, 1).unwrap();
        assert_eq!(tag_count(&conn), 1);

        assert!(tag_rerated(&conn, 99).is_err());
    }
}
