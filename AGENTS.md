# AGENTS.md

Keep this file up to date.

Disposable-inbox email system for `*@wylynko.me`. **One Cloudflare Worker** serves
both the website and inbound mail — this repo is the merge of what used to be
three: `email-service` (Worker), `email-client` (Next.js on Vercel) and
`emails-cli` (Rust). Those still exist on GitHub, unarchived, as the pre-merge
history.

Migration is **in progress**. See "Migration status" at the bottom for what is
done and what is not.

## Shape

```
worker.ts            entry: wraps .open-next/worker.js, adds handlers Next can't host
src/                 Next.js App Router app (Clerk auth, Drizzle, R2, Workers AI)
src/middleware.ts    Clerk gate — NOT proxy.ts, see below
src/database/schema.ts   the single copy of the schema (was duplicated across two repos)
cli/                 the Rust `emails` CLI (crate name `emails`, binary `emails`)
scripts/generateCloudflareTypes.mjs   see "Types" below
```

## Databases — read this before running anything

Two Neon databases, and they are **not** the same:

| | Endpoint | Hyperdrive config | Safe? |
|---|---|---|---|
| Production | `ep-purple-bread-a782nann` | `neon-email-database` `3c425a8db8…` | **NO — real mail** |
| Dev clone | `ep-flat-king-a7yv3mu7` | `neon-email-database-dev` `1b02e5c500…` | yes, develop here |

`wrangler.jsonc` binds the **dev** config by default; production is only bound
under `env.production`. Verified safety properties:

- **`wrangler dev` cannot reach production.** Miniflare refuses to use a remote
  Hyperdrive locally — it errors demanding
  `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. That variable lives
  in `.env.local` and points at `ep-flat-king`.
- **`wrangler dev --remote` DOES use the deployed Hyperdrive config.** Never use
  that flag on this project.

## Running it

```bash
pnpm cf:build     # opennextjs-cloudflare build
pnpm preview      # cf:build + wrangler dev  (Workers runtime, port 8787 by default)
pnpm dev          # plain next dev; bindings come via initOpenNextCloudflareForDev()
pnpm typecheck
pnpm cf-typegen   # after changing wrangler.jsonc or .dev.vars
```

Secrets: `.env.local` (build time, gitignored) and `.dev.vars` (Worker runtime in
`wrangler dev`, gitignored). Both are currently copies of the old
`email-client/.env.local` plus the Hyperdrive local connection string.

**Browse `wrangler dev` on `http://localhost:8788`, not `127.0.0.1`.** Wrangler
forwards `x-forwarded-host: localhost`, and Next rejects Server Actions whose
`Origin` doesn't match — you get a 500 on any action, including the Clerk
`/authenticate` ticket flow.

## Next 16 on Cloudflare — the constraints

- **The Clerk gate must live in `src/middleware.ts`, not `proxy.ts`.** Next 16
  renamed the convention and moved `proxy` to the Node.js runtime, where the
  `runtime` option is not configurable and setting it throws. OpenNext cannot run
  Node middleware, so `proxy.ts` fails the build outright. The Next 16 upgrade
  guide's own words: "If you want to continue using the `edge` runtime, keep
  using `middleware`." Revisit when OpenNext supports Node middleware
  (cloudflare/workers-sdk#13755).
- **`pg` cannot be bundled.** It requires the optional `pg-cloudflare` native
  companion, which esbuild can't resolve through pnpm's layout even when it is
  installed. Use **postgres.js** (`drizzle-orm/postgres-js`) with
  `{ prepare: false }` — Hyperdrive pools connections, so named prepared
  statements are not safe.
- **`assets` must be bound in `wrangler.jsonc`** (`.open-next/assets`). Without
  it the app serves HTML fine and every chunk, stylesheet and image 404s — which
  looks like a working app to a curl check.
- **`turndown` hangs the Worker.** It needs a DOM shim that does not work on
  workerd; `/email/[id]/html` never returns a response. Unresolved — see below.

## Types

`wrangler types` in one shot writes runtime globals and the Env interface into one
file, and that file declares `mainModule: typeof import("./worker")`, which drags
`worker.ts` into the Next app's TS program regardless of `tsconfig.json`'s
`exclude` — and `worker.ts` imports `.open-next/worker.js`, which doesn't exist
before a build. So a clean checkout could never typecheck.

`pnpm cf-typegen` therefore generates two files and strips that block:
`cloudflare-env.d.ts` (Env) and `worker-runtime.d.ts` (runtime globals).

Note the runtime globals override the DOM lib, so `Response.json()` returns
`unknown` rather than `any` in client components. Type the result.

## Testing

No test suite yet. Verification is `pnpm typecheck`, `pnpm cf:build`, and driving
the app with the Playwright MCP.

The Playwright MCP here launches **headed**, so bring up a display first
(`~/.agent/skills/display`) — headless is not an option with this MCP config.

To get a signed-in browser, mint a Clerk ticket (single-use):

```bash
set -a; . ./.env.local; set +a
T=$(curl -s -X POST https://api.clerk.com/v1/sign_in_tokens \
  -H "Authorization: Bearer $CLERK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"user_id":"user_2t6gJSoy2au2IcsGdNGFt32ZyQL","expires_in_seconds":1800}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
echo "http://localhost:8788/authenticate?token=$T"
```

Worth walking: `/` (inbox list), `/inbox/<email>`, `/email/<id>`,
`/email/<id>/html`, `/email/<id>/ai`, attachment download, settings dialog.

**The AI binding bills real money even in local dev** — wrangler warns about this.
Don't leave the AI tab in a refresh loop.

## Migration status

Done:

- Next 16 app builds and runs on workerd via OpenNext (2.15 MiB gzip, limit 10).
- Clerk works: `/` redirects signed-out, ticket sign-in lands on a rendered
  inbox list from the dev database.
- `/`, `/inbox/<email>`, `/email/<id>` verified working under `wrangler dev`.
- Hyperdrive + drizzle + postgres.js proven inside a Next route.

Not done:

- `/email/[id]/html` hangs (turndown). Needs a Workers-compatible approach —
  `HTMLRewriter` sanitising server-side, or moving the turndown pass into the
  browser where a real DOM exists.
- Still on the old externals: `@neondatabase/serverless` + `DATABASE_URL`,
  `@aws-sdk/*` presigned R2 URLs, Workers AI over REST with `CLOUDFLARE_AI_KEY`.
  All three should become bindings (`HYPERDRIVE`, `ATTACHMENTS`, `AI`).
- `email()` handler and the `/v1` CLI API are not yet ported into this Worker.
- The oversized-email-part pointer (`r2:oversized-email-part/...`) is still
  unresolved on every UI read path — `/email/[id]`, `/email/[id]/html` and
  `/email/[id]/ai` will render the pointer as literal text.
- Nothing is deployed. Email Routing still points at the old `email-service`
  Worker; `emails.wylynko.me` still points at Vercel.
