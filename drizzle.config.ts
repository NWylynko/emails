import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config — migrations only. The running app never reads this file,
 * and never reads DATABASE_URL: it reaches Postgres through the HYPERDRIVE
 * binding (see src/database/index.ts). This is the one place a raw connection
 * string is used, because DDL has to run from a developer machine or CI rather
 * than from inside the Worker.
 *
 * MIGRATIONS_DATABASE_URL comes from Infisical and is never on disk:
 *
 *   pnpm db:migrate:dev
 *
 * The name is deliberately not DATABASE_URL. That variable existed before the
 * Hyperdrive cutover and was deleted with it; reviving the name would suggest
 * the running app reads a connection string again, which it must not.
 *
 * Prefer the **unpooled** Neon endpoint (no `-pooler` in the host), but this is
 * a preference, not a requirement. Measured against the pooled endpoint: plain
 * DDL, multi-statement transactions, generated columns, GIN indexes and even
 * `CREATE INDEX CONCURRENTLY` all work. The reason to use the direct endpoint
 * is that a long migration should not occupy a pooled connection slot the
 * running app is competing for, and it is what Neon recommends.
 *
 * Note this is NOT why CI needs a connection string. CI needs one because
 * Hyperdrive is a Worker binding — it does not exist outside a running Worker,
 * so a build container has nothing to connect through, and Cloudflare will not
 * return the origin password (verified against the raw API: the field is
 * absent, not redacted).
 *
 * Migrations live under the database vertical rather than a root-level
 * `drizzle/` directory, so the schema and its history sit together.
 */
const url = process.env.MIGRATIONS_DATABASE_URL;

/**
 * `generate` and `check` only diff schema files against the stored snapshots —
 * they never open a connection, so they must keep working without a database
 * URL. Only the commands that actually connect are worth failing early for.
 */
const COMMANDS_NEEDING_A_CONNECTION = ["migrate", "push", "pull", "studio", "drop", "up"];
const needsConnection = process.argv.some((arg) =>
  COMMANDS_NEEDING_A_CONNECTION.includes(arg)
);

// drizzle-kit's own message for this is "[x] url: undefined", which does not
// say where the value is meant to come from. In CI this is the difference
// between a one-line fix and a debugging session.
if (!url && needsConnection) {
  throw new Error(
    "MIGRATIONS_DATABASE_URL is not set.\n\n" +
      "It comes from Infisical, and every db:* script that connects wraps itself in `infisical run`:\n" +
      "  pnpm db:migrate:dev    (dev clone)\n" +
      "  pnpm ci:migrate        (production — runs in Workers Builds)\n\n" +
      "If this failed in CI, the variable is missing from Infisical's prod environment.\n" +
      "Prefer the unpooled Neon endpoint: the host without '-pooler'."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./src/database/migrations",
  dbCredentials: { url: url ?? "" },
  // The schema declares camelCase column names verbatim ("emailId", "r2Key"),
  // which is what the live tables use. Leaving `casing` unset preserves that;
  // setting it to snake_case would generate a migration renaming every column.
  casing: undefined,
  verbose: true,
  strict: true,
});
