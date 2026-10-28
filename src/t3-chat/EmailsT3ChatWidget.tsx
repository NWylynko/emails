"use client";

import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";

const T3ChatWidget = dynamic(() => import("./LazyT3ChatWidget"), {
  ssr: false,
});

export function EmailsT3ChatWidget({ editorUserId }: { editorUserId: string }) {
  const { isLoaded, user } = useUser();
  if (!isLoaded || user?.id !== editorUserId) return null;
  return (
    <T3ChatWidget key={user.id} sessionKey={user.id} endpoint="/api/t3-chat" />
  );
}
