# emails-cli

Rust CLI for AI agents to **receive** mail on `*@example.com` via the `/v1` HTTP API of the emails Worker (this repo; the old standalone `email-service` repo is archived).

## Prerequisites

1. Deploy the emails Worker (see the root `AGENTS.md`).
2. Set `API_TOKEN` in Infisical so the secret sync delivers it to the Worker.
3. Note the Worker URL (your custom domain or workers.dev route).

## Install

```bash
cargo install --path .
```

## Configure

```bash
export EMAILS_API_URL="https://<your-emails-deployment>"
export EMAILS_API_TOKEN="the-same-token"
```

Or write `~/.config/emails-cli/config.toml`:

```toml
api_url = "https://<your-emails-deployment>"
api_token = "…"
domain = "example.com"
```

## Usage

```bash
emails address new
emails inboxes --human
emails list agent-…@example.com
emails wait agent-…@example.com --timeout 120 --subject verify
emails get 123
emails inbox mute agent-…@example.com
emails attachment list 123
emails attachment get 456 -o file.pdf
```

Output is JSON unless `--human` is set.

## Agent skill

See [skills/emails/SKILL.md](skills/emails/SKILL.md). Copy or symlink into your Cursor skills directory if you want agents to discover it automatically:

```bash
mkdir -p ~/.cursor/skills
ln -sfn /path/to/emails/cli/skills/emails ~/.cursor/skills/emails
```

## API surface

All routes require `Authorization: Bearer <API_TOKEN>`.

| Method | Path |
|--------|------|
| GET | `/v1/inboxes` |
| GET | `/v1/inboxes/:to/emails` |
| PUT | `/v1/inboxes/:to` body `{ "silent": bool }` |
| GET | `/v1/emails/:id` |
| GET | `/v1/emails/:id/attachments` |
| GET | `/v1/attachments/:id` |
| GET | `/v1/health` |
