ALTER TABLE "emails" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("subject", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("from", '')), 'B') ||
  setweight(to_tsvector('english', left("body", 200000)), 'C')
) STORED;--> statement-breakpoint
CREATE INDEX "emailSearchIdx" ON "emails" USING gin ("search");