import { getCloudflareContext } from "@opennextjs/cloudflare";
import { connection } from "next/server";
import { UpdatesProvider } from "@/providers/UpdatesProvider";

export default async function AuthenticatedLayout(props: LayoutProps<"/">) {
  // Reading the Worker env means this cannot be prerendered — `connection()`
  // marks it dynamic, the same way every page under this layout does. Without
  // it `getCloudflareContext()` throws during the static export pass.
  await connection();

  const { env } = getCloudflareContext();

  return (
    <UpdatesProvider
      pusherKey={env.PUSHER_KEY}
      pusherCluster={env.PUSHER_CLUSTER}
    >
      {props.children}
    </UpdatesProvider>
  );
}
