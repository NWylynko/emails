use anyhow::Result;

use crate::client::ApiClient;
use crate::commands::EmailDetail;
use crate::config::print_json;

pub fn run(client: &ApiClient, id: i32, html: bool, no_mark: bool, human: bool) -> Result<()> {
    let mut path = format!("/v1/emails/{id}?body=true&mark={}", !no_mark);
    if html {
        path.push_str("&html=true");
    }
    let email: EmailDetail = client.get_json(&path)?;
    if human {
        println!("#{}  {}", email.email_id, email.subject.as_deref().unwrap_or("(no subject)"));
        println!("From: {}", email.from);
        println!("To:   {}", email.to);
        println!("At:   {}", email.timestamp);
        println!("Viewed: {}", email.viewed);
        if let Some(body) = &email.body {
            println!("\n{body}");
        }
        if !email.attachments.is_empty() {
            println!("\nAttachments:");
            for a in &email.attachments {
                println!(
                    "  #{} {} ({} bytes)",
                    a.attachment_id,
                    a.name.as_deref().unwrap_or("unnamed"),
                    a.size
                );
            }
        }
        Ok(())
    } else {
        print_json(&email)
    }
}
