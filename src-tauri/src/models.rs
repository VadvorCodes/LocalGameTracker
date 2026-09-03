use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryWeights {
    pub gameplay: f64,
    pub story: f64,
    pub music: f64,
    pub technical: f64,
}

impl Default for CategoryWeights {
    fn default() -> Self {
        Self {
            gameplay: 25.0,
            story: 25.0,
            music: 25.0,
            technical: 25.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: i64,
    pub username: String,
    pub category_weights: CategoryWeights,
    pub created_at: String,
}

/// A cached RAWG game, flattened for the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedGame {
    pub rawg_id: i64,
    pub name: String,
    pub cover_url: Option<String>,
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
    pub release_date: Option<String>,
    pub developer: Option<String>,
    pub added: Option<i64>,
    pub metacritic: Option<i64>,
}

/// Server-side filters for the RAWG search query. All optional.
#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchFilters {
    pub from_year: Option<i32>,
    pub to_year: Option<i32>,
    pub exclude_additions: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum PlayStatus {
    WantToPlay,
    Playing,
    Completed,
    Dropped,
}

impl PlayStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            PlayStatus::WantToPlay => "WantToPlay",
            PlayStatus::Playing => "Playing",
            PlayStatus::Completed => "Completed",
            PlayStatus::Dropped => "Dropped",
        }
    }
    pub fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "WantToPlay" => PlayStatus::WantToPlay,
            "Playing" => PlayStatus::Playing,
            "Completed" => PlayStatus::Completed,
            "Dropped" => PlayStatus::Dropped,
            _ => return None,
        })
    }
}

/// A library entry joined with its cached game metadata and rating.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: i64,
    pub rawg_id: i64,
    pub name: String,
    pub cover_url: Option<String>,
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
    pub release_date: Option<String>,
    pub developer: Option<String>,
    pub status: PlayStatus,
    pub favourite: bool,
    pub playtime_minutes: i64,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
    // rating (all nullable)
    pub star_rating: Option<f64>,
    pub gameplay: Option<i64>,
    pub story: Option<i64>,
    pub music: Option<i64>,
    pub technical: Option<i64>,
    pub computed_overall: Option<f64>,
    pub rated_at: Option<String>,
    // re-rate cooldown tag ("Recently Rerated"); scheduling state, not a rating
    pub rerated_at: Option<String>,
}

/// Query parameters for the library view. All filters optional.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LibraryQuery {
    pub search: Option<String>,
    pub statuses: Vec<String>,
    pub favourites_only: bool,
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
    pub min_stars: Option<f64>,
    pub max_stars: Option<f64>,
    pub min_score: Option<f64>,
    pub max_score: Option<f64>,
    pub sort: Option<String>, // see SORTS in commands/games.rs
    pub sort_desc: Option<bool>,
}
