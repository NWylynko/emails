import { getCloudflareContext } from "@opennextjs/cloudflare";
import { withApiToken } from "@/api/authorizeApiToken";
import { getAttachmentById } from "@/email/emailQueries";

export const GET = withApiToken(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const attachmentId = Number.parseInt(id, 10);

    if (!Number.isFinite(attachmentId)) {
      return Response.json({ error: "invalid attachment id" }, { status: 400 });
    }

    const attachment = await getAttachmentById(attachmentId);

    if (attachment === null) {
      return Response.json({ error: "attachment not found" }, { status: 404 });
    }

    const { env } = getCloudflareContext();
    const object = await env.ATTACHMENTS.get(attachment.r2Key);

    if (object === null) {
      return Response.json(
        { error: "attachment blob missing" },
        { status: 404 }
      );
    }

    const headers = new Headers({
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Length": String(attachment.size),
    });

    if (attachment.name) {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${attachment.name.replace(/"/g, "")}"`
      );
    }

    return new Response(object.body, { status: 200, headers });
  }
);
