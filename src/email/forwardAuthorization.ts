/**
 * Decides whether an inbound message is a genuine forward request.
 *
 * Mail to an inbox normally just gets stored. Mail from the configured
 * `FORWARD_SENDER` is instead sent on, through Resend, to that inbox's
 * receiver. That makes the forward path an open relay for anyone who can pass
 * as that sender. The envelope sender (`message.from`, SMTP MAIL FROM), the
 * `From:` header and everything in `message.raw` are whatever the sending
 * server says they are, so none of them proves anything by itself.
 *
 * The proof is the `Authentication-Results` header that Cloudflare Email
 * Routing adds itself after it has checked SPF, DKIM and DMARC. Cloudflare's
 * Email Workers reference ("Authentication results", under
 * developers.cloudflare.com/email-service/api/route-emails/email-handler/)
 * says Email Routing validates DMARC before invoking the Worker and PREPENDS
 * that header, and that the Worker should read the FIRST
 * `Authentication-Results` through `message.headers` and check that its
 * authserv-id is `mx.cloudflare.net`. "Other `Authentication-Results` headers
 * may have been supplied by the sender and should not be trusted."
 *
 * So a sender can write as many `Authentication-Results: mx.cloudflare.net;
 * dmarc=pass` headers as they like. Every one of them sits BELOW the header the
 * platform prepends, and only the first one is read.
 *
 * A forward needs ALL of:
 *
 * 1. `FORWARD_SENDER` is set to a usable address. Unset or empty means no
 *    forwarding at all. There is no default.
 * 2. The envelope sender and the single `From:` header address both equal
 *    `FORWARD_SENDER`.
 * 3. `message.headers` has an `Authentication-Results`. Without one the
 *    platform signal is missing, so nothing is forwarded (fail closed).
 * 4. The first one (`firstHeaderValue`) has authserv-id `mx.cloudflare.net`.
 * 5. It reports exactly one DMARC result, and that result is `dmarc=pass`
 *    with `header.from` equal to the sender's domain. A DMARC pass already
 *    means an aligned SPF or DKIM pass, so those are not checked separately.
 *    More than one DMARC result is refused as ambiguous.
 *
 * What this rests on: Cloudflare's documented guarantee that it prepends its
 * header to every message before invoking the Worker. A message with no
 * `Authentication-Results` at all fails closed. But if Cloudflare ever invoked
 * the Worker WITHOUT prepending, a header the sender wrote would be the first
 * one, and nothing in the message can tell that case apart. Not verified
 * against live mail.
 *
 * Note what this proves: Cloudflare saw the message pass DMARC for
 * `FORWARD_SENDER`'s DOMAIN. Anything that can send DMARC-passing mail as that
 * domain (another mailbox on it, or a service its SPF/DKIM authorises) passes
 * too. The local part is matched by check 2 only.
 *
 * Anything that fails is a refusal. The message is still stored and notified
 * as ordinary inbound mail. Only the forward is skipped.
 *
 * `Authentication-Results` is NEVER read from `message.raw` / mailparser here.
 * The raw message is the sender's text, and an earlier version of this code
 * trusted a header in it.
 *
 * This module has no Worker or Node dependencies so it can be unit tested
 * directly.
 */

/**
 * The authserv-id Cloudflare Email Routing writes on the header it prepends.
 * From Cloudflare's Email Workers docs (see the module comment).
 */
export const TRUSTED_AUTHSERV_ID = "mx.cloudflare.net";

export type ForwardDecision =
  | { forward: true; reason: "authenticated" }
  | {
      forward: false;
      reason:
        | "forward-sender-not-configured"
        | "sender-mismatch"
        | "missing-platform-authentication-results"
        | "untrusted-authserv-id"
        | "ambiguous-dmarc-result"
        | "dmarc-not-pass";
    };

export interface ForwardAuthorizationInput {
  /** `FORWARD_SENDER` from the Worker env. May be undefined or empty. */
  forwardSender: string | undefined;
  /** SMTP envelope sender, i.e. `message.from`. */
  envelopeFrom: string;
  /** Every address in the parsed `From:` header. */
  headerFromAddresses: string[];
  /**
   * `message.headers.get("authentication-results")` from the Worker's
   * `EmailMessage`, exactly as returned: null when absent, and every copy
   * joined with ", " when the message has several. Never a value read from
   * `message.raw`.
   */
  platformAuthenticationResults: string | null;
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
 * The first header out of a `Headers.get()` value, or null if there is none.
 *
 * `Headers.get()` joins repeated headers with ", ", and the platform's header
 * is the first. The cut is made at the FIRST comma, ignoring quotes and
 * comments. That way the kept text can only be part of the platform's own
 * header. A smarter split that tracked quotes or comments could be pushed past
 * the boundary into the sender's copy by a stray quote or parenthesis.
 * RFC 8601 syntax has no bare commas, so this cuts nothing from a well-formed
 * header. If Cloudflare ever writes a comma, the cut falls inside its own
 * header. Results after the comma are lost and the message fails closed.
 */
export function firstHeaderValue(joined: string | null): string | null {
  if (joined === null) return null;
  const comma = joined.indexOf(",");
  const first = (comma === -1 ? joined : joined.slice(0, comma)).trim();
  return first === "" ? null : first;
}

export function decideForward(input: ForwardAuthorizationInput): ForwardDecision {
  const sender = normaliseForwardSender(input.forwardSender);
  if (sender === null) {
    return { forward: false, reason: "forward-sender-not-configured" };
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

  const first = firstHeaderValue(input.platformAuthenticationResults);
  const parsed = first === null ? null : parseAuthenticationResults(first);
  if (parsed === null) {
    return { forward: false, reason: "missing-platform-authentication-results" };
  }
  if (parsed.authservId !== TRUSTED_AUTHSERV_ID) {
    return { forward: false, reason: "untrusted-authserv-id" };
  }

  // Exactly one. If a value Cloudflare copied from the message (a DKIM
  // selector, say) ever smuggled in a second "dmarc=" result, it is refused
  // rather than letting the two compete.
  const dmarc = parsed.results.filter((r) => r.method === "dmarc");
  if (dmarc.length !== 1) {
    return {
      forward: false,
      reason:
        dmarc.length === 0 ? "dmarc-not-pass" : "ambiguous-dmarc-result",
    };
  }
  if (
    dmarc[0].result !== "pass" ||
    dmarc[0].properties["header.from"] !== sender.domain
  ) {
    return { forward: false, reason: "dmarc-not-pass" };
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
