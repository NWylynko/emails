-- Also index the sender split on its separators, so a search for "github"
-- reaches mail from noreply@github.com. Postgres' parser emits an email address
-- as a single `email` token, so without this the sender is only findable by its
-- full address — measured on the seeded corpus, "github" returned 0 hits
-- against 29 emails from GitHub.
--
-- The CREATE INDEX at the bottom is NOT redundant, and drizzle-kit does not
-- generate it. Changing a generated column's expression makes drizzle-kit drop
-- and re-add the column, and dropping a column silently drops every index on
-- it. drizzle-kit's snapshot still believes emailSearchIdx exists, so it emits
-- nothing to rebuild it and search quietly falls back to a sequential scan.
-- Verified: without the statement below, `emails` came back with only
-- `emails_pkey` and `toIdx`.
--
-- Any future change to the search expression must re-create the index the same
-- way.
ALTER TABLE "emails" drop column "search";--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("subject", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("from", '')), 'B') ||
  setweight(to_tsvector('english', translate(coalesce("from", ''), '@._-', '    ')), 'B') ||
  setweight(to_tsvector('english', left("body", 200000)), 'C')
) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emailSearchIdx" ON "emails" USING gin ("search");
