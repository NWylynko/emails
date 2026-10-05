import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

let clerkUserId: string | null = "user_editor";
const configuration = {
  T3_CHAT_EDITOR_USER_IDS: "user_editor",
  T3_CHAT_SERVER_URL: "https://private-t3.example.test:3773",
  T3_CHAT_ACCESS_TOKEN: "sentinel-emails-access-token",
  T3_CHAT_PROJECT_ID: "project-emails",
};
mock.module("@clerk/nextjs/server", {
  exports: { auth: async () => ({ userId: clerkUserId }) },
});
mock.module("varlock/env", { exports: { ENV: configuration } });
const POST = async (request: Request) =>
  (await import("../app/api/t3-chat/route.ts")).POST(request);
const postRequest = () =>
  new Request("https://emails.example.test/api/t3-chat", {
    method: "POST",
    headers: { Origin: "https://emails.example.test" },
  });

beforeEach(() => {
  clerkUserId = "user_editor";
  configuration.T3_CHAT_EDITOR_USER_IDS = "user_editor";
  configuration.T3_CHAT_ACCESS_TOKEN = "sentinel-emails-access-token";
});

test("an explicitly configured Clerk editor can access the configured project", async () => {
  const response = await POST(postRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    serverUrl: "https://private-t3.example.test:3773",
    accessToken: "sentinel-emails-access-token",
    project: { id: "project-emails" },
  });
});

test("an incomplete editor connection returns a private error and safe setup diagnostics", async (context) => {
  configuration.T3_CHAT_ACCESS_TOKEN = "";
  const log = context.mock.method(console, "error", () => {});
  const response = await POST(postRequest());
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const body = await response.text();
  assert.equal(body.includes("sentinel-emails-access-token"), false);
  assert.equal(body.includes("private-t3.example.test"), false);
  assert.equal(
    log.mock.calls.map((call) => call.arguments.join(" ")).join("\n"),
    "T3 chat configuration is incomplete. Check T3_CHAT_SERVER_URL, T3_CHAT_ACCESS_TOKEN, and T3_CHAT_PROJECT_ID.",
  );
});

test("signed-out users and ordinary website users receive a JSON denial without credentials", async () => {
  for (const userId of [null, "user_viewer", "user_editor_extra"]) {
    clerkUserId = userId;
    const response = await POST(postRequest());
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Location"), null);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), {
      error: {
        code: "forbidden",
        message: "You are not authorized to use this chat.",
      },
    });
  }
});

test("empty editor configuration disables access and revocation takes effect on the next request", async () => {
  configuration.T3_CHAT_EDITOR_USER_IDS = "";
  assert.equal((await POST(postRequest())).status, 403);
  configuration.T3_CHAT_EDITOR_USER_IDS = " user_editor, user_second ";
  assert.equal((await POST(postRequest())).status, 200);
  configuration.T3_CHAT_EDITOR_USER_IDS = "user_second";
  const response = await POST(postRequest());
  assert.equal(response.status, 403);
  assert.equal(
    (await response.text()).includes("sentinel-emails-access-token"),
    false,
  );
});
