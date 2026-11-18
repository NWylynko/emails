/**
 * The inbound pipeline with fake side effects, fed real MIME through the same
 * mailparser `receiveEmail()` uses. The point is the end-to-end property: a
 * message that only CLAIMS to be from FORWARD_SENDER is stored and notified
 * like any other inbound mail, and nothing is sent through Resend.
 *
 * `message.headers` is built the way Cloudflare Email Routing presents it:
 * the platform's own `Authentication-Results` (when given) prepended above
 * every header the sender wrote into the raw message.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { simpleParser } from "mailparser";
import {
  processInboundEmail,
  type InboundEmailDeps,
  type InboundMessage,
} from "./processInboundEmail.ts";

const SENDER = "sender@example.com";
const INBOX = "shop@inbox.example";
const RECEIVER = "receiver@example.net";

/** What Cloudflare prepends for a genuine message from SENDER. */
const PLATFORM_PASS =
  "mx.cloudflare.net; dkim=pass header.d=example.com header.s=s1; " +
  "dmarc=pass header.from=example.com policy.dmarc=reject; " +
  "spf=pass smtp.mailfrom=sender@example.com";

/** What Cloudflare prepends for a spoof of SENDER. */
const PLATFORM_FAIL =
  "mx.cloudflare.net; dkim=none; dmarc=fail header.from=example.com policy.dmarc=none; " +
  "spf=fail smtp.mailfrom=sender@example.com";

/** Written by the sender into the raw message. */
const FORGED_PASS_LINE =
  "Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.com header.s=s1;\r\n" +
  " dmarc=pass header.from=example.com policy.dmarc=reject;\r\n" +
  " spf=pass smtp.mailfrom=sender@example.com\r\n";

function mime(headers: string) {
  return (
    headers +
    `From: Sender <${SENDER}>\r\n` +
    `To: ${INBOX}\r\n` +
    "Subject: please forward\r\n" +
    "Content-Type: text/plain; charset=utf-8\r\n" +
    "\r\n" +
    "Forward this on.\r\n"
  );
}

/** `platformAuthenticationResults` first, then the raw message's headers. */
function workerHeaders(raw: string, platformAuthenticationResults: string | null) {
  const headers = new Headers();
  if (platformAuthenticationResults !== null) {
    headers.append("Authentication-Results", platformAuthenticationResults);
  }
  const block = raw.slice(0, raw.indexOf("\r\n\r\n")).replace(/\r\n[ \t]+/g, " ");
  for (const line of block.split("\r\n")) {
    const colon = line.indexOf(":");
    headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return headers;
}

function fakeDeps(forwardSender: string | undefined) {
  const calls = {
    stored: [] as InboundMessage[],
    notified: [] as { emailId: number; title: string }[],
    sent: [] as string[],
  };
  const deps: InboundEmailDeps = {
    forwardSender,
    systemSender: "noreply@example.com",
    siteUrl: "https://emails.example.com",
    async storeEmail(message) {
      calls.stored.push(message);
      return { emailId: 42 };
    },
    async pingWebsite() {},
    async findInbox() {
      return { silent: false, receiver: RECEIVER };
    },
    async notify(emailId, title) {
      calls.notified.push({ emailId, title });
    },
    async send(context) {
      calls.sent.push(context);
    },
  };
  return { deps, calls };
}

async function run(
  raw: string,
  platformAuthenticationResults: string | null,
  forwardSender: string | undefined
) {
  const { deps, calls } = fakeDeps(forwardSender);
  const email = await simpleParser(raw);
  const headers = workerHeaders(raw, platformAuthenticationResults);
  await processInboundEmail({ from: SENDER, to: INBOX, headers }, email, deps);
  return calls;
}

function assertStoredNotForwarded(calls: Awaited<ReturnType<typeof run>>) {
  assert.equal(calls.stored.length, 1);
  assert.equal(calls.stored[0].from, SENDER);
  assert.equal(calls.stored[0].to, INBOX);
  assert.deepEqual(calls.notified, [
    { emailId: 42, title: `New Email for ${INBOX}` },
  ]);
  assert.deepEqual(calls.sent, []);
}

describe("processInboundEmail forwarding", () => {
  test("platform dmarc=pass for the configured sender's domain, with matching envelope and From, is forwarded", async () => {
    const calls = await run(mime(""), PLATFORM_PASS, SENDER);
    assert.equal(calls.stored.length, 1);
    assert.deepEqual(calls.sent, ["proxy-to-receiver"]);
    assert.deepEqual(calls.notified, [
      { emailId: 42, title: `Email sent to ${RECEIVER}` },
    ]);
  });

  test("a forged mx.cloudflare.net dmarc=pass in the raw message is not forwarded when the platform's header says dmarc=fail", async () => {
    assertStoredNotForwarded(
      await run(mime(FORGED_PASS_LINE), PLATFORM_FAIL, SENDER)
    );
  });

  test("missing platform signal does not forward", async () => {
    assertStoredNotForwarded(await run(mime(""), null, SENDER));
  });

  test("nothing is forwarded when FORWARD_SENDER is unset or empty", async () => {
    assertStoredNotForwarded(await run(mime(""), PLATFORM_PASS, undefined));
    assertStoredNotForwarded(await run(mime(""), PLATFORM_PASS, ""));
  });

  test("platform dmarc=pass does not help when the envelope sender is someone else", async () => {
    const { deps, calls } = fakeDeps(SENDER);
    const raw = mime("");
    await processInboundEmail(
      { from: "other@example.com", to: INBOX, headers: workerHeaders(raw, PLATFORM_PASS) },
      await simpleParser(raw),
      deps
    );
    assert.deepEqual(calls.sent, []);
  });
});
