#!/usr/bin/env bash
# Runs the built Worker locally.
#
# Hyperdrive cannot be emulated without an explicit local connection string —
# miniflare refuses to reach the remote database and errors instead, which is
# what keeps `wrangler dev` from ever touching production. That string lives in
# .env.local (gitignored) so it never reaches the repo.
#
# Serves on localhost:8788 deliberately: wrangler forwards
# `x-forwarded-host: localhost`, and Next rejects any Server Action whose Origin
# does not match, so browsing 127.0.0.1 breaks the Clerk ticket flow.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "devWorker: .env.local is missing — it holds the Clerk keys and the" >&2
  echo "           Hyperdrive local connection string." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

if [ -z "${CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:-}" ]; then
  echo "devWorker: CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE is" >&2
  echo "           not set in .env.local. Point it at the ep-flat-king clone." >&2
  exit 1
fi

case "$CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE" in
  *purple-bread*)
    echo "devWorker: refusing to start — the local Hyperdrive connection string" >&2
    echo "           points at ep-purple-bread, which is PRODUCTION." >&2
    exit 1
    ;;
esac

# `opennextjs-cloudflare preview` is the adapter's own wrapper around
# `wrangler dev`; args after `--` are passed through to wrangler.
exec npx opennextjs-cloudflare preview -- --port "${PORT:-8788}" "$@"
