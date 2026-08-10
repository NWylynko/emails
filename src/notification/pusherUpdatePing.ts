/**
 * Fire-and-forget ping on the "updates" channel. The website subscribes
 * (src/providers/UpdatesProvider.tsx) and lights up the refresh button when a
 * new message lands, without polling.
 *
 * Signing is done by hand because the official pusher SDK is a Node library.
 *
 * NOTE: these credentials are hardcoded, as they were in the standalone
 * service. They belong in secrets — tracked in AGENTS.md under cleanups.
 */
const PUSHER_APP_ID = "1942904";
const PUSHER_KEY = "16f0a5d23fb65028d3ad";
const PUSHER_SECRET = "8391da3f075bb2c89edf";
const PUSHER_CLUSTER = "ap4";

async function md5Hex(message: string) {
  const hashBuffer = await crypto.subtle.digest(
    "MD5",
    new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function pusherUpdatePing() {
  const urlPath = `/apps/${PUSHER_APP_ID}/events`;

  const requestBody = JSON.stringify({
    name: "update",
    channels: ["updates"],
    data: JSON.stringify({}),
  });

  // The query string must be sorted and lowercase, and the string-to-sign is
  // built from it *before* URL encoding.
  const queryParams = new URLSearchParams({
    auth_key: PUSHER_KEY,
    auth_timestamp: Math.floor(Date.now() / 1000).toString(),
    auth_version: "1.0",
    body_md5: await md5Hex(requestBody),
  });

  const authSignature = await hmacSha256Hex(
    PUSHER_SECRET,
    `POST\n${urlPath}\n${queryParams.toString()}`
  );
  queryParams.append("auth_signature", authSignature);

  const response = await fetch(
    `https://api-${PUSHER_CLUSTER}.pusher.com${urlPath}?${queryParams.toString()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": requestBody.length.toString(),
      },
      body: requestBody,
    }
  );

  if (!response.ok) {
    throw new Error(
      `Pusher API error: ${response.status} - ${await response.text()}`
    );
  }
}
