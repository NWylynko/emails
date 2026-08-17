import { sql } from "drizzle-orm";
import {
  customType,
  foreignKey,
  index,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Postgres `tsvector`. drizzle has no built-in column type for it. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * The full-text index expression for an email.
 *
 * Weighted so a hit in the subject outranks a hit buried in the body:
 * A = subject, B = sender, C = body.
 *
 * The sender is indexed **twice, deliberately**. Postgres' parser treats an
 * email address as a single `email` token, so `noreply@github.com` produces the
 * one lexeme `'noreply@github.com'` and never `'github'` — which means
 * searching a sender's name or domain finds nothing at all. Measured on the
 * seeded corpus before this was added: "github" returned 0 hits against 29
 * emails from GitHub, "cloudflare" 0 against 38.
 *
 * So the address goes in whole (exact-address search keeps working) and again
 * with `@`, `.`, `_` and `-` translated to spaces, which yields `noreply`,
 * `github` and `com` as separate lexemes. `translate` is IMMUTABLE, so it is
 * legal in a stored generated column.
 *
 * `to` is deliberately NOT indexed: it is the inbox name, every message in an
 * inbox shares it, and searching one would just return the whole inbox. Scoping
 * by inbox is a filter on the column instead.
 *
 * Two more details are load-bearing:
 *
 * - **`to_tsvector` must be given an explicit `'english'`.** The single-argument
 *   form depends on the session's `default_text_search_config` and is therefore
 *   only STABLE, not IMMUTABLE, and Postgres rejects it in a stored generated
 *   column.
 * - **`left(body, 200000)` is not arbitrary.** A tsvector is hard-capped at 1MB
 *   and `body` allows a million characters. High-entropy text produces roughly
 *   1.4 bytes of tsvector per character, so an unguarded body can breach the cap
 *   — measured: 807k characters of distinct tokens produced 1,137,408 bytes and
 *   the INSERT failed with "string is too long for tsvector".
 *
 *   That failure would land inside the inbound `email()` handler, *after* the
 *   message is accepted, so Email Routing would retry and duplicate rows. The
 *   truncation keeps the worst case near 280KB. `src/database/seed/` seeds a
 *   body that breaches the cap so this stays proven rather than assumed.
 */
const emailSearchExpression = sql`
  setweight(to_tsvector('english', coalesce("subject", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("from", '')), 'B') ||
  setweight(to_tsvector('english', translate(coalesce("from", ''), '@._-', '    ')), 'B') ||
  setweight(to_tsvector('english', left("body", 200000)), 'C')
`;

export const emails = pgTable(
  "emails",
  (t) => ({
    emailId: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    from: t.varchar({ length: 256 }).notNull(),
    to: t.varchar({ length: 256 }).notNull(),
    subject: t.varchar({ length: 2048 }),
    body: t.varchar({ length: 1_000_000 }).notNull(),
    html: t.varchar({ length: 1_000_000 }),
    timestamp: t.timestamp({ precision: 6 }).notNull(),
    viewed: t.boolean().notNull().default(false),
    /**
     * Maintained by Postgres, never written by the app — which is why search
     * needed no change to the inbound mail path. Read it through
     * `src/search/searchEmails.ts` rather than querying it directly.
     */
    search: tsvector().generatedAlwaysAs(emailSearchExpression),
  }),
  (t) => [
    index("toIdx").on(t.to),
    index("emailSearchIdx").using("gin", t.search),
  ]
);

export const inboxes = pgTable(
  "inboxes",
  (t) => ({
    inboxId: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    inbox: t.varchar({ length: 256 }).notNull(),
    silent: t.boolean().notNull().default(false),
    receiver: t.varchar({ length: 256 }),
  }),
  (t) => [uniqueIndex("toInbox").on(t.inbox)]
);

export const attachments = pgTable(
  "attachments",
  (t) => ({
    attachmentId: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    emailId: t.integer().notNull(),
    r2Key: t.varchar({ length: 256 }).notNull(),
    name: t.varchar({ length: 256 }),
    size: t.integer().notNull(),
    contentType: t.varchar({ length: 256 }).notNull(),
    timestamp: t.timestamp({ precision: 6 }).notNull(),
  }),
  (t) => [
    foreignKey({
      columns: [t.emailId],
      foreignColumns: [emails.emailId],
      name: "emailId",
    }).onDelete("cascade"),
  ]
);
