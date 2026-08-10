import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cache } from "react";

/**
 * The database client MUST be built per request.
 *
 * A module-scope client is the obvious thing to write and it is broken on
 * Workers: module scope outlives a request inside an isolate, so the second
 * request touches promises created in the first request's context and workerd
 * cancels it — reported, misleadingly, as "your Worker's code had hung and would
 * never generate a response", delivered in about 10ms. It fails on exactly every
 * other request, which reads like flaky data rather than a lifetime bug.
 *
 * `cache()` scopes one client to one request pass, so the several queries a page
 * runs still share a client without any of them leaking into the next request.
 *
 * Notes on the postgres.js options:
 * - `prepare: false` — Hyperdrive pools connections, so a named prepared
 *   statement is not guaranteed to come back to the connection that made it.
 * - `fetch_types: false` — skips a round trip fetching the type catalogue, which
 *   is pure latency for a schema this small.
 *
 * `pg` is deliberately not used here: it requires the optional `pg-cloudflare`
 * native companion, which OpenNext's bundler cannot resolve through pnpm's
 * layout even when it is installed.
 */
/**
 * Builds a client from an env directly. The inbound `email()` handler runs
 * outside any fetch request, so `getCloudflareContext()` is unavailable there
 * and it must pass its own `env`.
 */
export function createEmailsDbFromEnv(HYPERDRIVE: Hyperdrive) {
  const sql = postgres(HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: false,
  });

  return drizzle(sql);
}

/** Request-scoped client for pages, route handlers and server actions. */
export const getEmailsDb = cache(() => {
  const cloudflare = getCloudflareContext();

  return createEmailsDbFromEnv(cloudflare.env.HYPERDRIVE);
});
