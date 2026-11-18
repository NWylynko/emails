import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  decideForward,
  normaliseForwardSender,
  parseAuthenticationResults,
  type ForwardAuthorizationInput,
} from "./forwardAuthorization.ts";

const SENDER = "sender@example.com";

const PASSING_HEADER =
  "mx.cloudflare.net; dkim=pass header.d=example.com header.s=s1 header.b=abc; " +
  "dmarc=pass header.from=example.com policy.dmarc=reject; " +
  "spf=pass (mx.cloudflare.net: domain of sender@example.com designates 192.0.2.1 as permitted sender) " +
  "smtp.mailfrom=sender@example.com; arc=none smtp.remote-ip=192.0.2.1";

function input(
  overrides: Partial<ForwardAuthorizationInput> = {}
): ForwardAuthorizationInput {
  return {
    forwardSender: SENDER,
    envelopeFrom: SENDER,
    headerFromAddresses: [SENDER],
    authenticationResults: [PASSING_HEADER],
    ...overrides,
  };
}

describe("decideForward", () => {
  test("forwards a message that passes DMARC with aligned SPF and DKIM", () => {
    assert.deepEqual(decideForward(input()), {
      forward: true,
      reason: "authenticated",
    });
  });

  test("compares addresses case-insensitively", () => {
    assert.equal(
      decideForward(
        input({
          forwardSender: " Sender@Example.com ",
          envelopeFrom: "SENDER@example.COM",
        })
      ).forward,
      true
    );
  });

  test("never forwards when FORWARD_SENDER is unset, empty or malformed", () => {
    for (const forwardSender of [undefined, "", "   ", "example.com", "a@b@c.com", "x@localhost"]) {
      assert.deepEqual(
        decideForward(input({ forwardSender })),
        { forward: false, reason: "forward-sender-not-configured" },
        `forwardSender=${JSON.stringify(forwardSender)}`
      );
    }
  });

  test("refuses when the envelope or From: header is someone else", () => {
    for (const overrides of [
      { envelopeFrom: "attacker@evil.example" },
      { headerFromAddresses: ["attacker@evil.example"] },
      { headerFromAddresses: [] },
      { headerFromAddresses: [SENDER, "attacker@evil.example"] },
    ]) {
      assert.equal(decideForward(input(overrides)).reason, "sender-mismatch");
    }
  });

  test("refuses a faked sender with no Authentication-Results", () => {
    assert.deepEqual(decideForward(input({ authenticationResults: [] })), {
      forward: false,
      reason: "missing-authentication-results",
    });
  });

  test("refuses when DMARC failed", () => {
    const header =
      "mx.cloudflare.net; dkim=none; dmarc=fail header.from=example.com; " +
      "spf=softfail smtp.mailfrom=sender@example.com";
    assert.equal(
      decideForward(input({ authenticationResults: [header] })).reason,
      "dmarc-not-pass"
    );
  });

  test("refuses a dmarc=pass for a different domain", () => {
    const header =
      "mx.cloudflare.net; dkim=pass header.d=evil.example; " +
      "dmarc=pass header.from=evil.example; spf=pass smtp.mailfrom=a@evil.example";
    assert.equal(
      decideForward(input({ authenticationResults: [header] })).reason,
      "dmarc-not-pass"
    );
  });

  test("refuses a lookalike subdomain of the sender's domain", () => {
    const header =
      "mx.cloudflare.net; dkim=pass header.d=example.com.evil.example; " +
      "dmarc=pass header.from=example.com.evil.example";
    assert.equal(
      decideForward(input({ authenticationResults: [header] })).reason,
      "dmarc-not-pass"
    );
  });

  test("refuses dmarc=pass with no aligned SPF or DKIM pass", () => {
    const header =
      "mx.cloudflare.net; dkim=pass header.d=evil.example; " +
      "dmarc=pass header.from=example.com; spf=pass smtp.mailfrom=a@evil.example";
    assert.equal(
      decideForward(input({ authenticationResults: [header] })).reason,
      "no-aligned-spf-or-dkim-pass"
    );
  });

  test("accepts DKIM alone or SPF alone as the aligned pass", () => {
    const dkimOnly =
      "mx.cloudflare.net; dkim=pass header.d=example.com; " +
      "dmarc=pass header.from=example.com; spf=fail smtp.mailfrom=sender@example.com";
    const spfOnly =
      "mx.cloudflare.net; dkim=fail header.d=example.com; " +
      "dmarc=pass header.from=example.com; spf=pass smtp.mailfrom=sender@example.com";
    assert.equal(decideForward(input({ authenticationResults: [dkimOnly] })).forward, true);
    assert.equal(decideForward(input({ authenticationResults: [spfOnly] })).forward, true);
  });

  test("ignores a forged pass header below the real one", () => {
    const real =
      "mx.cloudflare.net; dkim=none; dmarc=fail header.from=example.com; " +
      "spf=fail smtp.mailfrom=sender@example.com";
    assert.equal(
      decideForward(input({ authenticationResults: [real, PASSING_HEADER] })).reason,
      "dmarc-not-pass"
    );
  });

  test("refuses when the topmost header is not from Cloudflare", () => {
    const forged = PASSING_HEADER.replace("mx.cloudflare.net", "mx.evil.example");
    assert.equal(
      decideForward(input({ authenticationResults: [forged] })).reason,
      "untrusted-authserv-id"
    );
  });

  test("does not read a dmarc=pass hidden in a comment", () => {
    const header =
      "mx.cloudflare.net; dmarc=fail (dmarc=pass header.from=example.com) " +
      "header.from=example.com; spf=pass smtp.mailfrom=sender@example.com";
    assert.equal(
      decideForward(input({ authenticationResults: [header] })).reason,
      "dmarc-not-pass"
    );
  });
});

describe("parseAuthenticationResults", () => {
  test("unfolds, drops comments and lowercases", () => {
    const parsed = parseAuthenticationResults(
      "MX.Cloudflare.net 1;\r\n\tDMARC=Pass (p=reject) header.from=Example.COM;\r\n spf=pass smtp.mailfrom=\"sender@example.com\""
    );
    assert.deepEqual(parsed, {
      authservId: "mx.cloudflare.net",
      results: [
        { method: "dmarc", result: "pass", properties: { "header.from": "example.com" } },
        { method: "spf", result: "pass", properties: { "smtp.mailfrom": "sender@example.com" } },
      ],
    });
  });

  test("returns null for an empty header", () => {
    assert.equal(parseAuthenticationResults("   "), null);
  });
});

describe("normaliseForwardSender", () => {
  test("splits a valid address", () => {
    assert.deepEqual(normaliseForwardSender("Sender@Example.com"), {
      address: "sender@example.com",
      domain: "example.com",
    });
  });
});
