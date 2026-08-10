"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function AttachmentDownload(props: {
  attachmentId: number;
  filename: string | null;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await downloadAttachment(props.attachmentId, props.filename);
    } catch (error) {
      console.error(error);
      toast.error("Failed to download attachment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleClick}
      disabled={loading}
      className="cursor-pointer"
    >
      {!loading ? (
        <DownloadIcon className="w-4 h-4" />
      ) : (
        <Loader2Icon className="w-4 h-4 animate-spin" />
      )}
    </Button>
  );
}

async function downloadAttachment(
  attachmentId: number,
  filename: string | null
) {
  const res = await fetch(`/attachment/${attachmentId}`);

  if (!res.ok) {
    throw new Error(
      `Attachment download failed: ${res.status} ${res.statusText}`
    );
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? "attachment";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
