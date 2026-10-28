import { UpdatesProvider } from "@/providers/UpdatesProvider";
import { connection } from "next/server";
import { ENV } from "varlock/env";
import { getEmailsEditorUserId } from "@/t3-chat/authorizeEmailsEditor";
import { EmailsT3ChatWidget } from "@/t3-chat/EmailsT3ChatWidget";

export default async function AuthenticatedLayout(props: LayoutProps<"/">) {
  // Reading the Worker env means this cannot be prerendered — `connection()`
  // marks it dynamic, the same way every page under this layout does. Without
  // it `getCloudflareContext()` throws during the static export pass.
  await connection();
  const editorUserId = await getEmailsEditorUserId();

  return (
    <UpdatesProvider
      pusherKey={ENV.PUSHER_KEY}
      pusherCluster={ENV.PUSHER_CLUSTER}
    >
      {props.children}
      {editorUserId && <EmailsT3ChatWidget editorUserId={editorUserId} />}
    </UpdatesProvider>
  );
}
