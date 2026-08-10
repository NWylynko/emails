"use client"

import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RefreshCwIcon } from "lucide-react"
import { useEffect, useTransition } from "react"
import { useReset, useUpdates } from "@/providers/UpdatesProvider"

export const RefreshButton = () => {
  const router = useRouter()
  const updates = useUpdates()
  const resetCounter = useReset()
  const pathname = usePathname()

  const [loading, startTransition] = useTransition()

  const handleRefresh = () => {
    startTransition(() => {
      resetCounter()
      router.refresh()
    })
  }

  useEffect(() => {
    resetCounter()
  }, [pathname])

  return (
    <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading} data-updates={updates > 0} className="data-[updates=true]:border-purple-800 data-[updates=true]:bg-purple-100">
      {updates > 0 ? <span className="text-xs text-purple-800">{updates}</span> : <RefreshCwIcon data-loading={loading} className="data-[loading=true]:animate-spin" />}
    </Button>
  )
}