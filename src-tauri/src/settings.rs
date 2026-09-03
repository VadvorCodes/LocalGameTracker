use serde::{Deserialize, Serialize};

/// User-defined custom theme colours (#rrggbb). The remaining shades are
/// derived from these two in the frontend (src/lib/themes.ts).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomTheme {
    pub base: String,
    pub accent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub rawg_api_key: Option<String>,
    /// Id of the selected colour theme preset (see src/lib/themes.ts),
    /// or "custom" when a user-defined theme is active.
    pub theme: Option<String>,
    /// Colours for the "custom" theme.
    pub custom_theme: Option<CustomTheme>,
    /// Whether the Library sort menu also lists the extended sorts (the
    /// "Other" and "By category" groups).
    pub extended_sorting: Option<bool>,
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
