import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  decideForward,
  firstHeaderValue,
  normaliseForwardSender,
  parseAuthenticationResults,
  type ForwardAuthorizationInput,
} from "./forwardAuthorization.ts";

const SENDER = "sender@example.com";

/** What Cloudflare Email Routing prepends for a genuine message from SENDER. */
const PLATFORM_PASS =
  "mx.cloudflare.net; dkim=pass header.d=example.com header.s=s1 header.b=abc; " +
  "dmarc=pass header.from=example.com policy.dmarc=reject; " +
  "spf=pass (mx.cloudflare.net: domain of sender@example.com designates 192.0.2.1 as permitted sender) " +
  "smtp.mailfrom=sender@example.com; arc=none smtp.remote-ip=192.0.2.1";

/** What Cloudflare prepends for a spoof of SENDER. */
const PLATFORM_FAIL =
  "mx.cloudflare.net; dkim=none; dmarc=fail header.from=example.com policy.dmarc=none; " +
  "spf=fail smtp.mailfrom=sender@example.com; arc=none smtp.remote-ip=198.51.100.7";

/** A header a spoofer can write: Cloudflare's authserv-id and every pass. */
const FORGED_PASS =
  "mx.cloudflare.net; dkim=pass header.d=example.com; " +
  "spf=pass smtp.mailfrom=sender@example.com; dmarc=pass header.from=example.com";

/** `message.headers.get()` joins repeated headers like this. */
function joined(...values: string[]): string {
  const headers = new Headers();
  for (const value of values) headers.append("Authentication-Results", value);
  return headers.get("authentication-results")!;
}

function input(
  overrides: Partial<ForwardAuthorizationInput> = {}
): ForwardAuthorizationInput {
  return {
    forwardSender: SENDER,
    envelopeFrom: SENDER,
    headerFromAddresses: [SENDER],
    platformAuthenticationResults: joined(PLATFORM_PASS),
    ...overrides,
  };
}

describe("decideForward: only the platform-prepended header counts", () => {
  test("forwards when the platform's header shows dmarc=pass for the sender's domain", () => {
    assert.deepEqual(decideForward(input()), {
      forward: true,
      reason: "authenticated",
    });
  });

  test("a forged mx.cloudflare.net dmarc=pass below the platform's dmarc=fail does not forward", () => {
    // The sender's copy is appended after the platform's by Headers.get().
    assert.deepEqual(
      decideForward(
        input({ platformAuthenticationResults: joined(PLATFORM_FAIL, FORGED_PASS) })
      ),
      { forward: false, reason: "dmarc-not-pass" }
    );
  });

  test("a forged header cannot hide the platform's result with stray quotes or parentheses", () => {
    for (const trick of [
      'mx.cloudflare.net; dmarc=fail header.from="example.com',
      "mx.cloudflare.net; dmarc=fail header.from=example.com (",
    ]) {
      const value = joined(trick, `x"; ${FORGED_PASS}`);
      assert.equal(
        decideForward(input({ platformAuthenticationResults: value })).forward,
        false,
        value
      );
    }
  });

  test("missing platform signal does not forward", () => {
    for (const value of [null, "", "   "]) {
      assert.deepEqual(
        decideForward(input({ platformAuthenticationResults: value })),
        { forward: false, reason: "missing-platform-authentication-results" },
        JSON.stringify(value)
      );
    }
  });

  test("a platform header whose authserv-id is not Cloudflare's does not forward", () => {
    const other = "mx.attacker.example; dmarc=pass header.from=example.com";
    assert.equal(
      decideForward(input({ platformAuthenticationResults: joined(other, FORGED_PASS) }))
        .reason,
      "untrusted-authserv-id"
    );
  });

  test("never forwards when FORWARD_SENDER is unset, empty or malformed", () => {
    for (const forwardSender of [undefined, "", "   ", "not-an-address", "a@b", "@example.com"]) {
      assert.deepEqual(
        decideForward(input({ forwardSender })),
        { forward: false, reason: "forward-sender-not-configured" },
        JSON.stringify(forwardSender)
      );
    }
  });

  test("compares addresses case-insensitively", () => {
    assert.equal(
      decideForward(
        input({
          forwardSender: "Sender@Example.COM",
          envelopeFrom: "SENDER@example.com",
          headerFromAddresses: ["sender@EXAMPLE.com"],
        })
      ).forward,
      true
    );
  });

  test("refuses when the envelope or From: header is someone else", () => {
    for (const overrides of [
      { envelopeFrom: "other@example.com" },
      { headerFromAddresses: ["other@example.com"] },
      { headerFromAddresses: [SENDER, "other@example.com"] },
      { headerFromAddresses: [] },
    ]) {
      assert.equal(decideForward(input(overrides)).reason, "sender-mismatch");
    }
  });

  test("refuses a dmarc=pass for a different domain or a lookalike subdomain", () => {
    for (const domain of ["attacker.example", "evil.example.com", "example.com.evil"]) {
      const header = `mx.cloudflare.net; dmarc=pass header.from=${domain}`;
      assert.equal(
        decideForward(input({ platformAuthenticationResults: header })).reason,
        "dmarc-not-pass",
        domain
      );
    }
  });

  test("refuses a dmarc=pass with no header.from", () => {
    assert.equal(
      decideForward(
        input({ platformAuthenticationResults: "mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass" })
      ).reason,
      "dmarc-not-pass"
    );
  });

  test("refuses when the platform's header has no DMARC result", () => {
    assert.equal(
      decideForward(
        input({ platformAuthenticationResults: "mx.cloudflare.net; spf=pass smtp.mailfrom=sender@example.com" })
      ).reason,
      "dmarc-not-pass"
    );
  });

  test("refuses two DMARC results in the platform's header as ambiguous", () => {
    const header =
      "mx.cloudflare.net; dmarc=fail header.from=example.com; dmarc=pass header.from=example.com";
    assert.equal(
      decideForward(input({ platformAuthenticationResults: header })).reason,
      "ambiguous-dmarc-result"
    );
  });

  test("does not read a dmarc=pass hidden in a comment", () => {
    const header =
      "mx.cloudflare.net; dmarc=fail (dmarc=pass header.from=example.com) " +
      "header.from=example.com";
    assert.equal(
      decideForward(input({ platformAuthenticationResults: header })).reason,
      "dmarc-not-pass"
    );
  });
});

describe("firstHeaderValue", () => {
  test("returns the only header unchanged", () => {
    assert.equal(firstHeaderValue(PLATFORM_PASS), PLATFORM_PASS);
  });

  test("returns only the first of several joined headers", () => {
    assert.equal(firstHeaderValue(joined(PLATFORM_FAIL, FORGED_PASS)), PLATFORM_FAIL);
  });

  test("returns null when there is no header", () => {
    assert.equal(firstHeaderValue(null), null);
    assert.equal(firstHeaderValue(""), null);
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
