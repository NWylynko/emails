/**
 * Fire-and-forget ping on the "updates" channel. The website subscribes
 * (src/providers/UpdatesProvider.tsx) and lights up the refresh button when a
 * new message lands, without polling.
 *
 * Signing is done by hand because the official pusher SDK is a Node library.
 *
 * Credentials come from the Worker `env` because this runs inside the `email()`
 * handler, where varlock's ENV is never initialized (that happens on OpenNext's
 * fetch path only).
 */

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

export async function pusherUpdatePing(env: CloudflareEnv) {
  const urlPath = `/apps/${env.PUSHER_APP_ID}/events`;

  const requestBody = JSON.stringify({
    name: "update",
    channels: ["updates"],
    data: JSON.stringify({}),
  });

  // The query string must be sorted and lowercase, and the string-to-sign is
  // built from it *before* URL encoding.
  const queryParams = new URLSearchParams({
    auth_key: env.PUSHER_KEY,
    auth_timestamp: Math.floor(Date.now() / 1000).toString(),
    auth_version: "1.0",
    body_md5: await md5Hex(requestBody),
  });

  const authSignature = await hmacSha256Hex(
    env.PUSHER_SECRET,
    `POST\n${urlPath}\n${queryParams.toString()}`
  );
  queryParams.append("auth_signature", authSignature);

  const response = await fetch(
    `https://api-${env.PUSHER_CLUSTER}.pusher.com${urlPath}?${queryParams.toString()}`,
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
