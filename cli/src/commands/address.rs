use anyhow::Result;
use serde_json::json;
use uuid::Uuid;

use crate::config::{print_json, Config};

pub fn run(prefix: &str) -> Result<()> {
    let local = format!("{prefix}-{}", Uuid::new_v4());
    let address = format!("{local}@{}", Config::domain());
    print_json(&json!({ "address": address }))
}
