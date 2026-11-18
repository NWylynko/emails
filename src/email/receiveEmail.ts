/**
 * Inbound Email Routing handler for `*@wylynko.me`.
 *
 * Parse the message, store it, upload attachments to R2, ping the website, then
 * either forward it on or just notify. Forwarding happens only when the message
 * is authenticated as FORWARD_SENDER — see `forwardAuthorization.ts`. The
 * pipeline itself is `processInboundEmail()`; this file wires it to the
 * Worker's bindings.
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
import { processInboundEmail } from "./processInboundEmail";
import { pusherUpdatePing } from "@/notification/pusherUpdatePing";
import { notifyAboutEmail } from "@/notification/notifyAboutEmail";

export async function receiveEmail(
  message: ForwardableEmailMessage,
  env: CloudflareEnv
) {
  const db = createEmailsDbFromEnv(env.HYPERDRIVE);

  const email = await simpleParser(await streamToString(message.raw));

  await processInboundEmail(message, email, {
    forwardSender: env.FORWARD_SENDER,

    async storeEmail() {
      // An inlined photo can push these past the varchar(1_000_000) columns
      // and fail the INSERT, which used to take the whole handler down with it.
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

      return result;
    },

    async pingWebsite() {
      await pusherUpdatePing(env);
    },

    async findInbox(to) {
      const [inbox] = await db
        .select({ silent: inboxes.silent, receiver: inboxes.receiver })
        .from(inboxes)
        .where(eq(inboxes.inbox, to));
      return inbox;
    },

    async notify(emailId, title, body) {
      await notifyAboutEmail(env, emailId, title, body);
    },

    async send(context, payload) {
      // Resend is constructed only here, not at the top of the handler: its
      // constructor throws on a missing key, and ordinary inbound mail never
      // sends anything. Eager construction would make every delivery depend
      // on a credential it does not use — and a failed delivery is retried by
      // Email Routing, so that would duplicate rows for all inbound mail, not
      // just forwards.
      return await sendViaResend(new Resend(env.RESEND_KEY), context, payload);
    },
  });
}
