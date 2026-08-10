use anyhow::{bail, Context, Result};
use reqwest::blocking::Client;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

use crate::config::Config;

#[derive(Clone)]
pub struct ApiClient {
    http: Client,
    base: String,
    token: String,
}

impl ApiClient {
    pub fn new(config: &Config) -> Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .context("failed to build HTTP client")?;
        Ok(Self {
            http,
            base: config.api_url.clone(),
            token: config.api_token.clone(),
        })
    }

    pub fn get_json<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.base, path);
        let response = self
            .http
            .get(&url)
            .bearer_auth(&self.token)
            .send()
            .with_context(|| format!("GET {url}"))?;
        Self::parse_json(response)
    }

    pub fn put_json<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T> {
        let url = format!("{}{}", self.base, path);
        let response = self
            .http
            .put(&url)
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .with_context(|| format!("PUT {url}"))?;
        Self::parse_json(response)
    }

    pub fn get_bytes(&self, path: &str) -> Result<(Vec<u8>, Option<String>, Option<String>)> {
        let url = format!("{}{}", self.base, path);
        let response = self
            .http
            .get(&url)
            .bearer_auth(&self.token)
            .send()
            .with_context(|| format!("GET {url}"))?;

        let status = response.status();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let filename = response
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
            .and_then(parse_filename);

        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
                    bail!("{err}");
                }
            }
            bail!("HTTP {status}: {text}");
        }

        let bytes = response.bytes()?.to_vec();
        Ok((bytes, content_type, filename))
    }

    fn parse_json<T: DeserializeOwned>(response: reqwest::blocking::Response) -> Result<T> {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        if !status.is_success() {
            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
                    bail!("{err}");
                }
            }
            bail!("HTTP {status}: {text}");
        }
        serde_json::from_str(&text).with_context(|| format!("invalid JSON: {text}"))
    }
}

fn parse_filename(disposition: &str) -> Option<String> {
    // attachment; filename="foo.pdf"
    for part in disposition.split(';') {
        let part = part.trim();
        if let Some(rest) = part.strip_prefix("filename=") {
            let name = rest.trim().trim_matches('"');
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }
    None
}

pub fn encode_inbox(to: &str) -> String {
    urlencoding::encode(to).into_owned()
}
