import { withApiToken } from "@/api/authorizeApiToken";
import { listInboxesWithCounts } from "@/inbox/inboxQueries";

export const GET = withApiToken(async () => {
  const inboxes = await listInboxesWithCounts();

  return Response.json({
    inboxes: inboxes.map((inbox) => ({
      to: inbox.to,
      count: inbox.total,
      unread: inbox.unread,
      latest: inbox.latest?.toISOString() ?? null,
    })),
  });
});
