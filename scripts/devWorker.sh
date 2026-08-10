#!/usr/bin/env bash
# Runs the built Worker locally, under the Workers runtime.
#
# Expects to be launched through the Infisical CLI, which puts the values in
# this process's environment:
#
#   infisical run --env=dev -- ./scripts/devWorker.sh
#
# Two things this has to do that are not obvious:
#
# 1. `wrangler dev` does NOT forward its own process environment into the Worker
#    — that is what `.dev.vars` normally exists for. Since we deliberately keep
#    no such file, each var is passed through explicitly with `--var`. The
#    tradeoff is that these values are visible in `ps` for the lifetime of the
#    process. That is a deliberate trade: the threat this setup defends against
#    is a filesystem scrape by a malicious package, and nothing is written to
#    disk. Anything already running as this user could read the Infisical
#    session token anyway.
#
# 2. Hyperdrive cannot be emulated without an explicit local connection string;
#    miniflare errors rather than reaching the remote database, which is what
#    stops local dev ever touching production.
#
# Serves on localhost:8788 deliberately: wrangler forwards
# `x-forwarded-host: localhost`, and Next rejects any Server Action whose Origin
# does not match, so browsing 127.0.0.1 breaks the Clerk ticket flow.
set -euo pipefail

cd "$(dirname "$0")/.."

# Vars the Worker itself needs at runtime, and which therefore must exist in
# Infisical. Deliberately absent:
#   - bindings (HYPERDRIVE, ATTACHMENTS, AI, ASSETS) come from wrangler.jsonc
#   - NEXT_PUBLIC_CLERK_SIGN_IN_URL is a non-secret with its value declared in
#     .env.schema, and being public it is inlined at build time
WORKER_VARS=(
  CLERK_SECRET_KEY
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  API_TOKEN
  RESEND_KEY
  PUSHER_APP_ID
  PUSHER_KEY
  PUSHER_SECRET
  PUSHER_CLUSTER
  BEAMS_INSTANCE_ID
  BEAMS_SECRET
  TECHULUS_API_KEY
)

missing=()
for name in "${WORKER_VARS[@]}"; do
  [ -z "${!name:-}" ] && missing+=("$name")
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "devWorker: missing ${missing[*]}" >&2
  echo "           Run through Infisical:" >&2
  echo "             infisical run --env=dev -- ./scripts/devWorker.sh" >&2
  echo "           (or use \`pnpm preview\`, which does this for you)" >&2
  exit 1
fi

if [ -z "${CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:-}" ]; then
  echo "devWorker: CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE is" >&2
  echo "           not set. It lives in Infisical, dev environment only." >&2
  exit 1
fi

case "$CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE" in
  *purple-bread*)
    echo "devWorker: refusing to start — the local Hyperdrive connection string" >&2
    echo "           points at ep-purple-bread, which is PRODUCTION." >&2
    exit 1
    ;;
esac

var_args=()
for name in "${WORKER_VARS[@]}"; do
  var_args+=(--var "${name}:${!name}")
done
# Tells Next which .env file to load at runtime in dev (OpenNext convention).
var_args+=(--var "NEXTJS_ENV:development")

# `opennextjs-cloudflare preview` is the adapter's own wrapper around
# `wrangler dev`; args after `--` are passed through to wrangler.
exec npx opennextjs-cloudflare preview -- \
  --port "${PORT:-8788}" \
  "${var_args[@]}" \
  "$@"
