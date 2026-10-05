/**
 * The secret-store values the Infisical -> Cloudflare sync puts on the Worker's
 * `env`. `wrangler types` cannot see them (they live in the secret store, not
 * wrangler.jsonc), so they are declared by hand here and merged into the
 * generated CloudflareEnv.
 *
 * The `email()` handler MUST read secrets from `env`, never `varlock/env`'s
 * `ENV`: varlock is initialized (and process.env populated) by OpenNext's fetch
 * path only, so `ENV.X` inside the mail pipeline throws "varlock ENV not
 * initialized" on a cold isolate.
 *
 * Keep the names in sync with .env.schema / Infisical (project "emails").
 */
interface CloudflareEnv {
  API_TOKEN: string;
  BEAMS_INSTANCE_ID: string;
  BEAMS_SECRET: string;
  CLERK_SECRET_KEY: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
  PUSHER_APP_ID: string;
  PUSHER_CLUSTER: string;
  PUSHER_KEY: string;
  PUSHER_SECRET: string;
  RESEND_KEY: string;
  TECHULUS_API_KEY: string;
  T3_CHAT_EDITOR_USER_IDS?: string;
  T3_CHAT_SERVER_URL?: string;
  T3_CHAT_ACCESS_TOKEN?: string;
  T3_CHAT_PROJECT_ID?: string;
}
