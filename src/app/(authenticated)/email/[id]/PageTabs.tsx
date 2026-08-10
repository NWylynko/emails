"use client"

import { Tabs } from "@/components/ui/tabs"
import { useRouter, useSelectedLayoutSegment } from "next/navigation"
import { ComponentProps, useEffect, useState } from "react"

export const PageTabs = ({ baseUrl, ...props }: Omit<ComponentProps<typeof Tabs>, "defaultValue"> & { baseUrl: string }) => {
  const segment = useSelectedLayoutSegment()
  const router = useRouter()

  const [tab, setTab] = useState(`/${segment ?? ""}`)

  useEffect(() => {
    setTab(`/${segment ?? ""}`)
  }, [segment])

  return <Tabs
    {...props}
    value={tab}
    onValueChange={(value) => {
      setTab(value)
      router.push(baseUrl + value)
    }}
  />
}