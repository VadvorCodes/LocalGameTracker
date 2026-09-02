use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub rawg_api_key: Option<String>,
}

impl Settings {
    pub fn load(path: &std::path::Path) -> crate::error::AppResult<Self> {
        match std::fs::read_to_string(path) {
            Ok(s) => Ok(serde_json::from_str(&s).unwrap_or_default()),
            Err(_) => Ok(Self::default()), // first run
        }
    }

    pub fn save(&self, path: &std::path::Path) -> crate::error::AppResult<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}
