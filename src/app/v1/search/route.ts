import { withApiToken } from "@/api/authorizeApiToken";
import { getEmailsDb } from "@/database";
import { searchEmails } from "@/search/searchEmails";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(value: string | null): number {
  const n = value ? Number.parseInt(value, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(n, MAX_LIMIT);
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true";
}

/**
 * GET /v1/search?q=...&inbox=...&limit=...&unread=...
 *
 * `q` accepts the same syntax as the website's search box — "quoted phrases"
 * and -exclusion — because both go through `websearch_to_tsquery`.
 *
 * Snippets come back with matches wrapped in `<mark>`, which a terminal client
 * is expected to strip or translate into its own emphasis.
 */
export const GET = withApiToken(async (request: Request) => {
  const params = new URL(request.url).searchParams;

  const query = params.get("q");
  if (query === null || query.trim() === "") {
    return Response.json({ error: "q is required" }, { status: 400 });
  }

  const rows = await searchEmails(getEmailsDb(), {
    query,
    inbox: params.get("inbox") ?? undefined,
    limit: parseLimit(params.get("limit")),
    unreadOnly: parseBool(params.get("unread"), false),
  });

  return Response.json({
    query,
    results: rows.map((row) => ({
      emailId: row.emailId,
      from: row.from,
      to: row.to,
      subject: row.subject,
      timestamp: row.timestamp.toISOString(),
      viewed: row.viewed,
      rank: row.rank,
      snippet: row.snippet,
    })),
  });
});
