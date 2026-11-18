import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

// Gives plain `next dev` access to the Worker bindings (HYPERDRIVE, ATTACHMENTS,
// AI) through miniflare, so `getCloudflareContext()` works without a full
// `opennextjs-cloudflare build` on every change.
//
// Guarded, because this runs on every evaluation of next.config — including
// `next build`. Miniflare cannot emulate Hyperdrive without
// CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE, which exists only in
// the dev environment (production reaches Postgres through the binding). So an
// unguarded call fails any build that does not have a local database — exactly
// what happens in CI, where the prod environment quite correctly has no such
// variable.
// `environment` is required, not cosmetic: wrangler.jsonc carries no top-level
// bindings, so without it miniflare loads an empty binding set and every
// getCloudflareContext() read fails with "Cannot read properties of undefined
// (reading 'connectionString')" on the first Hyperdrive query.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev({ environment: "development" });
}

// varlock replaces Next's env loader (see the @next/env override in
// pnpm-workspace.yaml) and validates .env.schema at dev and build time.
// Confirm it is live by looking for "loaded by varlock" in the dev output — if
// that string is absent the override did not apply and nothing else matters.
const withVarlock = varlockNextConfigPlugin();

const nextConfig = {
  // Extra hostnames you browse the dev server from (e.g. a remote dev box),
  // comma-separated in ALLOWED_DEV_ORIGINS.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    ...(process.env.ALLOWED_DEV_ORIGINS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  ],
} satisfies NextConfig;

export default withVarlock(nextConfig);
