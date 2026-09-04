use rusqlite::params;
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::scoring::round1;
use crate::AppState;

/// One ready-to-plot analytics payload. Every series is computed in SQL/Rust
/// so the frontend only renders.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Analytics {
    pub total_games: i64,
    pub status_counts: Vec<StatusCount>,
    pub favourites: i64,
    pub total_playtime_minutes: i64,

    // rating aggregates
    pub avg_stars: Option<f64>,
    pub avg_overall: Option<f64>,
    pub category_averages: CategoryAverages,
    pub star_distribution: Vec<Countpoint>, // x = 0..5 stars, y = count
    pub score_distribution: Vec<Countpoint>, // x = 0..95 in steps of 5 (bucket low edge), y = count

    // breakdowns
    pub genre_breakdown: Vec<Breakdown>,
    pub platform_breakdown: Vec<Breakdown>,

    // extremes
    pub highest_rated: Vec<MiniEntry>,
    pub lowest_rated: Vec<MiniEntry>,

    // the 3 most recently rated games
    pub recently_rated: Vec<MiniEntry>,

    // trends
    pub rating_trend: Vec<Trendpoint>, // by month of rated_at
    pub category_trend: Vec<CategoryTrendpoint>, // avg per category by month
    pub latest_five: Option<CategoryAverages>, // avg of the 5 most recently rated games

    // star vs detailed divergence
    pub gut_feeling_games: Vec<MiniEntry>, // stars notably higher than detailed score
    pub on_reflection_games: Vec<MiniEntry>, // detailed score notably higher than stars
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusCount {
    pub status: String,
    pub count: i64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CategoryAverages {
    pub gameplay: Option<f64>,
    pub story: Option<f64>,
    pub music: Option<f64>,
    pub technical: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Countpoint {
    pub x: f64,
    pub y: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Breakdown {
    pub label: String,
    pub count: i64,
    pub avg_stars: Option<f64>,
    pub avg_overall: Option<f64>,
    pub total_playtime: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniEntry {
    pub entry_id: i64,
    pub name: String,
    pub cover_url: Option<String>,
    pub stars: Option<f64>,
    pub overall: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Trendpoint {
    pub month: String, // "2026-03"
    pub avg_overall: Option<f64>,
    pub avg_stars: Option<f64>,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTrendpoint {
    pub month: String,
    pub gameplay: Option<f64>,
    pub story: Option<f64>,
    pub music: Option<f64>,
    pub technical: Option<f64>,
}

/// Stars-vs-score gap (on the 0-100 scale) that qualifies a game for the
/// "gut feeling" / "on reflection" panels.
const DIVERGENCE_THRESHOLD: f64 = 15.0;
/// Size of the highest/lowest/divergence panels.
const TOP_N: u32 = 5;
/// Size of the "recently rated" panel.
const RECENT_COUNT: u32 = 3;
/// Stars are bucketed in half-star steps: 0..=10 buckets of 0.5.
const STAR_BUCKETS: i64 = 10;
const STAR_STEP_DIVISOR: f64 = 2.0;
/// Scores are bucketed in fixed 5-point bins across 0..100 (0..20 bins).
const SCORE_BUCKET_WIDTH: i64 = 5;
const SCORE_BUCKET_COUNT: i64 = 20;

const JOIN: &str =
    "FROM library_entry e JOIN game_cache c ON c.rawg_id = e.rawg_id LEFT JOIN rating r ON r.library_entry_id = e.id";

#[tauri::command]
pub fn get_analytics(state: tauri::State<AppState>, mode: Option<String>) -> AppResult<Analytics> {
    let conn = state.db.lock().unwrap();
    let profile =
        super::profile::read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;
    let pid = profile.id;
    let (extreme_cond, extreme_desc, extreme_asc) = extreme_order(mode.as_deref());

    let mut a = Analytics {
        total_games: conn.query_row(
            &format!("SELECT COUNT(*) {JOIN} WHERE e.profile_id = ?1"),
            params![pid],
            |r| r.get(0),
        )?,
        favourites: conn.query_row(
            &format!("SELECT COUNT(*) {JOIN} WHERE e.profile_id = ?1 AND e.favourite = 1"),
            params![pid],
            |r| r.get(0),
        )?,
        total_playtime_minutes: conn.query_row(
            &format!("SELECT COALESCE(SUM(e.playtime_minutes),0) {JOIN} WHERE e.profile_id = ?1"),
            params![pid],
            |r| r.get(0),
        )?,
        ..Default::default()
    };
    a.status_counts = status_counts(&conn, pid)?;

    let avgs = rating_averages(&conn, pid)?;
    a.avg_stars = avgs.avg_stars;
    a.avg_overall = avgs.avg_overall;
    a.category_averages = avgs.categories;
    a.star_distribution = star_distribution(&conn, pid)?;
    a.score_distribution = score_distribution(&conn, pid)?;

    a.genre_breakdown = breakdown(&conn, pid, "c.genres")?;
    a.platform_breakdown = breakdown(&conn, pid, "c.platforms")?;

    a.highest_rated = top_entries(&conn, pid, extreme_cond, extreme_desc, TOP_N)?;
    a.lowest_rated = top_entries(&conn, pid, extreme_cond, extreme_asc, TOP_N)?;
    a.recently_rated = top_entries(
        &conn,
        pid,
        "r.rated_at IS NOT NULL",
        "r.rated_at DESC",
        RECENT_COUNT,
    )?;

    a.rating_trend = rating_trend(&conn, pid)?;
    a.category_trend = category_trend(&conn, pid)?;
    a.latest_five = latest_five(&conn, pid)?;

    a.gut_feeling_games = divergent(&conn, pid, true)?;
    a.on_reflection_games = divergent(&conn, pid, false)?;

    Ok(a)
}

/// Which rating drives the highest/lowest panels: "stars" (simple only),
/// "detailed" (detailed only), or "both" (games must carry both; current
/// default). Returns (condition, desc order, asc order).
type ExtremeOrder = (&'static str, &'static str, &'static str);

fn extreme_order(mode: Option<&str>) -> ExtremeOrder {
    match mode {
        Some("stars") => (
            "r.star_rating IS NOT NULL",
            "r.star_rating DESC",
            "r.star_rating ASC",
        ),
        Some("detailed") => (
            "r.computed_overall IS NOT NULL",
            "r.computed_overall DESC",
            "r.computed_overall ASC",
        ),
        _ => (
            "r.star_rating IS NOT NULL AND r.computed_overall IS NOT NULL",
            "r.computed_overall DESC",
            "r.computed_overall ASC",
        ),
    }
}

fn status_counts(conn: &rusqlite::Connection, pid: i64) -> AppResult<Vec<StatusCount>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT e.status, COUNT(*) {JOIN} WHERE e.profile_id = ?1 GROUP BY e.status"
    ))?;
    let it = stmt.query_map(params![pid], |r| {
        Ok(StatusCount {
            status: r.get(0)?,
            count: r.get(1)?,
        })
    })?;
    Ok(it.flatten().collect())
}

struct RatingAverages {
    avg_stars: Option<f64>,
    avg_overall: Option<f64>,
    categories: CategoryAverages,
}

/// Averages over the entries that carry the relevant rating.
fn rating_averages(conn: &rusqlite::Connection, pid: i64) -> AppResult<RatingAverages> {
    let avg_stars = conn.query_row(
        &format!("SELECT AVG(r.star_rating) {JOIN} WHERE e.profile_id = ?1 AND r.star_rating IS NOT NULL"),
        params![pid], |r| r.get(0))?;
    let avg_overall = conn.query_row(
        &format!("SELECT AVG(r.computed_overall) {JOIN} WHERE e.profile_id = ?1 AND r.computed_overall IS NOT NULL"),
        params![pid], |r| r.get(0))?;
    let mut categories = CategoryAverages::default();
    for (col, slot) in [
        ("r.gameplay", &mut categories.gameplay),
        ("r.story", &mut categories.story),
        ("r.music", &mut categories.music),
        ("r.technical", &mut categories.technical),
    ] {
        *slot = conn.query_row(
            &format!("SELECT AVG({col}) {JOIN} WHERE e.profile_id = ?1 AND {col} IS NOT NULL"),
            params![pid],
            |r| r.get(0),
        )?;
    }
    Ok(RatingAverages {
        avg_stars,
        avg_overall,
        categories,
    })
}

fn star_distribution(conn: &rusqlite::Connection, pid: i64) -> AppResult<Vec<Countpoint>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT CAST(ROUND(r.star_rating * 2) AS INTEGER) AS bucket, COUNT(*) {JOIN}
         WHERE e.profile_id = ?1 AND r.star_rating IS NOT NULL GROUP BY bucket ORDER BY bucket"
    ))?;
    let it = stmt.query_map(params![pid], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
    })?;
    let map: std::collections::BTreeMap<i64, i64> = it.flatten().collect();
    Ok((0..=STAR_BUCKETS)
        .map(|i| Countpoint {
            x: i as f64 / STAR_STEP_DIVISOR,
            y: *map.get(&i).unwrap_or(&0),
        })
        .collect())
}

