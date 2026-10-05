import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("emails credential route enforces the Clerk editor policy", () => {
  const testEnvironment: NodeJS.ProcessEnv = { ...process.env };
  delete testEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--conditions=react-server",
      "--disable-warning=ExperimentalWarning",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--test",
      fileURLToPath(new URL("./credentialRoute.fixture.ts", import.meta.url)),
    ],
    { encoding: "utf8", env: testEnvironment },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("authorized credential delivery works with real varlock protection enabled", () => {
  const testEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    T3_CHAT_EDITOR_USER_IDS: "user_editor",
    T3_CHAT_SERVER_URL: "https://private-t3.example.test:3773",
    T3_CHAT_ACCESS_TOKEN: "sentinel-emails-access-token",
    T3_CHAT_PROJECT_ID: "project-emails",
    API_TOKEN: "sentinel-unrelated-api-token",
  };
  delete testEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../../node_modules/varlock/bin/cli.js", import.meta.url),
      ),
      "run",
      "--filter=T3_CHAT_*,API_TOKEN",
      "--skip-cache",
      "--",
      process.execPath,
      "--experimental-test-module-mocks",
      "--conditions=react-server",
      "--disable-warning=ExperimentalWarning",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--test",
      fileURLToPath(
        new URL("./varlockCredentialRoute.fixture.ts", import.meta.url),
      ),
    ],
    {
      encoding: "utf8",
      env: testEnvironment,
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
