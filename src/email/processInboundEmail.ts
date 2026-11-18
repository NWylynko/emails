/**
 * The inbound mail pipeline, with its side effects passed in.
 *
 * `receiveEmail()` wires this to Postgres, R2, Pusher and Resend. Tests wire it
 * to fakes, which is what lets `processInboundEmail.test.ts` prove that a faked
 * forward sender is stored like any other mail and never forwarded. Keep the
 * imports here relative and free of Worker-only modules for that reason.
 *
 * Order matters: the message is stored BEFORE anything else runs, so it is
 * stored whatever the forward decision turns out to be.
 */
import type { ParsedMail } from "mailparser";
import type { CreateEmailOptions } from "resend";
import {
  decideForward,
  normaliseForwardSender,
} from "./forwardAuthorization.ts";

export interface InboundMessage {
  /** SMTP envelope sender (MAIL FROM). */
  from: string;
  /** SMTP envelope recipient, i.e. the inbox. */
  to: string;
}

export interface InboundEmailDeps {
  /** `FORWARD_SENDER`. Unset or empty disables forwarding entirely. */
  forwardSender: string | undefined;
  /** INSERT the message and its attachments. */
  storeEmail(
    message: InboundMessage,
    email: ParsedMail
  ): Promise<{ emailId: number }>;
  pingWebsite(): Promise<void>;
  findInbox(
    inbox: string
  ): Promise<{ silent: boolean | null; receiver: string | null } | undefined>;
  notify(emailId: number, title: string, body: string): Promise<void>;
  /** Sends through Resend. Only called on an authenticated forward. */
  send(context: string, payload: CreateEmailOptions): Promise<unknown>;
}

export async function processInboundEmail(
  message: InboundMessage,
  email: ParsedMail,
  deps: InboundEmailDeps
) {
  const result = await deps.storeEmail(message, email);

  await deps.pingWebsite();

  const inbox = await deps.findInbox(message.to);

  const headerFromAddresses = (email.from?.value ?? []).map(
    (address) => address.address ?? ""
  );
  const authenticationResults = authenticationResultsHeaders(email);
  const decision = decideForward({
    forwardSender: deps.forwardSender,
    envelopeFrom: message.from,
    headerFromAddresses,
    authenticationResults,
  });

  console.log(
    "receiveEmail",
    JSON.stringify({
      emailId: result.emailId,
      to: message.to,
      from: message.from,
      inbox,
      forward: decision.forward,
      forwardReason: decision.reason,
      hasText: Boolean(email.text && email.text.trim() !== ""),
      attachmentCount: email.attachments.length,
    })
  );

  // Someone claimed to be the forward sender but did not authenticate as it.
  // It is stored and notified as ordinary mail below; this makes the attempt
  // visible in `wrangler tail`.
  const configuredSender = normaliseForwardSender(deps.forwardSender);
  const claimsForwardSender =
    configuredSender !== null &&
    [message.from, ...headerFromAddresses].some(
      (address) => address.trim().toLowerCase() === configuredSender.address
    );
  if (!decision.forward && claimsForwardSender) {
    console.warn(
      "receiveEmail forward refused",
      JSON.stringify({
        emailId: result.emailId,
        to: message.to,
        from: message.from,
        reason: decision.reason,
        authenticationResults: authenticationResults[0] ?? null,
      })
    );
  }

  if (!decision.forward) {
    if (inbox?.silent !== true) {
      await deps.notify(
        result.emailId,
        `New Email for ${message.to}`,
        email.subject ?? message.from
      );
    }
    return;
  }

  // decideForward only allows a forward when FORWARD_SENDER is a usable
  // address, and it equals message.from, so this is the configured sender.
  const forwardSender = message.from;

  // Forward-on path. Each failure mode mails the forward sender back rather
  // than silently dropping the message.
  if (inbox === undefined || inbox === null) {
    await deps.send("inbox-not-found", {
      from: "nick@wylynko.me",
      to: forwardSender,
      subject: `Inbox not found for ${message.to}`,
      text: `Inbox not found for ${message.to}`,
    });
    return;
  }

  if (inbox.receiver === null || inbox.receiver === undefined) {
    await deps.send("no-receiver-set", {
      from: "nick@wylynko.me",
      to: forwardSender,
      subject: `No Receiver set for ${message.to} inbox`,
      text: `Set a receiver for this inbox by going to https://emails.wylynko.me/inbox/${message.to}`,
    });
    return;
  }

  if (email.text === undefined || email.text.trim() === "") {
    await deps.send("no-text-in-email", {
      from: "nick@wylynko.me",
      to: forwardSender,
      subject: "No text in the email",
      text: "No text in the email",
    });
    return;
  }

  await deps.send("proxy-to-receiver", {
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

  await deps.notify(
    result.emailId,
    `Email sent to ${inbox.receiver}`,
    `Email sent to ${inbox.receiver}`
  );
}

/**
 * Every `Authentication-Results` header value, topmost first, from mailparser's
 * ordered raw header lines. Not `email.headers`, which keeps only one value per
 * name in some versions, and not `message.headers`, which merges repeats.
 */
function authenticationResultsHeaders(email: ParsedMail): string[] {
  return email.headerLines
    .filter((header) => header.key === "authentication-results")
    .map((header) => header.line.replace(/^[^:]*:\s*/, ""));
}
