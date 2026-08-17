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
 * Point it at the **unpooled** Neon endpoint (no `-pooler` in the host). The
 * pooled endpoint is pgbouncer in transaction mode, which is what Hyperdrive
 * talks to for ordinary queries but is the wrong target for migrations.
 *
 * Migrations live under the database vertical rather than a root-level
 * `drizzle/` directory, so the schema and its history sit together.
 */
const url = process.env.MIGRATIONS_DATABASE_URL;

// drizzle-kit's own message for this is "[x] url: undefined", which does not
// say where the value is meant to come from. In CI this is the difference
// between a one-line fix and a debugging session.
if (!url) {
  throw new Error(
    "MIGRATIONS_DATABASE_URL is not set.\n\n" +
      "It comes from Infisical, and every db:* script wraps itself in `infisical run`:\n" +
      "  pnpm db:migrate:dev    (dev clone)\n" +
      "  pnpm ci:migrate        (production — runs in Workers Builds)\n\n" +
      "If this failed in CI, the variable is missing from Infisical's prod environment.\n" +
      "It must be the UNPOOLED Neon endpoint: the host WITHOUT '-pooler'."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./src/database/migrations",
  dbCredentials: { url },
  // The schema declares camelCase column names verbatim ("emailId", "r2Key"),
  // which is what the live tables use. Leaving `casing` unset preserves that;
  // setting it to snake_case would generate a migration renaming every column.
  casing: undefined,
  verbose: true,
  strict: true,
});
