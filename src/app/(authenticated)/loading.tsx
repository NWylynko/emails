import { Button } from "@/components/ui/button";
import { CogIcon, RefreshCwIcon } from "lucide-react";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading inboxes" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="shrink-0 text-2xl font-bold">Inboxes</h1>
        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <div className="h-[38px] animate-pulse rounded-md bg-gray-200" />
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Button variant="outline" size="icon" disabled>
            <CogIcon />
          </Button>
          <Button variant="outline" size="icon" disabled>
            <RefreshCwIcon />
          </Button>
        </div>
      </header>
      <ul className="animate-pulse divide-y divide-zinc-300 border-y border-zinc-300">
        {Array.from({ length: 5 }, (_, index) => (
          <li
            key={index}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="h-6 w-40 max-w-full rounded bg-gray-200" />
                <div className="h-5 w-16 rounded bg-gray-200" />
                <div className="h-4 w-12 rounded bg-gray-200" />
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-5 min-w-0 flex-1 rounded bg-gray-200 sm:max-w-64" />
                <div className="h-4 w-28 shrink-0 rounded bg-gray-200 sm:ml-auto" />
              </div>
            </div>
            <div className="h-8 w-32 self-start rounded-md bg-gray-200 sm:shrink-0 sm:self-center" />
          </li>
        ))}
      </ul>
    </div>
  );
}
