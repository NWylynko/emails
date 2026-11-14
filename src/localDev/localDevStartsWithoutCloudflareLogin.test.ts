import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Coding agents (and fresh machines) run `pnpm dev` with an Infisical login and
// nothing else. `next dev` starts the wrangler bindings through
// initOpenNextCloudflareForDev -> getPlatformProxy, and any binding that
// reaches Cloudflare (e.g. `"ai": { "remote": true }`) makes that fail with
// "it's necessary to set a CLOUDFLARE_API_TOKEN". This starts the same proxy
// in a child process with no Cloudflare credentials and an empty HOME, so a
// `wrangler login` on the developer's machine cannot hide a regression.
test("the development bindings start without a Cloudflare login", () => {
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: mkdtempSync(join(tmpdir(), "emails-no-cloudflare-home-")),
    XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "emails-no-cloudflare-xdg-")),
    CI: "1",
    // Miniflare only needs a syntactically valid string to build the
    // Hyperdrive binding; nothing connects to it here.
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
      "postgresql://probe:probe@localhost:5432/probe",
  };

  let output: string;
  try {
    output = execFileSync(
      process.execPath,
      [join(import.meta.dirname, "startDevelopmentBindingsProbe.mjs")],
      // varlock types every app variable as required on ProcessEnv; leaving
      // them out is the point here.
      {
        env: env as NodeJS.ProcessEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 90_000,
        killSignal: "SIGKILL",
      },
    );
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    assert.fail(
      `getPlatformProxy failed without a Cloudflare login:\n${stderr}\n${stdout}`,
    );
  }

  const bindings = JSON.parse(output.trim().split("\n").at(-1)!);
  assert.deepEqual(bindings, ["ASSETS", "ATTACHMENTS", "HYPERDRIVE"]);
});
