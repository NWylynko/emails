import { createT3ChatSessionHandler } from "@wylynko/t3-chat-widget/server";
import { authorizeEmailsEditor } from "../../../t3-chat/authorizeEmailsEditor.ts";
import { getEmailsChatConnection } from "../../../t3-chat/getEmailsChatConnection.ts";

export const POST = createT3ChatSessionHandler({
  authorize: authorizeEmailsEditor,
  getConnection: getEmailsChatConnection,
});
