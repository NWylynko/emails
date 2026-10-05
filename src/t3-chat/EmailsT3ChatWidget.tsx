"use client";

import { useUser } from "@clerk/nextjs";
import { T3ChatWidget } from "@wylynko/t3-chat-widget/react";

export function EmailsT3ChatWidget({ editorUserId }: { editorUserId: string }) {
  const { isLoaded, user } = useUser();
  if (!isLoaded || user?.id !== editorUserId) return null;
  return <T3ChatWidget key={user.id} endpoint="/api/t3-chat" />;
}
