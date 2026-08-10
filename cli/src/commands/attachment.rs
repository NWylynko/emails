use anyhow::{Context, Result};
use serde_json::json;
use std::fs;
use std::path::PathBuf;

use crate::client::ApiClient;
use crate::commands::AttachmentsResponse;
use crate::config::print_json;

pub fn list_attachments(client: &ApiClient, email_id: i32, human: bool) -> Result<()> {
    let resp: AttachmentsResponse =
        client.get_json(&format!("/v1/emails/{email_id}/attachments"))?;
    if human {
        for a in &resp.attachments {
            println!(
                "#{:<6} {} ({} bytes, {})",
                a.attachment_id,
                a.name.as_deref().unwrap_or("unnamed"),
                a.size,
                a.content_type
            );
        }
        Ok(())
    } else {
        print_json(&resp)
    }
}

pub fn get_attachment(
    client: &ApiClient,
    attachment_id: i32,
    output: Option<PathBuf>,
) -> Result<()> {
    let (bytes, _content_type, filename) =
        client.get_bytes(&format!("/v1/attachments/{attachment_id}"))?;

    let path = match output {
        Some(path) => path,
        None => PathBuf::from(
            filename.unwrap_or_else(|| format!("attachment-{attachment_id}")),
        ),
    };

    fs::write(&path, &bytes).with_context(|| format!("failed to write {}", path.display()))?;
    print_json(&json!({
        "attachmentId": attachment_id,
        "path": path,
        "bytes": bytes.len(),
    }))
}
