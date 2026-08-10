use anyhow::{Context, Result};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub api_url: String,
    pub api_token: String,
}

#[derive(Debug, Default, Deserialize)]
struct FileConfig {
    api_url: Option<String>,
    api_token: Option<String>,
    domain: Option<String>,
}

impl Config {
    /// Load domain from env/file (API credentials optional).
    pub fn domain() -> String {
        std::env::var("EMAILS_DOMAIN")
            .ok()
            .or_else(|| load_file_config().ok().and_then(|f| f.domain))
            .unwrap_or_else(|| "wylynko.me".to_string())
    }

    pub fn load() -> Result<Self> {
        let file = load_file_config().unwrap_or_default();

        let api_url = std::env::var("EMAILS_API_URL")
            .ok()
            .or(file.api_url)
            .context(
                "missing EMAILS_API_URL (or api_url in ~/.config/emails-cli/config.toml)",
            )?;

        let api_token = std::env::var("EMAILS_API_TOKEN")
            .ok()
            .or(file.api_token)
            .context(
                "missing EMAILS_API_TOKEN (or api_token in ~/.config/emails-cli/config.toml)",
            )?;

        Ok(Self {
            api_url: api_url.trim_end_matches('/').to_string(),
            api_token,
        })
    }
}

fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("emails-cli")
        .join("config.toml")
}

fn load_file_config() -> Result<FileConfig> {
    let path = config_path();
    if !path.exists() {
        return Ok(FileConfig::default());
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let parsed: FileConfig = toml::from_str(&raw)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(parsed)
}

pub fn print_json(value: &impl serde::Serialize) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

pub fn print_error_json(message: &str) {
    let err = serde_json::json!({ "error": message });
    if let Ok(s) = serde_json::to_string_pretty(&err) {
        eprintln!("{s}");
    } else {
        eprintln!("{message}");
    }
}
