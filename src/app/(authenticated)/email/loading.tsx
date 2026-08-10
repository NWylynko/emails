"use client"

import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function Loading() {
  const router = useRouter()

  return (
    <div className="space-y-6 animate-pulse">
      <header className="flex flex-row items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={() => router.back()}>
            <ArrowLeft className="text-gray-300 h-6 w-6" />
          </button>
          <div className="h-8 w-64 bg-gray-200 rounded"></div>
        </div>
      </header>
    </div>
  )
}
