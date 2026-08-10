import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Gives plain `next dev` access to the Worker bindings (HYPERDRIVE, ATTACHMENTS,
// AI) through miniflare, so `getCloudflareContext()` works without a full
// `opennextjs-cloudflare build` on every change.
initOpenNextCloudflareForDev();

export default {
  allowedDevOrigins: ["127.0.0.1", "localhost", "remote-box"],
} satisfies NextConfig;
