use anyhow::{bail, Result};
use std::thread;
use std::time::{Duration, Instant};

use crate::client::{encode_inbox, ApiClient};
use crate::commands::{EmailDetail, EmailsResponse};
use crate::config::print_json;

pub fn run(
    client: &ApiClient,
    to: &str,
    timeout_secs: u64,
    interval_secs: u64,
    from: Option<&str>,
    subject: Option<&str>,
    since: Option<&str>,
    after_id: Option<i32>,
) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    let interval = Duration::from_secs(interval_secs.max(1));

    loop {
        let mut path = format!(
            "/v1/inboxes/{}/emails?limit=20",
            encode_inbox(to)
        );
        if let Some(since) = since {
            path.push_str(&format!("&since={}", urlencoding::encode(since)));
        }
        if let Some(after_id) = after_id {
            path.push_str(&format!("&after_id={after_id}"));
        }
        if let Some(from) = from {
            path.push_str(&format!("&from={}", urlencoding::encode(from)));
        }
        if let Some(subject) = subject {
            path.push_str(&format!("&subject={}", urlencoding::encode(subject)));
        }

        let resp: EmailsResponse = client.get_json(&path)?;
        if let Some(summary) = resp.emails.first() {
            let detail: EmailDetail = client.get_json(&format!(
                "/v1/emails/{}?body=true&html=false&mark=true",
                summary.email_id
            ))?;
            print_json(&detail)?;
            return Ok(());
        }

        if Instant::now() >= deadline {
            bail!("timeout waiting for email to {to}");
        }
        thread::sleep(interval);
    }
}
