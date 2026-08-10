import { withApiToken } from "@/api/authorizeApiToken";
import {
  getEmailById,
  listEmailAttachments,
  markEmailViewed,
  readEmailBody,
  readEmailHtml,
} from "@/email/emailQueries";

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true";
}

export const GET = withApiToken(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const emailId = Number.parseInt(id, 10);

    if (!Number.isFinite(emailId)) {
      return Response.json({ error: "invalid email id" }, { status: 400 });
    }

    const params = new URL(request.url).searchParams;
    const includeBody = parseBool(params.get("body"), true);
    const includeHtml = parseBool(params.get("html"), false);
    const mark = parseBool(params.get("mark"), true);

    const email = await getEmailById(emailId);

    if (email === null) {
      return Response.json({ error: "email not found" }, { status: 404 });
    }

    if (mark && !email.viewed) {
      await markEmailViewed(emailId);
      email.viewed = true;
    }

    const attachmentRows = await listEmailAttachments(emailId);

    return Response.json({
      emailId: email.emailId,
      from: email.from,
      to: email.to,
      subject: email.subject,
      timestamp: email.timestamp.toISOString(),
      viewed: email.viewed,
      ...(includeBody ? { body: await readEmailBody(emailId) } : {}),
      ...(includeHtml ? { html: await readEmailHtml(emailId) } : {}),
      attachments: attachmentRows.map((a) => ({
        attachmentId: a.attachmentId,
        name: a.name,
        size: a.size,
        contentType: a.contentType,
        timestamp: a.timestamp.toISOString(),
      })),
    });
  }
);
