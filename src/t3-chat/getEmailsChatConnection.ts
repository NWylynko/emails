import "server-only";
import { ENV } from "varlock/env";

export function getEmailsChatConnection() {
  const serverUrl = ENV.T3_CHAT_SERVER_URL;
  const accessToken = ENV.T3_CHAT_ACCESS_TOKEN;
  const projectId = ENV.T3_CHAT_PROJECT_ID;
  if (!serverUrl || !accessToken || !projectId) {
    console.error(
      "T3 chat configuration is incomplete. Check T3_CHAT_SERVER_URL, T3_CHAT_ACCESS_TOKEN, and T3_CHAT_PROJECT_ID.",
    );
    throw new Error("T3 chat configuration is incomplete.");
  }
  return { serverUrl, accessToken, project: { id: projectId } };
}
