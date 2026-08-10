import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getEmailsDb } from "@/database";
import { emails } from "@/database/schema";
import * as driz from "drizzle-orm";
import { connection } from "next/server";
import { RefreshButton } from "@/components/RefreshButton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { CogIcon } from "lucide-react";
import { PushNotifications } from "@/components/PushNotifications";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@clerk/nextjs";
import { GenerateBotToken } from "@/components/GenerateBotToken";

function listInboxesWithCounts() {
  const latestUnreadEmail = driz.max(emails.timestamp).as("latestUnreadEmail");

  return getEmailsDb()
    .select({
      name: emails.to,
      totalEmails: driz.count(emails.to),
      unreadEmails: driz
        .sum(driz.sql`CASE WHEN ${emails.viewed} = false THEN 1 ELSE 0 END`)
        .as("unreadEmails"),
      latestUnreadEmail,
    })
    .from(emails)
    .groupBy(emails.to)
    .orderBy(driz.desc(latestUnreadEmail));
}

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
              <PushNotifications />
              <GenerateBotToken />
            </DialogContent>
          </Dialog>
          <RefreshButton />
        </div>
      </header>
      <div className="border-t border-b border-zinc-300">
        {inboxes.map((inbox, index) => (
          <Link
            key={inbox.name}
            href={`/inbox/${encodeURIComponent(inbox.name)}`}
          >
            <div
              className={`flex items-center justify-between py-3 px-4 hover:bg-gray-100 ${
                index !== inboxes.length - 1 ? "border-b border-zinc-300" : ""
              }`}
            >
              <div className="flex items-center space-x-4">
                <span className="font-medium">{inbox.name}</span>
                {(inbox.unreadEmails ? Number(inbox.unreadEmails) : 0) > 0 ? (
                  <Badge
                    variant="secondary"
                    className="bg-blue-100 text-blue-800"
                  >
                    {inbox.unreadEmails}
                  </Badge>
                ) : (
                  <span className="text-sm text-gray-500">
                    {inbox.totalEmails}
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
