import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { RefreshButton } from "@/components/RefreshButton"

export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <header className="flex flex-row items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-gray-300">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div className="h-8 w-64 bg-gray-200 rounded"></div>
        </div>
        <RefreshButton />
      </header>
      <div className="border-t border-b border-zinc-300">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className={`flex items-center justify-between py-3 px-4 ${index !== 4 ? "border-b border-zinc-300" : ""}`}
          >
            <div className="flex items-center space-x-2">
              <div className="h-6 w-48 bg-gray-200 rounded"></div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="h-4 w-24 bg-gray-200 rounded"></div>
              <div className="h-4 w-20 bg-gray-200 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

