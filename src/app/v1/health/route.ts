import { withApiToken } from "@/api/authorizeApiToken";

export const GET = withApiToken(async () => Response.json({ ok: true }));
