import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const token = await client.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 60 * 60 * 24, // 24 hours
  });

  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/authenticate?token=${token.token}`;

  return NextResponse.json({ token: token.token, url });
}
