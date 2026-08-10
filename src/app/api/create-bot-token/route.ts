import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const token = await client.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 60 * 60 * 24, // 24 hours
  });

  // Taken from the request rather than a NEXT_PUBLIC_APP_URL variable, which was
  // never actually set — so this produced a relative "/authenticate?token=..."
  // that could not be pasted into another browser. The origin is already known
  // here and is correct in every environment without configuration.
  const url = new URL(
    `/authenticate?token=${token.token}`,
    request.url
  ).toString();

  return NextResponse.json({ token: token.token, url });
}
