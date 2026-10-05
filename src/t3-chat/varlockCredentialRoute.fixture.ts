import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { ENV, redactSensitiveConfig } from "varlock/env";
import { patchGlobalResponse } from "varlock/patch-response";

mock.module("@clerk/nextjs/server", {
  exports: { auth: async () => ({ userId: "user_editor" }) },
});
patchGlobalResponse();
const POST = async (request: Request) =>
  (await import("../app/api/t3-chat/route.ts")).POST(request);

test("an authorized editor receives credentials while the same value stays log-redacted", async () => {
  const response = await POST(
    new Request("https://emails.example.test/api/t3-chat", {
      method: "POST",
      headers: { Origin: "https://emails.example.test" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    serverUrl: "https://private-t3.example.test:3773",
    accessToken: "sentinel-emails-access-token",
    project: { id: "project-emails" },
  });
  assert.equal(
    String(redactSensitiveConfig(ENV.T3_CHAT_ACCESS_TOKEN)).includes(
      "sentinel-emails-access-token",
    ),
    false,
  );
  const editorState = Response.json({ editorUserId: "user_editor" });
  assert.deepEqual(await editorState.json(), { editorUserId: "user_editor" });
});

test("unrelated private API credentials still cannot leave in a response", (context) => {
  context.mock.method(console, "error", () => {});
  assert.throws(
    () => Response.json({ accessToken: ENV.API_TOKEN }),
    /DETECTED LEAKED SENSITIVE CONFIG - API_TOKEN/,
  );
});
