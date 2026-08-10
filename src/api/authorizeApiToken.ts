import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Bearer-token auth for the `/v1` CLI API.
 *
 * These routes are NOT gated by Clerk — `src/middleware.ts` lists `/v1` as a
 * public route, because emails-cli sends a token, not a session cookie. Remove
 * that exemption and every CLI call gets a 307 to /sign-in; remove this check
 * and the API is open. They are two halves of one decision.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function isAuthorizedApiRequest(request: Request): boolean {
  const { env } = getCloudflareContext();
  const header = request.headers.get("Authorization");

  if (!header?.startsWith("Bearer ") || !env.API_TOKEN) {
    return false;
  }

  return timingSafeEqual(header.slice("Bearer ".length), env.API_TOKEN);
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/** Wraps a handler so every `/v1` route authorises identically. */
export function withApiToken<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    if (!isAuthorizedApiRequest(request)) {
      return unauthorizedResponse();
    }

    try {
      return await handler(request, ...args);
    } catch (error) {
      console.error("v1 api error", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "internal error" },
        { status: 500 }
      );
    }
  };
}