fn score_distribution(conn: &rusqlite::Connection, pid: i64) -> AppResult<Vec<Countpoint>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT CAST(r.computed_overall / 5 AS INTEGER) * 5 AS bucket, COUNT(*) {JOIN}
         WHERE e.profile_id = ?1 AND r.computed_overall IS NOT NULL GROUP BY bucket ORDER BY bucket"
    ))?;
    let it = stmt.query_map(params![pid], |r| {
        Ok(Countpoint {
            x: r.get::<_, i64>(0)? as f64,
            y: r.get(1)?,
        })
    })?;
    let map: std::collections::BTreeMap<i64, i64> =
        it.flatten().map(|p| (p.x as i64, p.y)).collect();
    Ok((0..SCORE_BUCKET_COUNT)
        .map(|i| {
            let low = i * SCORE_BUCKET_WIDTH;
            Countpoint {
                x: low as f64,
                y: *map.get(&low).unwrap_or(&0),
            }
        })
        .collect())
}

fn rating_trend(conn: &rusqlite::Connection, pid: i64) -> AppResult<Vec<Trendpoint>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT strftime('%Y-%m', r.rated_at) m,
                AVG(r.computed_overall), AVG(r.star_rating), COUNT(*)
         {JOIN} WHERE e.profile_id = ?1 AND r.rated_at IS NOT NULL
         GROUP BY m ORDER BY m"
    ))?;
    let it = stmt.query_map(params![pid], |r| {
        Ok(Trendpoint {
            month: r.get(0)?,
            avg_overall: r.get(1)?,
            avg_stars: r.get(2)?,
            count: r.get(3)?,
        })
    })?;
    Ok(it.flatten().collect())
}

