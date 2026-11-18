/**
 * Decides whether an inbound message is a genuine forward request.
 *
 * Mail to an inbox normally just gets stored. Mail from the configured
 * `FORWARD_SENDER` is instead sent on, through Resend, to that inbox's
 * receiver. That makes the forward path an open relay for anyone who can pass
 * as that sender. The envelope sender (`message.from`, SMTP MAIL FROM), the
 * `From:` header and every other header in the message are whatever the
 * sending server says they are, so none of them proves anything by itself.
 *
 * So a forward needs ALL of:
 *
 * 1. `FORWARD_SENDER` is set to a usable address. Unset or empty means no
 *    forwarding at all. There is no default.
 * 2. `FORWARD_SECRET` is set, at least `MIN_FORWARD_SECRET_LENGTH`
 *    characters long. Unset, empty or short means no forwarding at all.
 * 3. The envelope sender and the single `From:` header address both equal
 *    `FORWARD_SENDER`.
 * 4. The message has exactly one `X-Forward-Secret` header
 *    (`FORWARD_SECRET_HEADER`), and its value equals `FORWARD_SECRET`.
 * 5. The topmost `Authentication-Results` header (RFC 8601) has authserv-id
 *    `mx.cloudflare.net` and reports `dmarc=pass` for the sender's domain
 *    (`header.from`).
 * 6. The same header reports an aligned pass: `spf=pass` whose
 *    `smtp.mailfrom` is in that domain, or `dkim=pass` whose `header.d` is
 *    that domain.
 *
 * **The secret (4) is the security boundary.** Checks 5 and 6 read a header
 * the sender can write: anyone can put
 * `Authentication-Results: mx.cloudflare.net; dmarc=pass ...` in their own
 * message. Whether Cloudflare Email Routing adds its own header above the
 * sender's in `message.raw`, or strips forged ones, has NOT been verified. If
 * it does neither, a forged header is the topmost one and passes 5 and 6. So
 * 5 and 6 are defence in depth only. They can refuse a message, but passing
 * them proves nothing, and nothing is forwarded without the secret.
 *
 * Anything that fails is a refusal. The message is still stored and notified
 * as ordinary inbound mail. Only the forward is skipped.
 *
 * The secret header is never stored (only body, HTML and subject are) and is
 * not copied into the forwarded message (only subject, text and attachments
 * are), so it does not leak to the inbox's receiver. It is never logged.
 *
 * Headers are read from the parsed raw message's ordered header lines, not
 * `message.headers`: `Headers.get()` joins repeated headers with ", ", which
 * merges a second copy into the first with no reliable boundary. That is also
 * how a duplicated `X-Forward-Secret` is detected and refused.
 *
 * This module has no Worker or Node dependencies so it can be unit tested
 * directly.
 */

/**
 * The header the real forwarder must send, carrying `FORWARD_SECRET`.
 * Lowercase, because that is how mailparser keys `headerLines`.
 */
export const FORWARD_SECRET_HEADER = "x-forward-secret";

/**
 * A shorter `FORWARD_SECRET` is treated as unset. Generate one with
 * `openssl rand -hex 32`.
 */
export const MIN_FORWARD_SECRET_LENGTH = 32;

/**
 * The authserv-id expected on Cloudflare Email Routing's
 * `Authentication-Results` header. Not verified against live mail, and a
 * sender can write it too, so it is never sufficient. See the module comment.
 */
export const TRUSTED_AUTHSERV_ID = "mx.cloudflare.net";

export type ForwardDecision =
  | { forward: true; reason: "authenticated" }
  | {
      forward: false;
      reason:
        | "forward-sender-not-configured"
        | "forward-secret-not-configured"
        | "sender-mismatch"
        | "forward-secret-mismatch"
        | "missing-authentication-results"
        | "untrusted-authserv-id"
        | "dmarc-not-pass"
        | "no-aligned-spf-or-dkim-pass";
    };

export interface ForwardAuthorizationInput {
  /** `FORWARD_SENDER` from the Worker env. May be undefined or empty. */
  forwardSender: string | undefined;
  /** `FORWARD_SECRET` from the Worker env. May be undefined or empty. */
  forwardSecret: string | undefined;
  /**
   * Values of every `X-Forward-Secret` header in the message, in order,
   * without the header name.
   */
  presentedSecrets: string[];
  /** SMTP envelope sender, i.e. `message.from`. */
  envelopeFrom: string;
  /** Every address in the parsed `From:` header. */
  headerFromAddresses: string[];
  /**
   * Values of every `Authentication-Results` header, in the order they appear
   * in the message (topmost first), without the `Authentication-Results:`
   * name.
   */
  authenticationResults: string[];
}

export interface AuthenticationResult {
  method: string;
  result: string;
  /** `ptype.property` -> value, e.g. `header.from` -> `example.com`. */
  properties: Record<string, string>;
}

export interface ParsedAuthenticationResults {
  authservId: string;
  results: AuthenticationResult[];
}

/**
 * Returns the normalised `FORWARD_SENDER`, or null when it is unset, empty or
 * not a plain `local@domain` address. Null means "never forward".
 */
export function normaliseForwardSender(
  value: string | undefined
): { address: string; domain: string } | null {
  if (typeof value !== "string") return null;
  const address = value.trim().toLowerCase();
  if (address === "" || /\s/.test(address)) return null;

  const parts = address.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (local === "" || domain === "" || !domain.includes(".")) return null;

  return { address, domain };
}

