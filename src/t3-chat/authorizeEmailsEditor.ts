import "server-only";
import { auth } from "@clerk/nextjs/server";
import { ENV } from "varlock/env";

export async function getEmailsEditorUserId() {
  const { userId } = await auth();
  const editors = ENV.T3_CHAT_EDITOR_USER_IDS?.split(",").map((id) =>
    id.trim(),
  );
  return userId && editors?.includes(userId) ? userId : null;
}
export async function authorizeEmailsEditor() {
  return (await getEmailsEditorUserId()) !== null;
}