fn category_trend(conn: &rusqlite::Connection, pid: i64) -> AppResult<Vec<CategoryTrendpoint>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT strftime('%Y-%m', r.rated_at) m,
                AVG(r.gameplay), AVG(r.story), AVG(r.music), AVG(r.technical)
         {JOIN} WHERE e.profile_id = ?1 AND r.rated_at IS NOT NULL
         GROUP BY m ORDER BY m"
    ))?;
    let it = stmt.query_map(params![pid], |r| {
        Ok(CategoryTrendpoint {
            month: r.get(0)?,
            gameplay: r.get(1)?,
            story: r.get(2)?,
            music: r.get(3)?,
            technical: r.get(4)?,
        })
    })?;
    Ok(it.flatten().collect())
}

/// Average category scores of the 5 most recently rated games — the "now"
/// the dashboard contrasts with the whole-profile `category_averages`.
fn latest_five(conn: &rusqlite::Connection, pid: i64) -> AppResult<Option<CategoryAverages>> {
    // The outer aggregate (no GROUP BY) always yields exactly one row; COUNT
    // distinguishes "no rated games" from "rated games, all categories null".
    let (count, avgs) = conn.query_row(
        &format!(
            "SELECT COUNT(*), AVG(gameplay), AVG(story), AVG(music), AVG(technical) FROM (
                 SELECT r.gameplay, r.story, r.music, r.technical
                 {JOIN} WHERE e.profile_id = ?1 AND r.rated_at IS NOT NULL
                 ORDER BY r.rated_at DESC, r.library_entry_id DESC
                 LIMIT 5
             )"
        ),
        params![pid],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                CategoryAverages {
                    gameplay: r.get(1)?,
                    story: r.get(2)?,
                    music: r.get(3)?,
                    technical: r.get(4)?,
                },
            ))
        },
    )?;
    Ok((count > 0).then_some(avgs))
}

