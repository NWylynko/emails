import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/database";
import { attachments } from "@/database/schema";
import * as driz from "drizzle-orm";
import { AttachmentDownload } from "./AttachmentDownload";

const emailAttachmentsQuery = db
  .select({
    attachmentId: attachments.attachmentId,
    name: attachments.name,
    size: attachments.size,
    contentType: attachments.contentType,
  })
  .from(attachments)
  .where(driz.eq(attachments.emailId, driz.sql.placeholder("emailId")))
  .prepare("emailAttachmentsQuery");

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

function formatBytes(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }

  if (value === 0) {
    return "0 B";
  }

  const absValue = Math.abs(value);
  const unitIndex = Math.min(
    SIZE_UNITS.length - 1,
    Math.floor(Math.log(absValue) / Math.log(1024))
  );
  const normalized = value / 1024 ** unitIndex;

  const formatted =
    Math.abs(normalized) >= 100
      ? normalized.toFixed(0)
      : Math.abs(normalized) >= 10
      ? normalized.toFixed(1)
      : normalized.toFixed(2);

  return `${formatted} ${SIZE_UNITS[unitIndex]}`;
}

export async function Attachments(props: { emailId: number }) {
  const items = await emailAttachmentsQuery.execute({
    emailId: props.emailId,
  });

  if (items.length === 0) {
    return <></>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Name</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Content Type</TableHead>
          <TableHead>Download</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((attachment) => (
          <TableRow key={attachment.attachmentId}>
            <TableCell className="font-medium">{attachment.name}</TableCell>
            <TableCell>{formatBytes(attachment.size)}</TableCell>
            <TableCell>{attachment.contentType}</TableCell>
            <TableCell>
              <AttachmentDownload attachmentId={attachment.attachmentId} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