/**
 * Returns the trimmed `FORWARD_SECRET`, or null when it is unset, empty or
 * shorter than `MIN_FORWARD_SECRET_LENGTH`. Null means "never forward".
 */
export function normaliseForwardSecret(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const secret = value.trim();
  return secret.length >= MIN_FORWARD_SECRET_LENGTH ? secret : null;
}

export function decideForward(input: ForwardAuthorizationInput): ForwardDecision {
  const sender = normaliseForwardSender(input.forwardSender);
  if (sender === null) {
    return { forward: false, reason: "forward-sender-not-configured" };
  }

  const expectedSecret = normaliseForwardSecret(input.forwardSecret);
  if (expectedSecret === null) {
    return { forward: false, reason: "forward-secret-not-configured" };
  }

  const envelopeFrom = input.envelopeFrom.trim().toLowerCase();
  const headerFrom = input.headerFromAddresses.map((address) =>
    address.trim().toLowerCase()
  );
  if (
    envelopeFrom !== sender.address ||
    headerFrom.length !== 1 ||
    headerFrom[0] !== sender.address
  ) {
    return { forward: false, reason: "sender-mismatch" };
  }

  // The security boundary. Exactly one header, so a sender cannot try several
  // values in one message, and so an ambiguous message is refused.
  if (
    input.presentedSecrets.length !== 1 ||
    !timingSafeEqual(input.presentedSecrets[0].trim(), expectedSecret)
  ) {
    return { forward: false, reason: "forward-secret-mismatch" };
  }

  // Defence in depth only: the sender can write this header. See the module
  // comment.
  const topmost = input.authenticationResults[0];
  if (topmost === undefined) {
    return { forward: false, reason: "missing-authentication-results" };
  }

  const parsed = parseAuthenticationResults(topmost);
  if (parsed === null) {
    return { forward: false, reason: "missing-authentication-results" };
  }
  if (parsed.authservId !== TRUSTED_AUTHSERV_ID) {
    return { forward: false, reason: "untrusted-authserv-id" };
  }

  const dmarcPass = parsed.results.some(
    (r) =>
      r.method === "dmarc" &&
      r.result === "pass" &&
      r.properties["header.from"] === sender.domain
  );
  if (!dmarcPass) {
    return { forward: false, reason: "dmarc-not-pass" };
  }

  const spfAligned = parsed.results.some(
    (r) =>
      r.method === "spf" &&
      r.result === "pass" &&
      domainOf(r.properties["smtp.mailfrom"]) === sender.domain
  );
  const dkimAligned = parsed.results.some(
    (r) =>
      r.method === "dkim" &&
      r.result === "pass" &&
      r.properties["header.d"] === sender.domain
  );
  if (!spfAligned && !dkimAligned) {
    return { forward: false, reason: "no-aligned-spf-or-dkim-pass" };
  }

  return { forward: true, reason: "authenticated" };
}

/**
 * Parses one `Authentication-Results` header value (RFC 8601 section 2.2).
 * Returns null if there is no authserv-id. Comments are dropped, folding is
 * undone, and method, result and property names and values are lowercased.
 */
export function parseAuthenticationResults(
  value: string
): ParsedAuthenticationResults | null {
  const unfolded = stripComments(value.replace(/\r?\n[ \t]+/g, " ")).replace(
    /\s+/g,
    " "
  );
  const [head, ...resinfos] = splitOutsideQuotes(unfolded, ";");

  // authserv-id, optionally followed by a version number.
  const authservId = head.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (authservId === "") return null;

  const results: AuthenticationResult[] = [];
  for (const resinfo of resinfos) {
    const tokens = splitOutsideQuotes(resinfo.trim(), " ").filter(
      (token) => token !== ""
    );
    const first = tokens.shift();
    if (first === undefined) continue;

    const equals = first.indexOf("=");
    if (equals === -1) continue; // e.g. "none"
    const method = first.slice(0, equals).split("/")[0].toLowerCase();
    const result = unquote(first.slice(equals + 1)).toLowerCase();

    const properties: Record<string, string> = {};
    for (const token of tokens) {
      const eq = token.indexOf("=");
      if (eq === -1) continue;
      const key = token.slice(0, eq).toLowerCase();
      if (key === "reason") continue;
      properties[key] = unquote(token.slice(eq + 1)).toLowerCase();
    }

    results.push({ method, result, properties });
  }

  return { authservId, results };
}

/** Constant-time for equal lengths, like `authorizeApiToken`'s. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** `user@example.com` -> `example.com`; a bare domain is returned as is. */
function domainOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const at = value.lastIndexOf("@");
  return at === -1 ? value : value.slice(at + 1);
}

function unquote(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

/** Removes RFC 5322 comments (nestable parentheses) outside quoted strings. */
function stripComments(value: string): string {
  let out = "";
  let depth = 0;
  let inQuotes = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      if (depth === 0) out += ch + value[i + 1];
      i++;
      continue;
    }
    if (depth === 0 && ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === "(") {
      depth++;
      continue;
    }
    if (!inQuotes && ch === ")" && depth > 0) {
      depth--;
      if (depth === 0) out += " ";
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of value) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === separator && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}
