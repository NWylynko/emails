import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ENV } from "varlock/env";
import { isUserAllowed, parseAllowedUserIds } from "./auth/allowlist";

/**
 * `/v1` is public *to Clerk* only — it carries its own Bearer-token check in
 * `src/api/authorizeApiToken.ts`. emails-cli sends a token, not a session
 * cookie, so leaving it behind the Clerk gate turns every CLI call into a 307
 * to /sign-in.
 */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/authenticate(.*)",
  "/v1(.*)",
]);

/**
 * Clerk user IDs allowed in, from ALLOWED_USER_IDS (comma-separated). Empty or
 * unset means nobody gets in — it never fails open. Read per request so the
 * value is resolved on the fetch path, where varlock's ENV is initialised.
 */
function getAllowedUserIds(): string[] {
  return parseAllowedUserIds(ENV.ALLOWED_USER_IDS);
}

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) {
    return;
  }

  const { userId } = await auth();

  if (userId === null) {
    return NextResponse.redirect(
      new URL("/sign-in", request.nextUrl).toString()
    );
  }

  if (isUserAllowed(userId, getAllowedUserIds()) === false) {
    return NextResponse.redirect(
      new URL("/sign-in", request.nextUrl).toString()
    );
  }

  return;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
