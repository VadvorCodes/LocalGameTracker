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
    pub async fn search(&self, query: &str, page: u32) -> AppResult<RawgSearchResponse> {
        let key = self
            .api_key
            .read()
            .unwrap()
            .clone()
            .ok_or_else(|| AppError::msg("no-api-key"))?;
        let resp = self
            .http
            .get("https://api.rawg.io/api/games")
            .query(&[
                ("key", key.as_str()),
                ("search", query),
                ("page", &page.to_string()),
                ("page_size", "24"),
                ("search_precise", "true"),
            ])
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(AppError::msg(format!("rawg-http-{}", resp.status().as_u16())));
        }
        Ok(resp.json().await?)
    }
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
        }
    }
}
