/**
 * Serves an attachment straight out of the R2 binding.
 *
 * Replaces a server action that signed an S3 URL with the AWS SDK. That was the
 * only way to reach R2 from off-Cloudflare; running inside a Worker, the
 * `ATTACHMENTS` binding is right there, so the SDK, the four
 * `CLOUDFLARE_R2_*` credentials and the presigning round trip all go away.
 *
 * The URL deliberately carries no file extension. `src/middleware.ts` excludes
 * extension-looking paths from the Clerk matcher so static assets skip auth —
 * naming this `/attachment/123/invoice.pdf` would quietly opt it out of the
 * gate. The explicit `auth()` check below means that would not actually expose
 * anything, but do not remove one and rely on the other.
 */
import { auth } from "@clerk/nextjs/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getEmailsDb } from "@/database";
import { attachments } from "@/database/schema";
import * as driz from "drizzle-orm";

// Params are typed inline rather than with the generated `RouteContext<...>`:
// that union is emitted from a build manifest, so a newly added route does not
// typecheck until something has already built it.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { isAuthenticated } = await auth();

  if (isAuthenticated === false) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  const attachmentId = Number(id);

  if (!Number.isInteger(attachmentId)) {
    return new Response("Invalid attachment id", { status: 400 });
  }

  const [attachment] = await getEmailsDb()
    .select({
      r2Key: attachments.r2Key,
      name: attachments.name,
      size: attachments.size,
      contentType: attachments.contentType,
    })
    .from(attachments)
    .where(driz.eq(attachments.attachmentId, attachmentId));

  if (attachment === undefined) {
    return new Response("Attachment not found", { status: 404 });
  }

  const { env } = getCloudflareContext();
  const object = await env.ATTACHMENTS.get(attachment.r2Key);

  if (object === null) {
    return new Response("Attachment blob missing from R2", { status: 404 });
  }

  const filename = (attachment.name ?? "attachment").replace(/"/g, "");

  return new Response(object.body, {
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Length": String(attachment.size),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
