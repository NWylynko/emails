import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

// Gives plain `next dev` access to the Worker bindings (HYPERDRIVE, ATTACHMENTS,
// AI) through miniflare, so `getCloudflareContext()` works without a full
// `opennextjs-cloudflare build` on every change.
initOpenNextCloudflareForDev();

// varlock replaces Next's env loader (see the @next/env override in
// pnpm-workspace.yaml) and validates .env.schema at dev and build time.
// Confirm it is live by looking for "loaded by varlock" in the dev output — if
// that string is absent the override did not apply and nothing else matters.
const withVarlock = varlockNextConfigPlugin();

const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "remote-box"],
} satisfies NextConfig;

export default withVarlock(nextConfig);
