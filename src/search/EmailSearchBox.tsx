import { SearchIcon } from "lucide-react";

/**
 * The search input.
 *
 * A plain GET form, deliberately: it needs no client JavaScript, the results
 * page is a server component reading `searchParams`, and every search ends up
 * with a shareable, reloadable URL. Submitting navigates to
 * `/search?q=...` (plus `&inbox=...` when searching from inside one inbox).
 */
export function EmailSearchBox({
  defaultQuery = "",
  inbox,
}: {
  defaultQuery?: string;
  /** When set, the search is scoped to this inbox rather than all mail. */
  inbox?: string;
}) {
  return (
    <form action="/search" method="get" className="relative flex-1">
      {inbox ? <input type="hidden" name="inbox" value={inbox} /> : null}
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        name="q"
        defaultValue={defaultQuery}
        placeholder={inbox ? `Search ${inbox}` : "Search all mail"}
        aria-label={inbox ? `Search ${inbox}` : "Search all mail"}
        className="w-full rounded-md border border-zinc-300 bg-white py-2 pr-3 pl-9 text-sm placeholder:text-gray-400 focus:border-zinc-500 focus:outline-none dark:bg-zinc-900"
      />
    </form>
  );
}
