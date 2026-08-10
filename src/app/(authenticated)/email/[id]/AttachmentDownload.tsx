"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { getAttachmentUrl } from "./Attachment-actions";
import { useState } from "react";
import { toast } from "sonner";

export function AttachmentDownload(props: { attachmentId: number }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { url, filename } = await getAttachmentUrl(props.attachmentId);
      await downloadFile(url, filename);
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

async function downloadFile(fileUrl: string, filename: string | null) {
  const res = await fetch(fileUrl);

  if (!res.ok) {
    console.error("Download failed", res.status);
    return;
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
