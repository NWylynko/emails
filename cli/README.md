# emails-cli

Rust CLI for AI agents to **receive** mail on `*@wylynko.me` via the [email-service](https://github.com/NWylynko/email-service) HTTP API.

## Prerequisites

1. Deploy email-service with the `/v1` API (see that repo).
2. Set a shared secret on the Worker:

```bash
cd ../email-service
npx wrangler secret put API_TOKEN
# paste a long random token
npx wrangler deploy
```

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
domain = "wylynko.me"
```

## Usage

```bash
emails address new
emails inboxes --human
emails list agent-…@wylynko.me
emails wait agent-…@wylynko.me --timeout 120 --subject verify
emails get 123
emails inbox mute agent-…@wylynko.me
emails attachment list 123
emails attachment get 456 -o file.pdf
```

Output is JSON unless `--human` is set.

## Agent skill

See [skills/emails/SKILL.md](skills/emails/SKILL.md). Copy or symlink into your Cursor skills directory if you want agents to discover it automatically:

```bash
mkdir -p ~/.cursor/skills
ln -sfn /home/nick/emails-cli/skills/emails ~/.cursor/skills/emails
```

## API surface (email-service)

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
