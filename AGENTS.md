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
worker.ts            entry: wraps .open-next/worker.js, adds the email() handler
src/                 Next.js App Router app (Clerk auth, Drizzle, R2, Workers AI)
src/middleware.ts    Clerk gate — NOT proxy.ts, see below
src/database/schema.ts   the single copy of the schema (was duplicated across two repos)
src/inbox/inboxQueries.ts    inbox reads/writes, shared by the website and /v1
src/email/emailQueries.ts    email/attachment reads, shared by the website and /v1
src/app/v1/              the CLI API (Bearer token, not Clerk)
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
pnpm preview      # build + run the Worker on localhost:8788  <- the real thing
pnpm deploy       # build + opennextjs-cloudflare deploy
pnpm dev:worker   # run the last build without rebuilding
pnpm dev          # plain next dev; bindings via initOpenNextCloudflareForDev()
pnpm cf:build
pnpm typecheck
pnpm cf-typegen   # after changing wrangler.jsonc or .dev.vars
```

`scripts/devWorker.sh` backs the two worker commands. It wraps the adapter's own
`opennextjs-cloudflare preview` (rather than calling `wrangler dev` directly),
loads `.env.local`, refuses to start if the local Hyperdrive string points at
production, and pins the port to 8788.

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
- **Two compatibility flags are required**, not one: `nodejs_compat` *and*
  `global_fetch_strictly_public`. Missing the second means a server-side
  `fetch()` to a URL matching this Worker's own routes loops back internally
  instead of going out to the public internet.
- Keep `compatibility_date` roughly current with the installed workerd, or every
  build prints a staleness warning.
- `main` is `worker.ts`, not the adapter's default `.open-next/worker.js` — that
  is the documented custom-worker override, and it is what allows `email()` to
  live alongside `fetch`.
- **Never build the database client at module scope.** Module scope outlives a
  request inside a Worker isolate, so request 2 touches promises created in
  request 1's context and workerd cancels it with "your Worker's code had hung
  and would never generate a response" — instantly, in ~10ms, despite the
  wording. It failed on exactly every other request:

  | driver | six consecutive requests |
  |--------|--------------------------|
  | module-scope `@neondatabase/serverless` | 200, 500, 200, 500, 200, 500 |
  | per-request Hyperdrive + postgres.js | 200 × 6 |

  Fixed: `getEmailsDb()` in `src/database/index.ts` is wrapped in React
  `cache()`, so one client is shared within a request and never across requests.
  Easy to misdiagnose — alternating failures over a list of different inputs read
  exactly like "these particular records are broken". They are not.

- **The R2 bucket in `wrangler dev` is local and empty**, so attachment
  downloads 404 against a fresh checkout even though the database row exists.
  Seed one to exercise the path:
  `npx wrangler r2 object put email-attachments/<r2Key> --file=x --local`

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

## The mail handler

`receiveEmail()` is reachable only through Email Routing, so the way to exercise
it is to construct a `ForwardableEmailMessage` yourself — `from`, `to`, `headers`
and a `raw` ReadableStream over a MIME string — and call it with `env`. That is a
genuinely end-to-end test: real mailparser, real R2, real INSERT.

Two things to get right when doing that:

- **Force the target inbox `silent: true` first**, or the run pages a real phone
  through Pusher Beams and Techulus.
- Resend is constructed lazily, inside the forward-on branch only. Its
  constructor throws on a missing key, so building it eagerly makes every
  ordinary delivery depend on a credential it never uses — and since Email
  Routing retries a failed delivery, that would duplicate rows for all inbound
  mail. Keep it where it is.

## The /v1 CLI API

Route handlers under `src/app/v1/`, authorised by `src/api/authorizeApiToken.ts`
(Bearer, timing-safe). Two halves of one decision, and breaking either is silent:
`middleware.ts` lists `/v1` as public so Clerk does not redirect token requests,
and `withApiToken` is what actually guards them.

`PUT /v1/inboxes/:to` still accepts `silent` only. `receiver` remains
website-only on purpose — that dropdown restricts it to addresses that have
already mailed the inbox.

Test it with the real CLI rather than curl:

```bash
EMAILS_API_URL=http://localhost:8788 EMAILS_API_TOKEN=<token> emails inboxes
```

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

- Next 16 app builds and runs on workerd via OpenNext (1.87 MiB gzip, limit 10).
- **Phase 2 complete — all three external services are now bindings.** Gone from
  the project: `@neondatabase/serverless`, `@aws-sdk/client-s3`,
  `@aws-sdk/s3-request-presigner`, `turndown`, and the `DATABASE_URL`,
  `CLOUDFLARE_R2_*` and `CLOUDFLARE_AI_KEY` variables. Attachments stream from
  the `ATTACHMENTS` binding via `/attachment/[id]`; summaries run on the `AI`
  binding; queries go through Hyperdrive.
- Verified signed-in against the dev clone: inbox list, per-inbox list, text tab,
  HTML tab, AI tab (real summary, link preserved), and an attachment download
  that saved with the right filename. Zero server errors across the session.
- **The `/v1` CLI API is now Next route handlers** under `src/app/v1/`, which
  deleted the hand-rolled router (`matchInboxPath`, the regex dispatch, the JSON
  helpers) from the old `api.ts`. Verified by running the real `emails` binary
  against the local Worker with `EMAILS_API_URL=http://localhost:8788`:
  `inboxes`, `list`, `get`, `attachment list`, `attachment get`, `inbox
  mute/unmute` and `health` all behave, and a missing or wrong token gets 401
  rather than a redirect.
- **The inbox-list query exists once**, in `src/inbox/inboxQueries.ts`, used by
  both the website and `/v1`.
- **Oversized-part pointers resolve on every read path.** `readEmailBody` /
  `readEmailHtml` in `src/email/emailQueries.ts` are the only sanctioned way to
  read those columns. Verified by pointing email 3639's body at an R2 object and
  confirming both `/v1/emails/3639` and the website's text tab render the R2
  contents rather than the `r2:...` string.
- **The inbound `email()` handler now lives in this Worker** (`worker.ts` ->
  `src/email/receiveEmail.ts`), with the notification pair de-duplicated into
  `src/notification/notifyAboutEmail.ts`. Driven end to end with a synthetic
  multipart message against the dev database and local R2: parse, oversized-part
  stash, INSERT, attachment upload and attachment row all verified.
- Clerk works: `/` redirects signed-out, ticket sign-in lands on a rendered
  inbox list from the dev database.
- `/`, `/inbox/<email>`, `/email/<id>` verified working under `wrangler dev`.
- Hyperdrive + drizzle + postgres.js proven inside a Next route.

Not done:

- Secrets do not yet follow `~/SECRETS.md` (Infisical + varlock). This project
  still keeps real values in `.env.local` / `.dev.vars`. Deliberately deferred —
  revisit before this is treated as finished.
- The oversized-email-part pointer (`r2:oversized-email-part/...`) is still
  unresolved on every UI read path — `/email/[id]`, `/email/[id]/html` and
  `/email/[id]/ai` will render the pointer as literal text.
- Nothing is deployed. Email Routing still points at the old `email-service`
  Worker; `emails.wylynko.me` still points at Vercel.
