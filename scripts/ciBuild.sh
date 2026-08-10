#!/usr/bin/env bash
# Build command for Cloudflare Workers Builds. Deploys only ever happen in CI.
#
# The Infisical secret sync populates the Worker's RUNTIME secrets, which a build
# cannot see. varlock loads during `next build` and validates the whole schema,
# so a build with no values fails with "Value is required but is currently
# empty". This gives the build its own short-lived Infisical credential rather
# than duplicating eleven values into Cloudflare's build variables, where they
# would drift the moment anything is rotated.
#
# Set these two in Cloudflare → Workers → Settings → Build → Variables and
# secrets (as SECRETS, not plain variables):
#
#   INFISICAL_CLIENT_ID
#   INFISICAL_CLIENT_SECRET
#
# They come from an Infisical machine identity using Universal Auth, added to the
# "emails" project with read access to the prod environment.
#
# The project id is not a secret — it is already committed in .infisical.json.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_ID="39a9c656-043d-41b0-bc73-a288c8b22baa"

# @infisical/cli is a devDependency, so `pnpm install` has already put the binary
# here. It ships as a preinstall hook that downloads the platform binary, which
# means the package MUST stay in onlyBuiltDependencies in pnpm-workspace.yaml —
# without that, pnpm skips the hook and this path never appears.
INFISICAL="./node_modules/.bin/infisical"

if [ ! -x "$INFISICAL" ]; then
  echo "ciBuild: $INFISICAL is missing." >&2
  echo "         Check that '@infisical/cli' is still listed under" >&2
  echo "         onlyBuiltDependencies in pnpm-workspace.yaml; if it is not," >&2
  echo "         pnpm skips its preinstall hook and no binary is produced." >&2
  exit 1
fi

if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
  echo "ciBuild: INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET are not set." >&2
  echo "         Add them as build secrets under" >&2
  echo "         Workers → emails → Settings → Build → Variables and secrets." >&2
  exit 1
fi

# --plain --silent makes login emit only the token, so it can be captured.
INFISICAL_TOKEN="$("$INFISICAL" login \
  --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" \
  --client-secret="$INFISICAL_CLIENT_SECRET" \
  --plain --silent)"
export INFISICAL_TOKEN

echo "ciBuild: authenticated, building with prod values injected"
exec "$INFISICAL" run \
  --env=prod \
  --projectId="$PROJECT_ID" \
  -- npx opennextjs-cloudflare build
