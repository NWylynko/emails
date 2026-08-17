import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { connection } from "next/server";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { getEmailsDb } from "@/database";
import { RefreshButton } from "@/components/RefreshButton";
import { EmailSearchBox } from "@/search/EmailSearchBox";
import { SearchSnippet } from "@/search/SearchSnippet";
import { searchEmails } from "@/search/searchEmails";

/** `?q=` and `?inbox=` arrive as string | string[] | undefined. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SearchPage(props: PageProps<"/search">) {
  await connection();

  const searchParams = await props.searchParams;
  const query = firstValue(searchParams.q)?.trim() ?? "";
  const inbox = firstValue(searchParams.inbox);

  // searchEmails already returns [] for a blank query, so this is only about
  // not showing "no results" before anything has been typed.
  const results = query === "" ? [] : await searchEmails(getEmailsDb(), { query, inbox });

  return (
    <div className="space-y-4">
      <header className="flex flex-row items-center justify-between gap-4">
        <Link
          href={inbox ? `/inbox/${encodeURIComponent(inbox)}` : "/"}
          className="text-gray-500 hover:text-gray-700"
          aria-label={inbox ? `Back to ${inbox}` : "Back to inboxes"}
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <EmailSearchBox defaultQuery={query} inbox={inbox} />
        <RefreshButton />
      </header>

      {query === "" ? (
        <p className="px-4 py-8 text-center text-sm text-gray-500">
          Search {inbox ? inbox : "every inbox"} by subject, sender or message body.
          Quote a &ldquo;exact phrase&rdquo;, or exclude a word with -term.
        </p>
      ) : results.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-500">
          Nothing matches <span className="font-medium">{query}</span>
          {inbox ? <> in {inbox}</> : null}.
        </p>
      ) : (
        <>
          <p className="px-4 text-xs text-gray-500">
            {results.length} {results.length === 1 ? "result" : "results"} for{" "}
            <span className="font-medium">{query}</span>
            {inbox ? <> in {inbox}</> : null}
          </p>
          <div className="border-t border-b border-zinc-300">
            {results.map((email, index) => (
              <Link key={email.emailId} href={`/email/${email.emailId}`}>
                <div
                  className={`flex flex-col gap-1 px-4 py-3 hover:bg-gray-100 ${
                    !email.viewed ? "bg-blue-50" : ""
                  } ${index !== results.length - 1 ? "border-b border-zinc-300" : ""}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center space-x-2">
                      {!email.viewed ? (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          New
                        </Badge>
                      ) : null}
                      <p className={`truncate ${!email.viewed ? "font-semibold" : "font-normal"}`}>
                        {email.subject}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-500">
                      {formatDistanceToNow(new Date(email.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                  <SearchSnippet snippet={email.snippet} />
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="truncate">{email.from}</span>
                    {/* Only useful when the search spans inboxes. */}
                    {inbox ? null : (
                      <>
                        <span aria-hidden>→</span>
                        <span className="truncate">{email.to}</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
