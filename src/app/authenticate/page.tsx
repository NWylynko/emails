"use client";

import { useClerk, useSignIn } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function clerkErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { longMessage, message } = error as {
      longMessage?: unknown;
      message?: unknown;
    };
    if (typeof longMessage === "string") return longMessage;
    if (typeof message === "string") return message;
  }
  return "Authentication failed.";
}

function AuthenticateInner() {
  const { signIn } = useSignIn();
  const clerk = useClerk();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ticketRedeemed = useRef(false);

  // Redeem the ticket. `signIn` is null until Clerk has loaded, and the ref keeps
  // the ticket from being redeemed twice — it is single-use, and the signal hands
  // back a new `signIn` identity on every update, which re-runs this effect.
  useEffect(() => {
    if (!signIn || ticketRedeemed.current) return;

    const token = searchParams.get("token");
    if (!token) {
      setError("No token provided.");
      return;
    }

    ticketRedeemed.current = true;

    // A ticket is a complete first factor, so redeeming it creates an active
    // session server-side in one call. Clerk JS does not adopt that session on
    // its own though: `Clerk.session` stays null until setActive runs, so the
    // client still looks signed out (and this page would sit on "Authenticating…"
    // forever) even though middleware would let the user through.
    //
    // Neither `signIn.status` nor `signIn.finalize()` can drive this. Redeeming
    // the ticket consumes the sign-in — `client.signIn` comes back with a null
    // status and no createdSessionId, and this captured `signIn` stays the
    // placeholder future it started as ("needs_identifier", no id). So finalize()
    // has nothing to activate and resolves without error, having done nothing.
    // The new session is reachable only as the client's last active session.
    signIn
      .ticket({ ticket: token })
      .then(({ error }) => {
        if (error) {
          setError(clerkErrorMessage(error));
          return;
        }

        const sessionId = clerk.client.lastActiveSessionId;

        if (!sessionId) {
          setError("Signed in, but no session was created.");
          return;
        }

        return clerk.setActive({
          session: sessionId,
          navigate: () => router.replace("/"),
        });
      })
      .catch((err) => setError(clerkErrorMessage(err)));
  }, [signIn]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-500">Authenticating…</p>
    </div>
  );
}

export default function AuthenticatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-500">Loading…</p>
        </div>
      }
    >
      <AuthenticateInner />
    </Suspense>
  );
}
