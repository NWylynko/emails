/**
 * The inbound pipeline with fake side effects, fed real MIME through the same
 * mailparser `receiveEmail()` uses. The point is the end-to-end property: a
 * message that only CLAIMS to be from FORWARD_SENDER is stored and notified
 * like any other inbound mail, and nothing is sent through Resend.
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

const CLOUDFLARE_PASS =
  "Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.com header.s=s1;\r\n" +
  " dmarc=pass header.from=example.com policy.dmarc=reject;\r\n" +
  " spf=pass smtp.mailfrom=sender@example.com\r\n";

const CLOUDFLARE_FAIL =
  "Authentication-Results: mx.cloudflare.net; dkim=none;\r\n" +
  " dmarc=fail header.from=example.com policy.dmarc=none;\r\n" +
  " spf=fail smtp.mailfrom=sender@example.com\r\n";

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

function fakeDeps(forwardSender: string | undefined) {
  const calls = {
    stored: [] as InboundMessage[],
    notified: [] as { emailId: number; title: string }[],
    sent: [] as string[],
  };
  const deps: InboundEmailDeps = {
    forwardSender,
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

async function run(raw: string, forwardSender: string | undefined) {
  const { deps, calls } = fakeDeps(forwardSender);
  const email = await simpleParser(raw);
  await processInboundEmail({ from: SENDER, to: INBOX }, email, deps);
  return calls;
}

function assertStoredNotForwarded(calls: Awaited<ReturnType<typeof run>>) {
  assert.deepEqual(calls.stored, [{ from: SENDER, to: INBOX }]);
  assert.deepEqual(calls.notified, [
    { emailId: 42, title: `New Email for ${INBOX}` },
  ]);
  assert.deepEqual(calls.sent, []);
}

describe("processInboundEmail forwarding", () => {
  test("an authenticated FORWARD_SENDER message is forwarded", async () => {
    const calls = await run(mime(CLOUDFLARE_PASS), SENDER);
    assert.equal(calls.stored.length, 1);
    assert.deepEqual(calls.sent, ["proxy-to-receiver"]);
    assert.deepEqual(calls.notified, [
      { emailId: 42, title: `Email sent to ${RECEIVER}` },
    ]);
  });

  test("a faked sender that fails DMARC is stored as normal mail and not forwarded", async () => {
    assertStoredNotForwarded(await run(mime(CLOUDFLARE_FAIL), SENDER));
  });

  test("a faked sender with a forged pass header under the real one is not forwarded", async () => {
    const forged = CLOUDFLARE_PASS; // written by the attacker, sits below Cloudflare's
    assertStoredNotForwarded(await run(mime(CLOUDFLARE_FAIL + forged), SENDER));
  });

  test("a faked sender with no Authentication-Results is not forwarded", async () => {
    assertStoredNotForwarded(await run(mime(""), SENDER));
  });

  test("nothing is forwarded when FORWARD_SENDER is unset or empty", async () => {
    assertStoredNotForwarded(await run(mime(CLOUDFLARE_PASS), undefined));
    assertStoredNotForwarded(await run(mime(CLOUDFLARE_PASS), ""));
  });
});
