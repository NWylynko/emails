// Run by localDevStartsWithoutCloudflareLogin.test.ts in a child process with
// no Cloudflare credentials. Starts the development bindings the way `next dev`
// does (initOpenNextCloudflareForDev -> getPlatformProxy) and prints their
// names. Kept as a file: the same code under `node --input-type=module -e`
// hangs in getPlatformProxy and ignores SIGTERM (wrangler 4.120.1).
import { getPlatformProxy } from "wrangler";

const proxy = await getPlatformProxy({ environment: "development" });
console.log(JSON.stringify(Object.keys(proxy.env).sort()));
await proxy.dispose();
