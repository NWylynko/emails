# Emails

Private email website built with Next.js and Cloudflare Workers. Run `pnpm dev`
with the configured Infisical dev environment; deployments use Workers Builds.

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

Rebuild `../t3-chat-widget` after package changes. The linked package uses this
app's React peers, and Turbopack's root includes both repositories. See the
[package setup and credential limitations](../t3-chat-widget/README.md).

Run the editor's integrated authorization and real-varlock tests with:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/t3-chat/credentialRoute.test.ts
```
