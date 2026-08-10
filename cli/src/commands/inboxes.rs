use anyhow::Result;

use crate::client::ApiClient;
use crate::commands::InboxesResponse;
use crate::config::print_json;

pub fn run(client: &ApiClient, human: bool) -> Result<()> {
    let resp: InboxesResponse = client.get_json("/v1/inboxes")?;
    if human {
        for inbox in &resp.inboxes {
            println!(
                "{:<40} count={:<5} unread={:<5} latest={}",
                inbox.to,
                inbox.count,
                inbox.unread,
                inbox.latest.as_deref().unwrap_or("-")
            );
        }
        Ok(())
    } else {
        print_json(&resp)
    }
}
