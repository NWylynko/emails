/**
 * `wrangler types` in one shot emits runtime globals AND the Env interface into
 * a single file. That file declares `Cloudflare.GlobalProps.mainModule` as
 * `typeof import("./worker")`, which drags `worker.ts` into the Next app's
 * TypeScript program no matter what `tsconfig.json`'s `exclude` says — and
 * `worker.ts` imports `./.open-next/worker.js`, which does not exist until
 * after a build. Result: a clean checkout can never typecheck.
 *
 * So generate the two halves separately and strip the offending block:
 *
 *   worker-runtime.d.ts  — Workers runtime globals (R2Bucket, Hyperdrive, Ai …)
 *   cloudflare-env.d.ts  — the CloudflareEnv interface, minus GlobalProps
 *
 * Run via `pnpm cf-typegen` after changing wrangler.jsonc or .dev.vars.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ENV_TYPES = "cloudflare-env.d.ts";
const RUNTIME_TYPES = "worker-runtime.d.ts";

function wranglerTypes(args) {
  execFileSync("wrangler", ["types", "--env-interface", "CloudflareEnv", ...args], {
    stdio: "inherit",
  });
}

wranglerTypes(["--include-runtime=false", ENV_TYPES]);
wranglerTypes(["--include-env=false", RUNTIME_TYPES]);

const source = readFileSync(ENV_TYPES, "utf8");
const withoutGlobalProps = source.replace(
  /\tinterface GlobalProps \{\n\t\tmainModule: typeof import\("[^"]*"\);\n\t\}\n/,
  ""
);

if (withoutGlobalProps === source) {
  console.warn(
    `generateCloudflareTypes: GlobalProps block not found in ${ENV_TYPES} — ` +
      `wrangler's output shape may have changed. Check that worker.ts is still ` +
      `excluded from the app's TypeScript program.`
  );
}

writeFileSync(ENV_TYPES, withoutGlobalProps);
console.log(`generateCloudflareTypes: wrote ${ENV_TYPES} and ${RUNTIME_TYPES}`);
