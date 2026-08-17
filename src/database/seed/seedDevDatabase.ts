/**
 * Fills the dev database with fake mail.
 *
 * Run it with `pnpm db:seed:dev`, which wraps this in `infisical run --env=dev`
 * so MIGRATIONS_DATABASE_URL is present without any value touching disk.
 *
 *   pnpm db:seed:dev                  # append 400 emails
 *   pnpm db:seed:dev -- --reset       # delete existing rows first
 *   pnpm db:seed:dev -- --count=2000  # a corpus nearer production's size
 *   pnpm db:seed:dev -- --seed=7      # different deterministic corpus
 *
 * There is no `db:seed:prod`, and there must never be one. The guard below is
 * the second line of defence behind that omission.
 *
 * Note this seeds Postgres only. Attachment rows are created but the R2 objects
 * they point at are not, so attachment downloads 404 against a seeded database
 * — the same behaviour a fresh checkout already has. Seed one by hand if you
 * need to exercise that path:
 *
 *   npx wrangler r2 object put email-attachments/<r2Key> --file=x --local
 */
import { sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { attachments, emails, inboxes } from "../schema.ts";
import { generateFakeMailCorpus } from "./fakeMailCorpus.ts";

/**
 * Endpoint ids that must never be seeded. `ep-purple-bread-a782nann` is the
 * production Neon branch — the one holding real mail.
 *
 * Denylisting is not enough on its own: a future production endpoint would not
 * be on this list. So the allowlist below also has to match, and an unknown
 * host is refused rather than assumed safe.
 */
const PRODUCTION_ENDPOINT_IDS = ["ep-purple-bread-a782nann"];

/** The dev clone. Recreated occasionally; see "Databases" in AGENTS.md. */
const DEV_ENDPOINT_IDS = ["ep-twilight-sunset-a76wg4dm"];

export function assertNotProductionDatabase(url: string): void {
  const host = new URL(url).host;

  const productionMatch = PRODUCTION_ENDPOINT_IDS.find((id) => host.includes(id));
  if (productionMatch) {
    throw new Error(
      `REFUSING TO SEED: MIGRATIONS_DATABASE_URL points at the production database (${productionMatch}).\n` +
        `That database holds real mail. Seeding it would insert hundreds of fake emails into live inboxes.\n` +
        `Run this against the dev clone instead — 'pnpm db:seed:dev' selects it via Infisical's dev environment.`
    );
  }

  const isKnownDev = DEV_ENDPOINT_IDS.some((id) => host.includes(id));
  if (!isKnownDev && process.env.SEED_ALLOW_UNKNOWN_HOST !== "1") {
    throw new Error(
      `REFUSING TO SEED: host '${host}' is not a recognised dev database.\n` +
        `Known dev endpoints: ${DEV_ENDPOINT_IDS.join(", ")}\n\n` +
        `If the dev clone was recreated, update DEV_ENDPOINT_IDS in this file — that keeps the guard honest.\n` +
        `For a genuinely different throwaway database, set SEED_ALLOW_UNKNOWN_HOST=1 to override.`
    );
  }
}

function parseIntFlag(argv: string[], name: string, fallback: number): number {
  const raw = argv.find((a) => a.startsWith(`--${name}=`));
  if (raw === undefined) {
    return fallback;
  }

  const value = Number.parseInt(raw.slice(name.length + 3), 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer, got '${raw}'`);
  }

  return value;
}

async function seedDevDatabase(): Promise<void> {
  const url = process.env.MIGRATIONS_DATABASE_URL;
  if (!url) {
    throw new Error(
      "MIGRATIONS_DATABASE_URL is not set. Run via 'pnpm db:seed:dev', which wraps this in 'infisical run --env=dev'."
    );
  }

  assertNotProductionDatabase(url);

  const argv = process.argv.slice(2);
  const reset = argv.includes("--reset");
  const count = parseIntFlag(argv, "count", 400);
  const seed = parseIntFlag(argv, "seed", 20260817);

  const sql = postgres(url, { ssl: "require", prepare: false, fetch_types: false, max: 5 });
  const db = drizzle(sql);

  try {
    console.log(`seeding ${new URL(url).host}`);

    if (reset) {
      // attachments cascade from emails, but delete explicitly so the count is
      // reported rather than silently implied.
      const [{ count: attachmentCount }] = await sql`select count(*)::int as count from attachments`;
      const [{ count: emailCount }] = await sql`select count(*)::int as count from emails`;
      await db.delete(attachments);
      await db.delete(emails);
      await db.delete(inboxes);
      console.log(`  --reset: deleted ${emailCount} emails, ${attachmentCount} attachments, all inbox settings`);
    }

    const corpus = generateFakeMailCorpus(count, seed);

    await db
      .insert(inboxes)
      .values(corpus.inboxes)
      .onConflictDoUpdate({
        target: inboxes.inbox,
        set: { silent: raw`excluded."silent"`, receiver: raw`excluded."receiver"` },
      });
    console.log(`  ${corpus.inboxes.length} inbox settings`);

    // Batched, because a single insert of the whole corpus exceeds Postgres'
    // 65535-parameter limit once the oversized fixture bodies are included.
    const BATCH = 100;
    let inserted = 0;
    let attachmentsInserted = 0;

    for (let i = 0; i < corpus.emails.length; i += BATCH) {
      const batch = corpus.emails.slice(i, i + BATCH);

      const rows = await db
        .insert(emails)
        .values(
          batch.map((e) => ({
            from: e.from,
            to: e.to,
            subject: e.subject,
            body: e.body,
            html: e.html,
            timestamp: e.timestamp,
            viewed: e.viewed,
          }))
        )
        .returning({ emailId: emails.emailId });

      const attachmentRows = batch.flatMap((e, j) =>
        e.attachments.map((a) => ({
          emailId: rows[j]!.emailId,
          r2Key: a.r2Key,
          name: a.name,
          size: a.size,
          contentType: a.contentType,
          timestamp: e.timestamp,
        }))
      );

      if (attachmentRows.length > 0) {
        await db.insert(attachments).values(attachmentRows);
        attachmentsInserted += attachmentRows.length;
      }

      inserted += rows.length;
      process.stdout.write(`\r  ${inserted}/${corpus.emails.length} emails`);
    }

    console.log(`\r  ${inserted} emails, ${attachmentsInserted} attachments`);
    console.log("done");
  } finally {
    await sql.end();
  }
}

// Not top-level await: that would require raising the project's `target` from
// ES6 purely to run a dev script.
seedDevDatabase().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
