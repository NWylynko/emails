# Emails

Private email website built with Next.js and Cloudflare Workers. Run `pnpm dev`
with the configured Infisical dev environment; deployments use Workers Builds.

The homepage shows compact inbox rows with the latest subject, time and mail
counts. Use **Open latest** to read it directly, or the inbox address to
view all messages. Check this flow against the running dev server on port 3002
with `pnpm test:homepage` (install Chromium once with
`pnpm exec playwright install chromium --only-shell`).

## Local website editor

The authenticated layout includes the locally linked `@wylynko/t3-chat-widget`
from `../t3-chat-widget`. It is visible only to Clerk users listed in
`T3_CHAT_EDITOR_USER_IDS`; `/api/t3-chat` checks that permission on every request.
Ordinary website access does not grant editing access.

The four optional private variables live in Infisical and are declared in
`.env.schema`: `T3_CHAT_EDITOR_USER_IDS`, `T3_CHAT_SERVER_URL`,
`T3_CHAT_ACCESS_TOKEN`, and `T3_CHAT_PROJECT_ID`. Leave the editor allowlist empty
to disable the feature. Only dev credentials have been configured for this
local milestone; nothing has been deployed or published.

The browser connects directly to the private T3 endpoint. It must have Tailscale
access, and T3 must allow the website's origin. The widget inherits the project's
model and permission settings. Its credential route never connects to T3.

For HTTPS access on your tailnet, keep the emails dev server on port 3002 and
serve it through a separate HTTPS port:

```sh
tailscale serve --bg --https=8444 http://127.0.0.1:3002
```

Open `https://remote-box.daggertooth-bull.ts.net:8444`. Next's `allowedDevOrigins`
includes that hostname. Start the existing T3 environment with the HTTPS origin
and both local HTTP origins allowed:

```sh
T3CODE_DEV_ALLOWED_ORIGINS=http://localhost:3002,http://remote-box:3002,https://remote-box.daggertooth-bull.ts.net:8444 npx t3@latest --host 127.0.0.1 --port 3773 --mode web --no-browser --dev-url https://remote-box.daggertooth-bull.ts.net:3773 --tailscale-serve --tailscale-serve-port 3773
```

Changing this list requires a T3 restart. Keep its existing `--dev-url` to retain
this environment's history. Each additional website hostname, scheme, or port
needs its own exact origin; a successful HTTP response without the matching
`Access-Control-Allow-Origin` header still fails in the browser.

Rebuild `../t3-chat-widget` after package changes. The linked package uses this
app's React peers, and Turbopack's root includes both repositories. See the
[package setup and credential limitations](../t3-chat-widget/README.md).

Run the editor's integrated authorization and real-varlock tests with:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/t3-chat/credentialRoute.test.ts
```
