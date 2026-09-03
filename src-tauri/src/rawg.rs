use serde::{Deserialize, Serialize};
use std::sync::RwLock;

use crate::error::{AppError, AppResult};
use crate::models::CachedGame;

// ---------- RAWG API types (only what we use) ----------

#[derive(Debug, Deserialize)]
pub struct RawgSearchResponse {
    pub count: u64,
    pub results: Vec<RawgGame>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawgGame {
    pub id: i64,
    pub name: String,
    pub background_image: Option<String>,
    pub released: Option<String>,
    pub genres: Option<Vec<RawgNamed>>,
    pub platforms: Option<Vec<RawgPlatformHolder>>,
    pub developers: Option<Vec<RawgNamed>>,
    pub added: Option<i64>,
    pub metacritic: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawgNamed {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawgPlatformHolder {
    pub platform: RawgNamed,
}

pub struct RawgClient {
    http: reqwest::Client,
    api_key: std::sync::RwLock<Option<String>>,
}

impl RawgClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self { http: reqwest::Client::new(), api_key: RwLock::new(api_key) }
    }

    pub fn set_api_key(&self, key: Option<String>) {
        *self.api_key.write().unwrap() = key;
    }

    pub fn has_key(&self) -> bool {
        self.api_key.read().unwrap().is_some()
    }

    /// Search RAWG. Returns AppError::Msg("offline: ...") style errors so the
    /// caller can fall back to the local cache.
    pub async fn search(
        &self,
        query: &str,
        page: u32,
        filters: &crate::models::SearchFilters,
    ) -> AppResult<RawgSearchResponse> {
        let key = self
            .api_key
            .read()
            .unwrap()
            .clone()
            .ok_or_else(|| AppError::msg("no-api-key"))?;
        let resp = self
            .http
            .get("https://api.rawg.io/api/games")
            .query(&build_search_params(&key, query, page, filters))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(AppError::msg(format!("rawg-http-{}", resp.status().as_u16())));
        }
        Ok(resp.json().await?)
    }
}

/// Query params for the /games search endpoint. The RAWG `dates` range uses
/// sentinel bounds so an open-ended year filter still sends a complete range.
fn build_search_params(
    key: &str,
    query: &str,
    page: u32,
    filters: &crate::models::SearchFilters,
) -> Vec<(String, String)> {
    let mut params = vec![
        ("key".into(), key.into()),
        ("search".into(), query.into()),
        ("page".into(), page.to_string()),
        ("page_size".into(), "40".into()),
        ("search_precise".into(), "true".into()),
    ];
    if filters.from_year.is_some() || filters.to_year.is_some() {
        let from = filters.from_year.unwrap_or(1970);
        let to = filters.to_year.unwrap_or(2035);
        params.push(("dates".into(), format!("{from}-01-01,{to}-12-31")));
    }
    if filters.exclude_additions.unwrap_or(false) {
        params.push(("exclude_additions".into(), "true".into()));
    }
    params
}

impl From<&RawgGame> for CachedGame {
    fn from(g: &RawgGame) -> Self {
        CachedGame {
            rawg_id: g.id,
            name: g.name.clone(),
            cover_url: g.background_image.clone(),
            genres: g.genres.iter().flatten().map(|x| x.name.clone()).collect(),
            platforms: g
                .platforms
                .iter()
                .flatten()
                .map(|p| p.platform.name.clone())
                .collect(),
            release_date: g.released.clone(),
            developer: g.developers.as_ref().and_then(|d| d.first().map(|x| x.name.clone())),
            added: g.added,
            metacritic: g.metacritic,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SearchFilters;

    #[test]
    fn params_default_to_relevance_search_only() {
        let p = build_search_params("KEY", "call of duty", 1, &SearchFilters::default());
        assert_eq!(
            p,
            vec![
                ("key".to_string(), "KEY".to_string()),
                ("search".to_string(), "call of duty".to_string()),
                ("page".to_string(), "1".to_string()),
                ("page_size".to_string(), "40".to_string()),
                ("search_precise".to_string(), "true".to_string()),
            ]
        );
    }

    #[test]
    fn params_include_dates_and_exclude_additions_when_set() {
        let filters = SearchFilters {
            from_year: Some(2000),
            to_year: None,
            exclude_additions: Some(true),
        };
        let p = build_search_params("KEY", "zelda", 2, &filters);
        assert!(p.contains(&("dates".to_string(), "2000-01-01,2035-12-31".to_string())));
        assert!(p.contains(&("exclude_additions".to_string(), "true".to_string())));
        let to_only = SearchFilters { to_year: Some(2010), ..Default::default() };
        let p = build_search_params("KEY", "x", 1, &to_only);
        assert!(p.contains(&("dates".to_string(), "1970-01-01,2010-12-31".to_string())));
    }

    #[test]
    fn rawg_game_deserializes_popularity_fields() {
        let json = r#"{
            "id": 28, "name": "Red Dead Redemption 2", "released": "2018-10-26",
            "added": 5300, "metacritic": 96
        }"#;
        let g: RawgGame = serde_json::from_str(json).unwrap();
        assert_eq!(g.added, Some(5300));
        assert_eq!(g.metacritic, Some(96));
        let cached = CachedGame::from(&g);
        assert_eq!(cached.added, Some(5300));
        assert_eq!(cached.metacritic, Some(96));
    }
}
