-- Full-text search: a generated tsvector column plus its GIN index.
--
-- Adding a STORED generated column rewrites the whole table under an ACCESS
-- EXCLUSIVE lock, which blocks reads AND inbound mail INSERTs for the duration.
-- Measured against production's 3,707 rows: computing this expression for every
-- row takes ~5.6s. This was originally two migrations — one adding the column,
-- a second altering the expression — which made production pay that cost twice
-- for a column it had never had. They were squashed into this one before
-- anything reached production.
--
-- Three things here are load-bearing; see emailSearchExpression in
-- src/database/schema.ts for the full reasoning:
--   * `to_tsvector` takes an explicit 'english' — the 1-arg form is only
--     STABLE and Postgres rejects it in a stored generated column.
--   * `left("body", 200000)` keeps the tsvector under its hard 1MB cap. An
--     unguarded high-entropy body measured 1,137,408 bytes and failed to
--     INSERT — inside the email() handler, after the message was accepted,
--     so Email Routing would retry and duplicate the row.
--   * the sender is indexed twice, whole and split on `@._-`, because Postgres
--     emits an email address as a single lexeme and "github" would otherwise
--     never match noreply@github.com.
--
-- If you ever change the expression above, drizzle-kit will emit DROP COLUMN +
-- ADD COLUMN, which silently drops this index while its snapshot still believes
-- the index exists. Re-create it by hand in that migration and check pg_indexes
-- afterwards.
ALTER TABLE "emails" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("subject", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("from", '')), 'B') ||
  setweight(to_tsvector('english', translate(coalesce("from", ''), '@._-', '    ')), 'B') ||
  setweight(to_tsvector('english', left("body", 200000)), 'C')
) STORED;--> statement-breakpoint
CREATE INDEX "emailSearchIdx" ON "emails" USING gin ("search");