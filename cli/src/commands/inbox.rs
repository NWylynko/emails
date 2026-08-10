use anyhow::Result;
use serde_json::json;

use crate::client::{encode_inbox, ApiClient};
use crate::commands::InboxMuteResponse;
use crate::config::print_json;

pub fn mute(client: &ApiClient, to: &str, silent: bool, human: bool) -> Result<()> {
    let path = format!("/v1/inboxes/{}", encode_inbox(to));
    let resp: InboxMuteResponse = client.put_json(&path, &json!({ "silent": silent }))?;
    if human {
        println!(
            "{} {}",
            resp.inbox,
            if resp.silent { "muted" } else { "unmuted" }
        );
        Ok(())
    } else {
        print_json(&resp)
    }
}
