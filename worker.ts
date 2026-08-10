/**
 * Worker entry point — the merge point of the whole project.
 *
 * `.open-next/worker.js` is the Next.js app compiled for workerd. Wrapping it
 * here rather than pointing wrangler straight at it is what lets this one Worker
 * carry the inbound Email Routing handler alongside the website, so the site and
 * the mail pipeline are a single deployable sharing one schema, one set of
 * bindings and one `wrangler tail`.
 */
import { default as handler } from "./.open-next/worker.js";
import { receiveEmail } from "./src/email/receiveEmail";

export default {
  fetch: handler.fetch,

  async email(message, env) {
    await receiveEmail(message, env);
  },
} satisfies ExportedHandler<CloudflareEnv>;
