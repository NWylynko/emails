"use server";

import { db } from "@/database";
import { attachments } from "@/database/schema";
import { auth } from "@clerk/nextjs/server";
import * as driz from "drizzle-orm";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const env = z
  .object({
    CLOUDFLARE_R2_BUCKET_NAME: z.string(),
    CLOUDFLARE_R2_JURISDICTION_ENDPOINT: z.url(),
    CLOUDFLARE_R2_ACCESS_KEY_ID: z.string(),
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string(),
  })
  .parse(process.env);

// R2 speaks the S3 API, so the AWS SDK is what Cloudflare documents for signing
// URLs off-Workers — the native R2 binding only exists inside the Workers runtime.
// "auto" is the region R2 expects; v4 signing is the only mode in the v3 SDK.
const s3 = new S3Client({
  region: "auto",
  endpoint: env.CLOUDFLARE_R2_JURISDICTION_ENDPOINT,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

const one_hour = 60 * 60;

export const getAttachmentUrl = async (attachmentId: number) => {
  const { isAuthenticated } = await auth();

  if (isAuthenticated === false) {
    throw new Error("Unauthorized");
  }

  const [attachment] = await db
    .select({
      r2Key: attachments.r2Key,
      name: attachments.name,
    })
    .from(attachments)
    .where(driz.eq(attachments.attachmentId, attachmentId));

  if (attachment === undefined) {
    throw new Error("Attachment not found");
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: attachment.r2Key,
    }),
    { expiresIn: one_hour }
  );

  return { url, filename: attachment.name };
};
