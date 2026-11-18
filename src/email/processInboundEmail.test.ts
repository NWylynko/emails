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
// Test value only. The real FORWARD_SECRET lives in Infisical.
const SECRET = "test-forward-secret-0123456789abcdef";
const SECRET_HEADER = `X-Forward-Secret: ${SECRET}\r\n`;

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

function fakeDeps(
  forwardSender: string | undefined,
  forwardSecret: string | undefined
) {
  const calls = {
    stored: [] as InboundMessage[],
    notified: [] as { emailId: number; title: string }[],
    sent: [] as string[],
  };
  const deps: InboundEmailDeps = {
    forwardSender,
    forwardSecret,
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
  forwardSender: string | undefined,
  // Not a default parameter: an explicit `undefined` must mean "unset".
  ...secret: [forwardSecret?: string | undefined]
) {
  const forwardSecret = secret.length === 0 ? SECRET : secret[0];
  const { deps, calls } = fakeDeps(forwardSender, forwardSecret);
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
  test("FORWARD_SENDER with the correct secret is forwarded", async () => {
    const calls = await run(mime(SECRET_HEADER + CLOUDFLARE_PASS), SENDER);
    assert.equal(calls.stored.length, 1);
    assert.deepEqual(calls.sent, ["proxy-to-receiver"]);
    assert.deepEqual(calls.notified, [
      { emailId: 42, title: `Email sent to ${RECEIVER}` },
    ]);
  });

  test("a forged mx.cloudflare.net dmarc=pass header with no secret is stored as normal mail and not forwarded", async () => {
    // Spoofed address plus a forged Authentication-Results, and nothing else.
    // Whether Cloudflare would add its own header above this one is not
    // verified, so this must be refused on the secret alone.
    assertStoredNotForwarded(await run(mime(CLOUDFLARE_PASS), SENDER));
  });

  test("a forged mx.cloudflare.net dmarc=pass header with a wrong secret is stored as normal mail and not forwarded", async () => {
    const wrong = "X-Forward-Secret: wrong-secret-0123456789abcdef0123\r\n";
    assertStoredNotForwarded(await run(mime(wrong + CLOUDFLARE_PASS), SENDER));
  });

  test("nothing is forwarded when FORWARD_SECRET is unset or empty", async () => {
    const raw = mime(SECRET_HEADER + CLOUDFLARE_PASS);
    assertStoredNotForwarded(await run(raw, SENDER, undefined));
    assertStoredNotForwarded(await run(raw, SENDER, ""));
  });

  test("the correct secret is still refused when Cloudflare's header shows a DMARC fail", async () => {
    assertStoredNotForwarded(
      await run(mime(SECRET_HEADER + CLOUDFLARE_FAIL), SENDER)
    );
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
    const raw = mime(SECRET_HEADER + CLOUDFLARE_PASS);
    assertStoredNotForwarded(await run(raw, undefined));
    assertStoredNotForwarded(await run(raw, ""));
  });
});
