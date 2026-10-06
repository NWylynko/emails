import { GenerateBotToken } from "@/components/GenerateBotToken";
import { PushNotifications } from "@/components/PushNotifications";
import { RefreshButton } from "@/components/RefreshButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { listInboxesWithLatestEmail } from "@/inbox/inboxQueries";
import { EmailSearchBox } from "@/search/EmailSearchBox";
import { SignOutButton } from "@clerk/nextjs";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { ArrowUpRightIcon, CogIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { connection } from "next/server";
import { ENV } from "varlock/env";

export default async function Home(props: PageProps<"/">) {
  await connection();

  const inboxes = await listInboxesWithLatestEmail();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="shrink-0 text-2xl font-bold">Inboxes</h1>
        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <EmailSearchBox />
        </div>
        <div className="flex shrink-0 items-center gap-4">
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
      <ul className="divide-y divide-zinc-300 border-y border-zinc-300">
        {inboxes.map((inbox) => (
          <li
            key={inbox.to}
            className="relative flex flex-col gap-2 px-4 py-3 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/inbox/${encodeURIComponent(inbox.to)}`}
                  className="min-w-0 max-w-full truncate font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-zinc-500"
                >
                  {inbox.to}
                </Link>
                {inbox.unread > 0 ? (
                  <Badge
                    variant="secondary"
                    className="shrink-0 bg-blue-100 text-blue-800"
                  >
                    {inbox.unread} unread
                  </Badge>
                ) : null}
                <span className="text-xs text-gray-500">
                  {inbox.total} {inbox.total === 1 ? "email" : "emails"}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-sm text-gray-600">
                  {inbox.subject || "(no subject)"}
                </p>
                <time
                  className="shrink-0 text-xs text-gray-500"
                  dateTime={inbox.timestamp.toISOString()}
                  title={inbox.timestamp.toLocaleString()}
                >
                  {formatDistanceToNow(inbox.timestamp, { addSuffix: true })}
                </time>
              </div>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="relative z-10 self-start sm:shrink-0 sm:self-center"
            >
              <Link href={`/email/${inbox.emailId}`} prefetch={false}>
                Open latest
                <ArrowUpRightIcon aria-hidden="true" />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
