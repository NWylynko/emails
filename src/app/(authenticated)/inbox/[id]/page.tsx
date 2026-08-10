import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CogIcon } from "lucide-react";
import {
  getInboxSettings,
  listInboxEmails,
  listInboxSenders,
  setInboxReceiver,
  setInboxSilent,
} from "@/inbox/inboxQueries";
import { formatDistanceToNow } from "date-fns";
import { connection } from "next/server";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { revalidatePath } from "next/cache";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default async function InboxPage(props: PageProps<"/inbox/[id]">) {
  await connection();
  const { id } = await props.params;

  const inboxEmail = decodeURIComponent(id);

  const results = await listInboxEmails(inboxEmail);
  const inbox = await getInboxSettings(inboxEmail);

  const distinctSenders = await listInboxSenders(inboxEmail);

  return (
    <div className="space-y-4">
      <header className="flex flex-row items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-2xl font-bold">Inbox {inboxEmail}</h1>
        </div>
        <div className="flex items-center gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <CogIcon />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>{inboxEmail} Settings</DialogTitle>
              <div className="flex items-center space-x-2">
                <Switch
                  id="silent"
                  checked={inbox?.silent ?? false}
                  onCheckedChange={async (silent) => {
                    "use server";

                    await setInboxSilent(inboxEmail, silent);

                    revalidatePath(`/inbox/${id}`);
                  }}
                />
                <Label htmlFor="silent">Silent Notifications</Label>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="receiver">Receiver</Label>
                <Select
                  defaultValue={inbox?.receiver ?? undefined}
                  onValueChange={async (value) => {
                    "use server";

                    await setInboxReceiver(inboxEmail, value);

                    revalidatePath(`/inbox/${id}`);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a sender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Senders</SelectLabel>
                      {distinctSenders.map((sender) => (
                        <SelectItem key={sender.from} value={sender.from}>
                          {sender.from}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </DialogContent>
          </Dialog>
          <RefreshButton />
        </div>
      </header>
      <div className="border-t border-b border-zinc-300">
        {results.map((email, index) => (
          <Link key={email.emailId} href={`/email/${email.emailId}`}>
            <div
              className={`flex items-center justify-between py-3 px-4 hover:bg-gray-100 ${
                !email.viewed ? "bg-blue-50" : ""
              } ${
                index !== results.length - 1 ? "border-b border-zinc-300" : ""
              }`}
            >
              <div className="flex items-center space-x-2">
                {!email.viewed ? (
                  <Badge
                    variant="secondary"
                    className="bg-blue-100 text-blue-800"
                  >
                    New
                  </Badge>
                ) : null}
                <p
                  className={`${
                    !email.viewed ? "font-semibold" : "font-normal"
                  }`}
                >
                  {email.subject}
                </p>
              </div>
              <div className="flex items-center space-x-4 text-xs text-gray-500">
                <span>{new Date(email.timestamp).toLocaleString()}</span>
                <span>
                  (
                  {formatDistanceToNow(new Date(email.timestamp), {
                    addSuffix: true,
                  })}
                  )
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
