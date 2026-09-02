use rusqlite::params;
use serde::Serialize;

use crate::error::{AppError, AppResult};
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
    pub star_distribution: Vec<Countpoint>,      // x = 0..5 stars, y = count
    pub score_distribution: Vec<Countpoint>,     // x = 0..95 in steps of 5 (bucket low edge), y = count

    // breakdowns
    pub genre_breakdown: Vec<Breakdown>,
    pub platform_breakdown: Vec<Breakdown>,

    // extremes
    pub highest_rated: Vec<MiniEntry>,
    pub lowest_rated: Vec<MiniEntry>,

    // the 3 most recently rated games
    pub recently_rated: Vec<MiniEntry>,

    // trends
    pub rating_trend: Vec<Trendpoint>,           // by month of rated_at
    pub category_trend: Vec<CategoryTrendpoint>, // avg per category by month
    pub first_vs_recent: Option<CategoryShift>,  // how tastes shifted

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryShift {
    pub first_quartile: CategoryAverages,
    pub recent_quartile: CategoryAverages,
}

const JOIN: &str =
    "FROM library_entry e JOIN game_cache c ON c.rawg_id = e.rawg_id LEFT JOIN rating r ON r.library_entry_id = e.id";

#[tauri::command]
pub fn get_analytics(
    state: tauri::State<AppState>,
    mode: Option<String>,
) -> AppResult<Analytics> {
    let conn = state.db.lock().unwrap();
    let profile = super::profile::read_profile(&conn)?.ok_or_else(|| AppError::msg("no profile"))?;
    let pid = profile.id;
    let mut a = Analytics::default();

    // Which rating drives the highest/lowest panels: "stars" (simple only),
    // "detailed" (detailed only), or "both" (games must carry both; current
    // default).
    let (extreme_cond, extreme_desc, extreme_asc) = match mode.as_deref() {
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
    };

    a.total_games = conn.query_row(
        &format!("SELECT COUNT(*) {JOIN} WHERE e.profile_id = ?1"),
        params![pid], |r| r.get(0))?;

    // status counts
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT e.status, COUNT(*) {JOIN} WHERE e.profile_id = ?1 GROUP BY e.status"
        ))?;
        let it = stmt.query_map(params![pid], |r| {
            Ok(StatusCount { status: r.get(0)?, count: r.get(1)? })
        })?;
        a.status_counts = it.flatten().collect();
    }
    a.favourites = conn.query_row(
        &format!("SELECT COUNT(*) {JOIN} WHERE e.profile_id = ?1 AND e.favourite = 1"),
        params![pid], |r| r.get(0))?;
    a.total_playtime_minutes = conn.query_row(
        &format!("SELECT COALESCE(SUM(e.playtime_minutes),0) {JOIN} WHERE e.profile_id = ?1"),
        params![pid], |r| r.get(0))?;

    // rating aggregates (over entries that have the relevant rating)
    a.avg_stars = conn.query_row(
        &format!("SELECT AVG(r.star_rating) {JOIN} WHERE e.profile_id = ?1 AND r.star_rating IS NOT NULL"),
        params![pid], |r| r.get(0))?;
    a.avg_overall = conn.query_row(
        &format!("SELECT AVG(r.computed_overall) {JOIN} WHERE e.profile_id = ?1 AND r.computed_overall IS NOT NULL"),
        params![pid], |r| r.get(0))?;
    for (col, slot) in [
        ("r.gameplay", &mut a.category_averages.gameplay),
        ("r.story", &mut a.category_averages.story),
        ("r.music", &mut a.category_averages.music),
        ("r.technical", &mut a.category_averages.technical),
    ] {
        *slot = conn.query_row(
            &format!("SELECT AVG({col}) {JOIN} WHERE e.profile_id = ?1 AND {col} IS NOT NULL"),
            params![pid], |r| r.get(0))?;
    }

    // distributions
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT CAST(ROUND(r.star_rating * 2) AS INTEGER) AS bucket, COUNT(*) {JOIN}
             WHERE e.profile_id = ?1 AND r.star_rating IS NOT NULL GROUP BY bucket ORDER BY bucket"
        ))?;
        let it = stmt.query_map(params![pid], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
        let map: std::collections::BTreeMap<i64, i64> = it.flatten().collect();
        a.star_distribution = (0..=10)
            .map(|i| Countpoint { x: i as f64 / 2.0, y: *map.get(&i).unwrap_or(&0) })
            .collect();
    }
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT CAST(r.computed_overall / 5 AS INTEGER) * 5 AS bucket, COUNT(*) {JOIN}
             WHERE e.profile_id = ?1 AND r.computed_overall IS NOT NULL GROUP BY bucket ORDER BY bucket"
        ))?;
        let it = stmt.query_map(params![pid], |r| Ok(Countpoint { x: r.get::<_, i64>(0)? as f64, y: r.get(1)? }))?;
        let map: std::collections::BTreeMap<i64, i64> = it.flatten().map(|p| (p.x as i64, p.y)).collect();
        a.score_distribution = (0..20).map(|i| Countpoint { x: (i * 5) as f64, y: *map.get(&(i * 5)).unwrap_or(&0) }).collect();
    }

    // genre & platform breakdowns (JSON arrays in cache -> LIKE extraction)
    a.genre_breakdown = breakdown(&conn, pid, "c.genres")?;
    a.platform_breakdown = breakdown(&conn, pid, "c.platforms")?;

    // extremes
    a.highest_rated = top_entries(&conn, pid, extreme_cond, extreme_desc, 5)?;
    a.lowest_rated = top_entries(&conn, pid, extreme_cond, extreme_asc, 5)?;

    // recently rated
    a.recently_rated = top_entries(&conn, pid, "r.rated_at IS NOT NULL", "r.rated_at DESC", 3)?;

    // trends by month
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT strftime('%Y-%m', r.rated_at) m,
                    AVG(r.computed_overall), AVG(r.star_rating), COUNT(*)
             {JOIN} WHERE e.profile_id = ?1 AND r.rated_at IS NOT NULL
             GROUP BY m ORDER BY m"
        ))?;
        let it = stmt.query_map(params![pid], |r| Ok(Trendpoint {
            month: r.get(0)?, avg_overall: r.get(1)?, avg_stars: r.get(2)?, count: r.get(3)?,
        }))?;
        a.rating_trend = it.flatten().collect();
    }
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT strftime('%Y-%m', r.rated_at) m,
                    AVG(r.gameplay), AVG(r.story), AVG(r.music), AVG(r.technical)
             {JOIN} WHERE e.profile_id = ?1 AND r.rated_at IS NOT NULL
             GROUP BY m ORDER BY m"
        ))?;
        let it = stmt.query_map(params![pid], |r| Ok(CategoryTrendpoint {
            month: r.get(0)?, gameplay: r.get(1)?, story: r.get(2)?, music: r.get(3)?, technical: r.get(4)?,
        }))?;
        a.category_trend = it.flatten().collect();
    }

    // first vs most recent quartile of rating history
    {
        let mut stmt = conn.prepare(&format!(
            "WITH ranked AS (
                 SELECT r.*, ROW_NUMBER() OVER (ORDER BY r.rated_at, r.library_entry_id) AS rn,
                        COUNT(*) OVER () AS total
                 {JOIN} WHERE e.profile_id = ?1 AND r.rated_at IS NOT NULL
             )
             SELECT CASE WHEN rn <= total / 4.0 THEN 'first' ELSE 'recent' END half,
                    AVG(gameplay), AVG(story), AVG(music), AVG(technical)
             FROM ranked
             WHERE rn <= total / 4.0 OR rn > total * 0.75
             GROUP BY half"
        ))?;
        let it = stmt.query_map(params![pid], |r| {
            Ok((r.get::<_, String>(0)?, CategoryAverages {
                gameplay: r.get(1)?, story: r.get(2)?, music: r.get(3)?, technical: r.get(4)?,
            }))
        })?;
        let mut first = None;
        let mut recent = None;
        for (half, avgs) in it.flatten() {
            match half.as_str() {
                "first" => first = Some(avgs),
                _ => recent = Some(avgs),
            }
        }
        a.first_vs_recent = match (first, recent) {
            (Some(f), Some(rc)) => Some(CategoryShift { first_quartile: f, recent_quartile: rc }),
            _ => None,
        };
    }

    // divergence: stars (0-5 -> 0-100) vs detailed score
    a.gut_feeling_games = top_entries(&conn, pid,
        "r.star_rating IS NOT NULL AND r.computed_overall IS NOT NULL AND r.star_rating * 20 - r.computed_overall >= 15",
        "(r.star_rating * 20 - r.computed_overall) DESC", 5)?;
    a.on_reflection_games = top_entries(&conn, pid,
        "r.star_rating IS NOT NULL AND r.computed_overall IS NOT NULL AND r.computed_overall - r.star_rating * 20 >= 15",
        "(r.computed_overall - r.star_rating * 20) DESC", 5)?;

    Ok(a)
}

