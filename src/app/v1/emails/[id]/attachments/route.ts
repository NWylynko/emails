import { withApiToken } from "@/api/authorizeApiToken";
import { getEmailHeader, listEmailAttachments } from "@/email/emailQueries";

export const GET = withApiToken(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const emailId = Number.parseInt(id, 10);

    if (!Number.isFinite(emailId)) {
      return Response.json({ error: "invalid email id" }, { status: 400 });
    }

    if ((await getEmailHeader(emailId)) === null) {
      return Response.json({ error: "email not found" }, { status: 404 });
    }

    const rows = await listEmailAttachments(emailId);

    return Response.json({
      attachments: rows.map((a) => ({
        attachmentId: a.attachmentId,
        emailId: a.emailId,
        name: a.name,
        size: a.size,
        contentType: a.contentType,
        timestamp: a.timestamp.toISOString(),
      })),
    });
  }
);
