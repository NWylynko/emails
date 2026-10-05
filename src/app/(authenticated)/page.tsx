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
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/inbox/${encodeURIComponent(inbox.to)}`}
                  className="min-w-0 break-all font-medium hover:underline"
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
              <p className="truncate font-semibold">
                {inbox.subject || "(no subject)"}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="min-w-0 break-all">{inbox.from}</span>
                <time
                  dateTime={inbox.timestamp.toISOString()}
                  title={inbox.timestamp.toLocaleString()}
                >
                  {formatDistanceToNow(inbox.timestamp, { addSuffix: true })}
                </time>
              </div>
              <p className="line-clamp-2 break-words text-sm text-gray-600">
                {inbox.preview}
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="self-start sm:shrink-0 sm:self-center"
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
