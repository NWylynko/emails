use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process::ExitCode;

mod client;
mod commands;
mod config;

use client::ApiClient;
use config::Config;

#[derive(Parser, Debug)]
#[command(name = "emails", about = "Receive *@wylynko.me mail for AI agents", version)]
struct Cli {
    /// Pretty human-readable output instead of JSON
    #[arg(long, global = true)]
    human: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Generate a fresh catch-all address (no API call)
    Address {
        #[command(subcommand)]
        command: AddressCmd,
    },
    /// List inboxes that have received mail
    Inboxes,
    /// List emails for an inbox address
    List {
        /// Full address, e.g. agent-…@wylynko.me
        to: String,
        #[arg(long, default_value_t = 50)]
        limit: u32,
        #[arg(long)]
        unread: bool,
        #[arg(long)]
        since: Option<String>,
        #[arg(long)]
        after_id: Option<i32>,
        #[arg(long)]
        from: Option<String>,
        #[arg(long)]
        subject: Option<String>,
    },
    /// Fetch a single email by id
    Get {
        id: i32,
        #[arg(long)]
        html: bool,
        #[arg(long)]
        no_mark: bool,
    },
    /// Poll until a matching email arrives
    Wait {
        to: String,
        #[arg(long, default_value_t = 120)]
        timeout: u64,
        #[arg(long, default_value_t = 2)]
        interval: u64,
        #[arg(long)]
        from: Option<String>,
        #[arg(long)]
        subject: Option<String>,
        #[arg(long)]
        since: Option<String>,
        #[arg(long)]
        after_id: Option<i32>,
    },
    /// Mute / unmute push notifications for an inbox
    Inbox {
        #[command(subcommand)]
        command: InboxCmd,
    },
    /// Attachment operations
    Attachment {
        #[command(subcommand)]
        command: AttachmentCmd,
    },
}

#[derive(Subcommand, Debug)]
enum AddressCmd {
    /// Print a new agent-<uuid>@domain address
    New {
        #[arg(long, default_value = "agent")]
        prefix: String,
    },
}

#[derive(Subcommand, Debug)]
enum InboxCmd {
    Mute { to: String },
    Unmute { to: String },
}

#[derive(Subcommand, Debug)]
enum AttachmentCmd {
    List { email_id: i32 },
    Get {
        id: i32,
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            config::print_error_json(&format!("{err:#}"));
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Address {
            command: AddressCmd::New { prefix },
        } => commands::address::run(&prefix),
        other => {
            let config = Config::load().context("load config")?;
            let client = ApiClient::new(&config)?;
            match other {
                Commands::Inboxes => commands::inboxes::run(&client, cli.human),
                Commands::List {
                    to,
                    limit,
                    unread,
                    since,
                    after_id,
                    from,
                    subject,
                } => commands::list::run(
                    &client,
                    &to,
                    limit,
                    unread,
                    since.as_deref(),
                    after_id,
                    from.as_deref(),
                    subject.as_deref(),
                    cli.human,
                ),
                Commands::Get { id, html, no_mark } => {
                    commands::get::run(&client, id, html, no_mark, cli.human)
                }
                Commands::Wait {
                    to,
                    timeout,
                    interval,
                    from,
                    subject,
                    since,
                    after_id,
                } => commands::wait::run(
                    &client,
                    &to,
                    timeout,
                    interval,
                    from.as_deref(),
                    subject.as_deref(),
                    since.as_deref(),
                    after_id,
                ),
                Commands::Inbox { command } => match command {
                    InboxCmd::Mute { to } => commands::inbox::mute(&client, &to, true, cli.human),
                    InboxCmd::Unmute { to } => {
                        commands::inbox::mute(&client, &to, false, cli.human)
                    }
                },
                Commands::Attachment { command } => match command {
                    AttachmentCmd::List { email_id } => {
                        commands::attachment::list_attachments(&client, email_id, cli.human)
                    }
                    AttachmentCmd::Get { id, output } => {
                        commands::attachment::get_attachment(&client, id, output)
                    }
                },
                Commands::Address { .. } => unreachable!(),
            }
        }
    }
}
