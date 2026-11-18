---
name: emails
description: >-
  Receive email on your catch-all domain via the `emails` CLI (the `/v1` API of the emails Worker).
  Use when an agent needs a disposable inbox, waits for a verification/signup
  email, lists or reads inbound mail, downloads attachments, or mutes an inbox.
---

# Emails

Use the installed `emails` binary. Config lives in `~/.config/emails-cli/config.toml`
(do not put the API token in chat or in this skill file).

## Defaults

| Setting | Value |
|---------|-------|
| Skill | `~/.agent/skills/emails/` |
| Binary | `emails` (`~/.cargo/bin/emails`) |
| API | `$EMAILS_API_URL` — the URL of your own deployment of this Worker (e.g. `https://emails.example.com`) |
| Domain | `$EMAILS_DOMAIN` or `domain` in the config file (catch-all — any local part works) |
| Config | `~/.config/emails-cli/config.toml` |

## Commands

JSON on stdout by default. Add `--human` for tables.

```bash
emails address new [--prefix agent]
emails inboxes
emails list <to> [--unread] [--limit N] [--from] [--subject] [--since] [--after-id]
emails get <id> [--html] [--no-mark]
emails wait <to> [--timeout 120] [--interval 2] [--from] [--subject] [--since] [--after-id]
emails inbox mute|unmute <to>
emails attachment list <emailId>
emails attachment get <id> [-o path]
```

## Typical agent flow

```bash
ADDR=$(emails address new | jq -r .address)
emails inbox mute "$ADDR"
# … give $ADDR to a signup form / third party …
emails wait "$ADDR" --timeout 180 --subject verify
# parse .body from the JSON for the code or link
```

## Tips

- Use a **new address per task** so `wait` is unambiguous.
- Prefer body text from `wait` / `get`; avoid `--html` unless needed (large).
- Mute agent inboxes so they do not push to your phone.
- On timeout, `wait` exits non-zero with an error JSON on stderr.
