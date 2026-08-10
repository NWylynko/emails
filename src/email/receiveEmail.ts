/**
 * Inbound Email Routing handler for `*@wylynko.me`.
 *
 * Parse the message, store it, upload attachments to R2, ping the website, then
 * either forward it on (if Nick sent it to an inbox that has a receiver) or just
 * notify.
 *
 * Everything after the INSERT can fail the handler, and a failed `email()` makes
 * Email Routing RETRY the whole delivery — which re-runs the INSERT and leaves
 * duplicate rows. Near-identical rows seconds apart are the signature of a
 * crashing handler, not of a message being sent twice.
 */
import { simpleParser } from "mailparser";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { createEmailsDbFromEnv } from "@/database";
import { attachments, emails, inboxes } from "@/database/schema";
import { streamToString } from "./streamToString";
import { stashOversizedEmailPart } from "./stashOversizedEmailPart";
import { sendViaResend } from "./sendViaResend";
import { pusherUpdatePing } from "@/notification/pusherUpdatePing";
import { notifyAboutEmail } from "@/notification/notifyAboutEmail";

/** Mail from this address is a forward request, not ordinary inbound mail. */
const PROXY_SENDER = "nick@wylynko.com";

export async function receiveEmail(
  message: ForwardableEmailMessage,
  env: CloudflareEnv
) {
  const db = createEmailsDbFromEnv(env);

  const email = await simpleParser(await streamToString(message.raw));

  // An inlined photo can push these past the varchar(1_000_000) columns and
  // fail the INSERT, which used to take the whole handler down with it.
  const storedBody = await stashOversizedEmailPart(
    env.ATTACHMENTS,
    "body",
    email.text ?? "[no body]"
  );
  const storedHtml = email.html
    ? await stashOversizedEmailPart(env.ATTACHMENTS, "html", email.html)
    : undefined;

  const [result] = await db
    .insert(emails)
    .values({
      from: message.from,
      to: message.to,
      subject: message.headers.get("subject"),
      body: storedBody,
      html: storedHtml,
      timestamp: new Date(),
    })
    .returning({ emailId: emails.emailId });

  for (const attachment of email.attachments) {
    const object = await env.ATTACHMENTS.put(
      crypto.randomUUID(),
      attachment.content,
      { md5: attachment.checksum }
    );

    if (object === null) {
      throw new Error("Failed to upload attachment");
    }

    await db.insert(attachments).values({
      emailId: result.emailId,
      r2Key: object.key,
      name: attachment.filename,
      size: attachment.size,
      contentType: attachment.contentType,
      timestamp: new Date(),
    });
  }

  await pusherUpdatePing();

  const [inbox] = await db
    .select({ silent: inboxes.silent, receiver: inboxes.receiver })
    .from(inboxes)
    .where(eq(inboxes.inbox, message.to));

  console.log(
    "receiveEmail",
    JSON.stringify({
      emailId: result.emailId,
      to: message.to,
      from: message.from,
      inbox,
      isProxySender: message.from === PROXY_SENDER,
      hasText: Boolean(email.text && email.text.trim() !== ""),
      attachmentCount: email.attachments.length,
    })
  );

  if (message.from !== PROXY_SENDER) {
    if (inbox?.silent !== true) {
      await notifyAboutEmail(
        result.emailId,
        `New Email for ${message.to}`,
        email.subject ?? message.from
      );
    }
    return;
  }

  // Resend is constructed only here, not at the top of the handler: its
  // constructor throws on a missing key, and ordinary inbound mail never sends
  // anything. Eager construction would make every delivery depend on a
  // credential it does not use — and a failed delivery is retried by Email
  // Routing, so that would duplicate rows for all inbound mail, not just
  // forwards.
  const resend = new Resend(env.RESEND_KEY);

  // Forward-on path. Each failure mode mails Nick back rather than silently
  // dropping the message.
  if (inbox === undefined || inbox === null) {
    await sendViaResend(resend, "inbox-not-found", {
      from: "nick@wylynko.me",
      to: PROXY_SENDER,
      subject: `Inbox not found for ${message.to}`,
      text: `Inbox not found for ${message.to}`,
    });
    return;
  }

  if (inbox.receiver === null || inbox.receiver === undefined) {
    await sendViaResend(resend, "no-receiver-set", {
      from: "nick@wylynko.me",
      to: PROXY_SENDER,
      subject: `No Receiver set for ${message.to} inbox`,
      text: `Set a receiver for this inbox by going to https://emails.wylynko.me/inbox/${message.to}`,
    });
    return;
  }

  if (email.text === undefined || email.text.trim() === "") {
    await sendViaResend(resend, "no-text-in-email", {
      from: "nick@wylynko.me",
      to: PROXY_SENDER,
      subject: "No text in the email",
      text: "No text in the email",
    });
    return;
  }

  await sendViaResend(resend, "proxy-to-receiver", {
    from: message.to,
    to: inbox.receiver,
    subject: email.subject ?? "",
    text: email.text,
    attachments: email.attachments.map((attachment) => ({
      // Resend wants a base64 string. mailparser gives a Buffer, and the SDK
      // JSON.stringify's the payload untouched — a raw Buffer would serialise
      // as {"type":"Buffer","data":[...]} and be rejected, as well as inflating
      // the request body enormously.
      content: attachment.content.toString("base64"),
      filename: attachment.filename,
      contentType: attachment.contentType,
    })),
  });

  await notifyAboutEmail(
    result.emailId,
    `Email sent to ${inbox.receiver}`,
    `Email sent to ${inbox.receiver}`
  );
}
