use anyhow::Result;

use crate::client::{encode_inbox, ApiClient};
use crate::commands::EmailsResponse;
use crate::config::print_json;

pub fn run(
    client: &ApiClient,
    to: &str,
    limit: u32,
    unread: bool,
    since: Option<&str>,
    after_id: Option<i32>,
    from: Option<&str>,
    subject: Option<&str>,
    human: bool,
) -> Result<()> {
    let mut path = format!(
        "/v1/inboxes/{}/emails?limit={limit}",
        encode_inbox(to)
    );
    if unread {
        path.push_str("&unread=true");
    }
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
    if human {
        for email in &resp.emails {
            println!(
                "#{:<6} {}  {}  {}",
                email.email_id,
                if email.viewed { " " } else { "*" },
                email.timestamp,
                email.subject.as_deref().unwrap_or("(no subject)")
            );
            println!("         from: {}", email.from);
        }
        Ok(())
    } else {
        print_json(&resp)
    }
}
