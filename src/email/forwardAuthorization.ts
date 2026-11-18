/**
 * Decides whether an inbound message is a genuine forward request.
 *
 * Mail to an inbox normally just gets stored. Mail from the configured
 * `FORWARD_SENDER` is instead sent on, through Resend, to that inbox's
 * receiver. That makes the forward path an open relay for anyone who can pass
 * as that sender. The envelope sender (`message.from`, SMTP MAIL FROM) and the
 * `From:` header are both whatever the sending server says they are, so
 * neither one proves anything by itself.
 *
 * So a forward needs ALL of:
 *
 * 1. `FORWARD_SENDER` is set to a usable address. Unset or empty means no
 *    forwarding at all. There is no default.
 * 2. The envelope sender and the single `From:` header address both equal it.
 * 3. The receiving MTA's `Authentication-Results` header (RFC 8601) reports
 *    `dmarc=pass` for that address's domain (`header.from`).
 * 4. The same header reports an aligned pass: `spf=pass` whose
 *    `smtp.mailfrom` is in that domain, or `dkim=pass` whose `header.d` is
 *    that domain. DMARC already implies one of these. Checking it here as well
 *    keeps a loose or odd DMARC line from passing on its own.
 *
 * Anything else, including a missing or unparseable header, is a refusal. The
 * message is still stored and notified as ordinary inbound mail. Only the
 * forward is skipped.
 *
 * Which `Authentication-Results` header counts matters. The sender can put any
 * headers they like in the message, including a forged
 * `Authentication-Results: ...; dmarc=pass`. The receiving MTA prepends its
 * own header above everything the sender wrote. So only the FIRST
 * `Authentication-Results` header is read, and its authserv-id must be
 * Cloudflare's. `message.headers.get()` cannot be used for this: `Headers`
 * joins repeated headers with ", ", which merges a forged header into the
 * real one with no reliable boundary between them. The ordered header lines
 * from the parsed raw message keep that boundary.
 *
 * This module has no Worker or Node dependencies so it can be unit tested
 * directly.
 */

/**
 * The authserv-id Cloudflare Email Routing writes at the start of the
 * `Authentication-Results` header it adds to inbound mail.
 */
export const TRUSTED_AUTHSERV_ID = "mx.cloudflare.net";

export type ForwardDecision =
  | { forward: true; reason: "authenticated" }
  | {
      forward: false;
      reason:
        | "forward-sender-not-configured"
        | "sender-mismatch"
        | "missing-authentication-results"
        | "untrusted-authserv-id"
        | "dmarc-not-pass"
        | "no-aligned-spf-or-dkim-pass";
    };

export interface ForwardAuthorizationInput {
  /** `FORWARD_SENDER` from the Worker env. May be undefined or empty. */
  forwardSender: string | undefined;
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

  // Only the topmost header was written by the receiving MTA. See the module
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