/// Explode JSON-array columns (genres/platforms) into per-label aggregate rows.
fn breakdown(conn: &rusqlite::Connection, pid: i64, col: &str) -> AppResult<Vec<Breakdown>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {col}, r.star_rating, r.computed_overall, e.playtime_minutes
         {JOIN} WHERE e.profile_id = ?1"
    ))?;
    let it = stmt.query_map(params![pid], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, Option<f64>>(1)?, r.get::<_, Option<f64>>(2)?, r.get::<_, i64>(3)?))
    })?;
    let mut acc: std::collections::HashMap<String, (i64, f64, usize, f64, usize, i64)> =
        std::collections::HashMap::new();
    // label -> (count, stars_sum, stars_n, overall_sum, overall_n, playtime)
    for (json, stars, overall, playtime) in it.flatten() {
        let labels: Vec<String> = serde_json::from_str(&json).unwrap_or_default();
        for label in labels {
            let e = acc.entry(label).or_insert((0, 0.0, 0, 0.0, 0, 0));
            e.0 += 1;
            e.5 += playtime;
            if let Some(s) = stars {
                e.1 += s;
                e.2 += 1;
            }
            if let Some(o) = overall {
                e.3 += o;
                e.4 += 1;
            }
        }
    }
    let mut out: Vec<Breakdown> = acc
        .into_iter()
        .map(|(label, v)| Breakdown {
            label,
            count: v.0,
            avg_stars: if v.2 > 0 { Some(round1(v.1 / v.2 as f64)) } else { None },
            avg_overall: if v.4 > 0 { Some(round1(v.3 / v.4 as f64)) } else { None },
            total_playtime: v.5,
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
    let mut stmt = conn.prepare(&format!(
        "SELECT e.id, c.name, c.cover_url, r.star_rating, r.computed_overall
         {JOIN} WHERE e.profile_id = ?1 AND {cond} ORDER BY {order} LIMIT {limit}"
    ))?;
    let it = stmt.query_map(params![pid], |r| Ok(MiniEntry {
        entry_id: r.get(0)?, name: r.get(1)?, cover_url: r.get(2)?, stars: r.get(3)?, overall: r.get(4)?,
    }))?;
    Ok(it.flatten().collect())
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}
