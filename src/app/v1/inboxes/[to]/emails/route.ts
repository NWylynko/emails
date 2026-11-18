import { withApiToken } from "@/api/authorizeApiToken";
import { listInboxEmails } from "@/inbox/inboxQueries";

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

export const GET = withApiToken(
  async (request: Request, context: { params: Promise<{ to: string }> }) => {
    // Next has already percent-decoded the segment, so `user%40example.com`
    // arrives as `user@example.com`.
    const { to } = await context.params;
    const params = new URL(request.url).searchParams;

    const sinceParam = params.get("since");
    const since = sinceParam ? new Date(sinceParam) : undefined;
    if (since && Number.isNaN(since.getTime())) {
      return Response.json({ error: "invalid since timestamp" }, { status: 400 });
    }

    const afterIdParam = params.get("after_id");
    const afterId = afterIdParam ? Number.parseInt(afterIdParam, 10) : undefined;
    if (afterId !== undefined && !Number.isFinite(afterId)) {
      return Response.json({ error: "invalid after_id" }, { status: 400 });
    }

    const rows = await listInboxEmails(to, {
      limit: parseLimit(params.get("limit")),
      unreadOnly: parseBool(params.get("unread"), false),
      since,
      afterId,
      from: params.get("from") ?? undefined,
      subject: params.get("subject") ?? undefined,
    });

    return Response.json({
      emails: rows.map((row) => ({
        emailId: row.emailId,
        from: row.from,
        to: row.to,
        subject: row.subject,
        timestamp: row.timestamp.toISOString(),
        viewed: row.viewed,
      })),
    });
  }
);