/// Games whose stars (0-5 -> 0-100) and detailed score disagree by at least
/// DIVERGENCE_THRESHOLD. `gut_feeling` selects stars-over-score; otherwise
/// score-over-stars.
fn divergent(
    conn: &rusqlite::Connection,
    pid: i64,
    gut_feeling: bool,
) -> AppResult<Vec<MiniEntry>> {
    let both_rated = "r.star_rating IS NOT NULL AND r.computed_overall IS NOT NULL";
    let (cond, order) = if gut_feeling {
        (
            format!("{both_rated} AND r.star_rating * 20 - r.computed_overall >= {DIVERGENCE_THRESHOLD}"),
            "(r.star_rating * 20 - r.computed_overall) DESC",
        )
    } else {
        (
            format!("{both_rated} AND r.computed_overall - r.star_rating * 20 >= {DIVERGENCE_THRESHOLD}"),
            "(r.computed_overall - r.star_rating * 20) DESC",
        )
    };
    top_entries(conn, pid, &cond, order, TOP_N)
}

/// Explode JSON-array columns (genres/platforms) into per-label aggregate rows.
fn breakdown(conn: &rusqlite::Connection, pid: i64, col: &str) -> AppResult<Vec<Breakdown>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {col}, r.star_rating, r.computed_overall, e.playtime_minutes
         {JOIN} WHERE e.profile_id = ?1"
    ))?;
    let it = stmt.query_map(params![pid], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, Option<f64>>(1)?,
            r.get::<_, Option<f64>>(2)?,
            r.get::<_, i64>(3)?,
        ))
    })?;

    #[derive(Default)]
    struct Acc {
        count: i64,
        stars_sum: f64,
        stars_n: usize,
        overall_sum: f64,
        overall_n: usize,
        playtime: i64,
    }

    let mut acc: std::collections::HashMap<String, Acc> = std::collections::HashMap::new();
    for (json, stars, overall, playtime) in it.flatten() {
        let labels: Vec<String> = serde_json::from_str(&json).unwrap_or_default();
        for label in labels {
            let e = acc.entry(label).or_default();
            e.count += 1;
            e.playtime += playtime;
            if let Some(s) = stars {
                e.stars_sum += s;
                e.stars_n += 1;
            }
            if let Some(o) = overall {
                e.overall_sum += o;
                e.overall_n += 1;
            }
        }
    }
    let mut out: Vec<Breakdown> = acc
        .into_iter()
        .map(|(label, v)| Breakdown {
            label,
            count: v.count,
            avg_stars: if v.stars_n > 0 {
                Some(round1(v.stars_sum / v.stars_n as f64))
            } else {
                None
            },
            avg_overall: if v.overall_n > 0 {
                Some(round1(v.overall_sum / v.overall_n as f64))
            } else {
                None
            },
            total_playtime: v.playtime,
        })
        .collect();
    out.sort_by(|a, b| b.count.cmp(&a.count).then(a.label.cmp(&b.label)));
    Ok(out.into_iter().take(10).collect())
}

fn top_entries(
    conn: &rusqlite::Connection,
    pid: i64,
    cond: &str,
    order: &str,
    limit: u32,
) -> AppResult<Vec<MiniEntry>> {
    // RANDOM() as the final tiebreaker shuffles equal-ranked rows (very common
    // at 5.0 stars), so the LIMIT sample differs from fetch to fetch.
    let mut stmt = conn.prepare(&format!(
        "SELECT e.id, c.name, c.cover_url, r.star_rating, r.computed_overall
         {JOIN} WHERE e.profile_id = ?1 AND {cond} ORDER BY {order}, RANDOM() LIMIT {limit}"
    ))?;
    let it = stmt.query_map(params![pid], |r| {
        Ok(MiniEntry {
            entry_id: r.get(0)?,
            name: r.get(1)?,
            cover_url: r.get(2)?,
            stars: r.get(3)?,
            overall: r.get(4)?,
        })
    })?;
    Ok(it.flatten().collect())
}
