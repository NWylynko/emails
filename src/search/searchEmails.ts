/**
 * Full-text search across received mail.
 *
 * There is no search service and no second copy of the data. Postgres does it,
 * through the generated `emails.search` tsvector column and its GIN index (see
 * `src/database/schema.ts`). At this corpus size that is not a compromise —
 * measured on 50k seeded rows, an indexed lookup executes in well under a
 * millisecond server-side.
 *
 * The db is passed in rather than taken from `getEmailsDb()` so this can be
 * driven directly by tests against the dev database, with no Worker context to
 * fake. Callers inside the app pass `getEmailsDb()`.
 */
import { sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/postgres-js";

type EmailsDb = ReturnType<typeof drizzle>;

export type SearchEmailsParams = {
  /** Raw text straight from the search box. Never pre-escape it. */
  query: string;
  /** Restrict to one inbox. Omit to search every inbox. */
  inbox?: string;
  limit?: number;
  unreadOnly?: boolean;
};

export type EmailSearchResult = {
  emailId: number;
  from: string;
  to: string;
  subject: string | null;
  timestamp: Date;
  viewed: boolean;
  /** ts_rank score. Only meaningful for ordering within one result set. */
  rank: number;
  /** Matching fragment of the body, with hits wrapped in `<mark>`. */
  snippet: string;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Must stay in step with `left("body", 200000)` in the schema's index
 * expression: text past this point is not indexed, so it can never be the
 * reason a row matched and can never need to appear in a snippet. Bounding it
 * here also stops `ts_headline` hauling a megabyte body out of the table.
 */
const INDEXED_BODY_CHARS = 200_000;

const HEADLINE_OPTIONS =
  "StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=18, MinWords=6, FragmentDelimiter= … ";

export async function searchEmails(
  db: EmailsDb,
  { query, inbox, limit = DEFAULT_LIMIT, unreadOnly = false }: SearchEmailsParams
): Promise<EmailSearchResult[]> {
  // A blank box is not an error, and not a request for every email either.
  if (query.trim() === "") {
    return [];
  }

  const cappedLimit = Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);

  /**
   * `websearch_to_tsquery` rather than `to_tsquery`, because this takes
   * whatever a person typed. `to_tsquery` raises a syntax error on unbalanced
   * quotes, stray operators or a lone `!`, which would turn ordinary typing
   * into a 500. websearch never throws, and it understands the syntax people
   * already expect: "quoted phrases" and -exclusion.
   */
  const tsquery = sql`websearch_to_tsquery('english', ${query})`;

  const conditions = [sql`"search" @@ ${tsquery}`];
  if (inbox !== undefined) {
    conditions.push(sql`"to" = ${inbox}`);
  }
  if (unreadOnly) {
    conditions.push(sql`"viewed" = false`);
  }
  const where = sql.join(conditions, sql` and `);

  /**
   * Ranking and highlighting are split across two stages on purpose:
   * `ts_headline` is not index-accelerated and has to re-parse the document it
   * is given, so it runs only over the rows that survived the limit, not over
   * every match.
   */
  const rows = await db.execute<{
    emailId: number;
    from: string;
    to: string;
    subject: string | null;
    timestamp: Date;
    viewed: boolean;
    rank: number;
    snippet: string;
  }>(sql`
    with matches as (
      select
        "emailId", "from", "to", "subject", "timestamp", "viewed",
        left("body", ${INDEXED_BODY_CHARS}) as "indexedBody",
        ts_rank("search", ${tsquery}) as "rank"
      from "emails"
      where ${where}
      order by "rank" desc, "timestamp" desc
      limit ${cappedLimit}
    )
    select
      "emailId", "from", "to", "subject", "timestamp", "viewed", "rank",
      ts_headline('english', "indexedBody", ${tsquery}, ${HEADLINE_OPTIONS}) as "snippet"
    from matches
    order by "rank" desc, "timestamp" desc
  `);

  return Array.from(rows).map((row) => ({
    emailId: Number(row.emailId),
    from: row.from,
    to: row.to,
    subject: row.subject,
    timestamp: new Date(row.timestamp),
    viewed: row.viewed,
    rank: Number(row.rank),
    snippet: row.snippet,
  }));
}
