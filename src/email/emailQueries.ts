/**
 * Email and attachment reads, shared by the website and the `/v1` CLI API.
 *
 * `readEmailBody` / `readEmailHtml` are the only sanctioned way to get at those
 * columns. They resolve `r2:oversized-email-part/...` pointers, which is what a
 * body over 900k characters is stored as. Reading the column directly renders
 * the pointer as literal text — that was live on three pages before the merge.
 */
import * as driz from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getEmailsDb } from "@/database";
import { attachments, emails } from "@/database/schema";
import { resolveOversizedEmailPart } from "./stashOversizedEmailPart";

function attachmentsBucket() {
  return getCloudflareContext().env.ATTACHMENTS;
}

export async function getEmailById(emailId: number) {
  const [email] = await getEmailsDb()
    .select()
    .from(emails)
    .where(driz.eq(emails.emailId, emailId));

  return email ?? null;
}

export async function getEmailHeader(emailId: number) {
  const [email] = await getEmailsDb()
    .select({
      emailId: emails.emailId,
      to: emails.to,
      from: emails.from,
      subject: emails.subject,
      viewed: emails.viewed,
      timestamp: emails.timestamp,
    })
    .from(emails)
    .where(driz.eq(emails.emailId, emailId));

  return email ?? null;
}

/** Text body, with any oversized-part pointer resolved from R2. */
export async function readEmailBody(emailId: number): Promise<string | null> {
  const [row] = await getEmailsDb()
    .select({ body: emails.body })
    .from(emails)
    .where(driz.eq(emails.emailId, emailId));

  if (row === undefined) {
    return null;
  }

  return resolveOversizedEmailPart(attachmentsBucket(), row.body);
}

/** HTML body, with any oversized-part pointer resolved from R2. */
export async function readEmailHtml(emailId: number): Promise<string | null> {
  const [row] = await getEmailsDb()
    .select({ html: emails.html })
    .from(emails)
    .where(driz.eq(emails.emailId, emailId));

  if (row === undefined) {
    return null;
  }

  return resolveOversizedEmailPart(attachmentsBucket(), row.html);
}

export async function markEmailViewed(emailId: number) {
  await getEmailsDb()
    .update(emails)
    .set({ viewed: true })
    .where(driz.eq(emails.emailId, emailId));
}

export async function listEmailAttachments(emailId: number) {
  return getEmailsDb()
    .select({
      attachmentId: attachments.attachmentId,
      emailId: attachments.emailId,
      name: attachments.name,
      size: attachments.size,
      contentType: attachments.contentType,
      timestamp: attachments.timestamp,
    })
    .from(attachments)
    .where(driz.eq(attachments.emailId, emailId));
}

export async function getAttachmentById(attachmentId: number) {
  const [attachment] = await getEmailsDb()
    .select({
      r2Key: attachments.r2Key,
      name: attachments.name,
      size: attachments.size,
      contentType: attachments.contentType,
    })
    .from(attachments)
    .where(driz.eq(attachments.attachmentId, attachmentId));

  return attachment ?? null;
}
