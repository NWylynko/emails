import { UpdatesProvider } from "@/providers/UpdatesProvider";
import { connection } from "next/server";
import { ENV } from "varlock/env";

export default async function AuthenticatedLayout(props: LayoutProps<"/">) {
  // Reading the Worker env means this cannot be prerendered — `connection()`
  // marks it dynamic, the same way every page under this layout does. Without
  // it `getCloudflareContext()` throws during the static export pass.
  await connection();

  return (
    <UpdatesProvider
      pusherKey={ENV.PUSHER_KEY}
      pusherCluster={ENV.PUSHER_CLUSTER}
    >
      {props.children}
    </UpdatesProvider>
  );
}
