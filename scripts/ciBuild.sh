#!/usr/bin/env bash
# Build command for Cloudflare Workers Builds.
#
# The Infisical secret sync populates the Worker's RUNTIME secrets, which a build
# cannot see. varlock loads during `next build` and validates the whole schema,
# so a build with no values fails with "Value is required but is currently
# empty". This gives the build its own short-lived Infisical credential instead
# of duplicating eleven values into Cloudflare's build variables.
#
# Set these two in Cloudflare → Workers → Settings → Build → Variables and
# secrets (as SECRETS, not plain variables):
#
#   INFISICAL_CLIENT_ID
#   INFISICAL_CLIENT_SECRET
#
# They come from an Infisical machine identity using Universal Auth, which must
# be added to the "emails" project with at least read access to the prod
# environment.
#
# The project id is not a secret — it is already committed in .infisical.json.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_ID="39a9c656-043d-41b0-bc73-a288c8b22baa"

if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
  echo "ciBuild: INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET are not set." >&2
  echo "         Add them as build secrets in the Cloudflare dashboard." >&2
  echo "         For a local build use \`pnpm deploy\` instead, which uses your" >&2
  echo "         own Infisical login." >&2
  exit 1
fi

# Cloudflare's build image has node and npm but not the Infisical CLI. Installing
# it here rather than as a devDependency: the npm package materialises its binary
# in a preinstall hook, and pnpm links bins before that hook has produced the
# file, so the dependency route fails on a clean install.
if ! command -v infisical >/dev/null 2>&1; then
  echo "ciBuild: installing the Infisical CLI"
  npm install -g @infisical/cli >/dev/null
fi

# --plain --silent makes login emit only the token, so it can be captured.
INFISICAL_TOKEN="$(infisical login \
  --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" \
  --client-secret="$INFISICAL_CLIENT_SECRET" \
  --plain --silent)"
export INFISICAL_TOKEN

echo "ciBuild: building with prod values injected"
exec infisical run \
  --env=prod \
  --projectId="$PROJECT_ID" \
  -- npx opennextjs-cloudflare build
