/**
 * Worker entry point.
 *
 * `.open-next/worker.js` is the Next.js app compiled for workerd. Wrapping it
 * here rather than pointing wrangler straight at it is what lets this Worker
 * carry non-fetch handlers too — the inbound Email Routing `email()` handler
 * lands here, so the site and the mail pipeline are one deployable.
 */
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;
