import { RefreshButton } from "@/components/RefreshButton"
import { Button } from "@/components/ui/button"
import { CogIcon } from "lucide-react"

export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <header className="flex flex-row items-center justify-between">
        <h1 className="text-2xl font-bold">Inboxes</h1>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" disabled>
            <CogIcon />
          </Button>
          <RefreshButton />
        </div>
      </header>
      <div className="border-t border-b border-zinc-300">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className={`flex items-center justify-between py-3 px-4 ${index !== 4 ? "border-b border-zinc-300" : ""}`}
          >
            <div className="flex items-center space-x-4">
              <div className="h-6 w-40 bg-gray-200 rounded"></div>
              <div className="h-4 w-8 bg-gray-200 rounded"></div>
            </div>
            <div className="h-6 w-8 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  )
}

