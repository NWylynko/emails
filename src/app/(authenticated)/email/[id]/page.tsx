import { readEmailBody } from "@/email/emailQueries";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { linkifyText } from "./linkifyText";
import { Attachments } from "./Attachments";
import { Suspense } from "react";

export default async function EmailPage(props: PageProps<"/email/[id]">) {
  await connection();

  const { id } = await props.params;

  const body = await readEmailBody(Number(id));

  if (body === null) {
    notFound();
  }

  return (
    <>
      <div className="whitespace-pre-wrap">
        {body.split("\n").map((line, index) => (
          <p key={index}>{linkifyText(line)}</p>
        ))}
      </div>
      <Suspense fallback={<div>Loading attachments...</div>}>
        <Attachments emailId={Number(id)} />
      </Suspense>
    </>
  );
}
