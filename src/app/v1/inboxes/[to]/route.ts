import { withApiToken } from "@/api/authorizeApiToken";
import { setInboxSilent } from "@/inbox/inboxQueries";

/**
 * Only `silent` is settable here. `receiver` is deliberately website-only: the
 * dropdown there restricts it to addresses that have already mailed the inbox,
 * and forwarding to an arbitrary address is not something a token should do.
 */
export const PUT = withApiToken(
  async (request: Request, context: { params: Promise<{ to: string }> }) => {
    const { to } = await context.params;

    let body: { silent?: boolean };
    try {
      body = (await request.json()) as { silent?: boolean };
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    if (typeof body.silent !== "boolean") {
      return Response.json(
        { error: "silent boolean required" },
        { status: 400 }
      );
    }

    await setInboxSilent(to, body.silent);

    return Response.json({ inbox: to, silent: body.silent });
  }
);
