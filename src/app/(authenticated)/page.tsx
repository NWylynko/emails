import { GenerateBotToken } from "@/components/GenerateBotToken";
import { PushNotifications } from "@/components/PushNotifications";
import { RefreshButton } from "@/components/RefreshButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { listInboxesWithCounts } from "@/inbox/inboxQueries";
import { SignOutButton } from "@clerk/nextjs";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { CogIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { ENV } from "varlock/env";

export default async function Home(props: PageProps<"/">) {
  await connection();

  const inboxes = await listInboxesWithCounts();

  return (
    <div className="space-y-4">
      <header className="flex flex-row items-center justify-between">
        <h1 className="text-2xl font-bold">Inboxes</h1>
        <div className="flex items-center gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <CogIcon />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Settings</DialogTitle>
              <SignOutButton>
                <Button>Sign out</Button>
              </SignOutButton>
              <PushNotifications instanceId={ENV.BEAMS_INSTANCE_ID} />
              <GenerateBotToken />
            </DialogContent>
          </Dialog>
          <RefreshButton />
        </div>
      </header>
      <div className="border-t border-b border-zinc-300">
        {inboxes.map((inbox, index) => (
          <Link
            key={inbox.to}
            href={`/inbox/${encodeURIComponent(inbox.to)}`}
          >
            <div
              className={`flex items-center justify-between py-3 px-4 hover:bg-gray-100 ${
                index !== inboxes.length - 1 ? "border-b border-zinc-300" : ""
              }`}
            >
              <div className="flex items-center space-x-4">
                <span className="font-medium">{inbox.to}</span>
                {inbox.unread > 0 ? (
                  <Badge
                    variant="secondary"
                    className="bg-blue-100 text-blue-800"
                  >
                    {inbox.unread}
                  </Badge>
                ) : (
                  <span className="text-sm text-gray-500">
                    {inbox.total}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
