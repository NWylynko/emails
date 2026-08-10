pub mod address;
pub mod attachment;
pub mod get;
pub mod inbox;
pub mod inboxes;
pub mod list;
pub mod wait;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct InboxesResponse {
    pub inboxes: Vec<InboxSummary>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct InboxSummary {
    pub to: String,
    pub count: i64,
    pub unread: i64,
    pub latest: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmailsResponse {
    pub emails: Vec<EmailSummary>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct EmailSummary {
    #[serde(rename = "emailId")]
    pub email_id: i32,
    pub from: String,
    pub to: String,
    pub subject: Option<String>,
    pub timestamp: String,
    pub viewed: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmailDetail {
    #[serde(rename = "emailId")]
    pub email_id: i32,
    pub from: String,
    pub to: String,
    pub subject: Option<String>,
    pub timestamp: String,
    pub viewed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    pub attachments: Vec<AttachmentMeta>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AttachmentsResponse {
    pub attachments: Vec<AttachmentMeta>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AttachmentMeta {
    #[serde(rename = "attachmentId")]
    pub attachment_id: i32,
    #[serde(rename = "emailId", default, skip_serializing_if = "Option::is_none")]
    pub email_id: Option<i32>,
    pub name: Option<String>,
    pub size: i32,
    #[serde(rename = "contentType")]
    pub content_type: String,
    pub timestamp: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct InboxMuteResponse {
    pub inbox: String,
    pub silent: bool,
}
