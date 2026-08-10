import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getEmailsDb } from "@/database";
import { emails } from "@/database/schema";
import * as driz from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PropsWithChildren } from "react";
import { PageTabs } from "./PageTabs";

function getEmailHeader(id: number) {
  return getEmailsDb()
    .select({
      to: emails.to,
      from: emails.from,
      subject: emails.subject,
      viewed: emails.viewed,
      timestamp: emails.timestamp,
    })
    .from(emails)
    .where(driz.eq(emails.emailId, id));
}

export default async function EmailLayout(props: LayoutProps<"/email/[id]">) {
  await connection();

  const { id: id_string } = await props.params;

  const id = Number(id_string);

  const [email] = await getEmailHeader(id);

  if (email === undefined) {
    notFound();
  }

  if (email.viewed === false) {
    await getEmailsDb()
      .update(emails)
      .set({
        viewed: true,
      })
      .where(driz.eq(emails.emailId, id));
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-row items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/inbox/${encodeURIComponent(email.to)}`}>
            <ArrowLeftIcon className="h-6 w-6 text-gray-500 hover:text-gray-700" />
          </Link>
          <h1 className="text-2xl font-bold">{email.subject}</h1>
        </div>
        <PageTabs baseUrl={`/email/${id}`}>
          <TabsList className="flex flex-row gap-1">
            <TabsTrigger className="cursor-pointer" value="/">
              Text
            </TabsTrigger>
            <TabsTrigger className="cursor-pointer" value="/html">
              HTML
            </TabsTrigger>
            <TabsTrigger className="cursor-pointer" value="/ai">
              AI
            </TabsTrigger>
          </TabsList>
        </PageTabs>
      </header>
      <div className="text-sm text-gray-500 mb-4">
        <p>From: {email.from}</p>
        <p>Date: {new Date(email.timestamp).toLocaleString()}</p>
      </div>
      {props.children}
    </div>
  );
}
