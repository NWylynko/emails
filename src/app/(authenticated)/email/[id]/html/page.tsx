import { db } from "@/database";
import { emails } from "@/database/schema";
import * as driz from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { emailHtmlToMarkdown } from "@/email/emailHtmlToMarkdown";

const emailQuery = db
  .select({
    html: emails.html,
  })
  .from(emails)
  .where(driz.eq(emails.emailId, driz.sql.placeholder("id")))
  .prepare("emailQueryWithHtml");

export default async function EmailPage(props: PageProps<"/email/[id]/html">) {
  await connection();

  const { id } = await props.params;

  const [email] = await emailQuery.execute({ id });

  if (email === undefined) {
    notFound();
  }

  if (email.html === null) {
    return <div>No HTML body</div>;
  }

  const markdown = await emailHtmlToMarkdown(email.html);

  return (
    <ReactMarkdown
      children={markdown}
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ node, ...props }) => <h1 className="text-3xl" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-2xl" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-2xl" {...props} />,
        h4: ({ node, ...props }) => <h4 className="text-xl" {...props} />,
        h5: ({ node, ...props }) => <h5 className="text-lg" {...props} />,
        h6: ({ node, ...props }) => <h6 className="text-base" {...props} />,
        p: ({ node, ...props }) => <p className="text-base mb-4" {...props} />,
        a: ({ node, ...props }) => (
          <a className="underline text-blue-400" {...props} />
        ),
        ul: ({ node, ...props }) => <ul className="list-disc" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal" {...props} />,
        li: ({ node, ...props }) => (
          <li className="ml-8 text-base" {...props} />
        ),
        blockquote: ({ node, ...props }) => (
          <blockquote className="mx-auto" {...props} />
        ),
        pre: ({ node, ...props }) => <pre className="text-sm" {...props} />,
        code: ({ node, ...props }) => <code className="text-sm" {...props} />,
        hr: ({ node, ...props }) => (
          <hr className="border-gray-300" {...props} />
        ),
        table: ({ node, ...props }) => (
          <table className="table-auto" {...props} />
        ),
        thead: ({ node, ...props }) => (
          <thead className="border-b" {...props} />
        ),
        tbody: ({ node, ...props }) => <tbody {...props} />,
        tr: ({ node, ...props }) => <tr {...props} />,
        td: ({ node, ...props }) => <td className="border" {...props} />,
        th: ({ node, ...props }) => <th className="border" {...props} />,
        em: ({ node, ...props }) => <em className="italic" {...props} />,
        strong: ({ node, ...props }) => (
          <strong className="font-bold" {...props} />
        ),
        del: ({ node, ...props }) => (
          <del className="line-through" {...props} />
        ),
        img: ({ node, ...props }) => (
          <img
            className="max-w-full max-h-[300px] mx-auto"
            {...props}
            alt={props.alt}
          />
        ),
        iframe: () => <></>,
        script: () => <></>,
      }}
    />
  );
}
