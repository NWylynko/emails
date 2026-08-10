import { getEmailsDb } from "@/database";
import { emails } from "@/database/schema";
import * as driz from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { linkifyText } from "./linkifyText";
import { Attachments } from "./Attachments";
import { Suspense } from "react";

function getEmailBody(id: number) {
  return getEmailsDb()
    .select({
      emailId: emails.emailId,
      body: emails.body,
    })
    .from(emails)
    .where(driz.eq(emails.emailId, id));
}

export default async function EmailPage(props: PageProps<"/email/[id]">) {
  await connection();

  const { id } = await props.params;

  const [email] = await getEmailBody(Number(id));

  if (email === undefined) {
    notFound();
  }

  return (
    <>
      <div className="whitespace-pre-wrap">
        {email.body.split("\n").map((line, index) => (
          <p key={index}>{linkifyText(line)}</p>
        ))}
      </div>
      <Suspense fallback={<div>Loading attachments...</div>}>
        <Attachments emailId={email.emailId} />
      </Suspense>
    </>
  );
}
