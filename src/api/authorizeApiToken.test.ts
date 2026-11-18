import assert from "node:assert/strict";
import { test } from "node:test";

// varlock's ENV proxy refuses to be read until a resolved env exists. Supply one
// directly so this test needs neither Infisical nor secrets.
process.env.__VARLOCK_ENV = JSON.stringify({
  sources: [],
  settings: {},
  config: { API_TOKEN: { value: "test-token", isSensitive: false } },
});

test("a throwing handler returns a generic 500 and logs the full error", async () => {
  const secret = 'relation "inboxes" does not exist at db.internal:5432';
  const thrown = new Error(secret);
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  try {
    const { withApiToken } = await import("./authorizeApiToken.ts");
    const handler = withApiToken(async () => {
      throw thrown;
    });
    const response = await handler(
      new Request("http://localhost/v1/inboxes", {
        headers: { Authorization: "Bearer test-token" },
      })
    );
    const text = await response.text();

    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(text), { error: "internal error" });
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes("inboxes"));
    assert.ok(logged.some((args) => args.includes(thrown)));
  } finally {
    console.error = original;
  }
});
