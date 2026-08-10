"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function GenerateBotToken() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setUrl(null);
    try {
      const res = await fetch("/api/create-bot-token", { method: "POST" });
      const data = (await res.json()) as { url?: string };
      setUrl(data.url ?? null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={generate} disabled={loading} variant="outline">
        {loading ? "Generating…" : "Generate bot token"}
      </Button>
      {url && (
        <div className="break-all rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700">
          {url}
          <button
            className="ml-2 text-blue-500 underline"
            onClick={() => navigator.clipboard.writeText(url)}
          >
            copy
          </button>
        </div>
      )}
    </div>
  );
}
