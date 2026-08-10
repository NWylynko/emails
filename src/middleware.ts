import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/authenticate(.*)"]);

const allowedUserIds = Object.freeze([
  "user_2t6gJSoy2au2IcsGdNGFt32ZyQL",
  "user_2t6im88Xhr78qDRQ4IKOZ1Ee146",
  "user_3BaG0aVrzwkbCojh27ulpqFDleg"
]);

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

  if (allowedUserIds.includes(userId) === false) {
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
