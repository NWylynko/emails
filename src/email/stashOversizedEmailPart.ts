/**
 * `emails.html` and `emails.body` are varchar(1_000_000). A mail client that
 * inlines a photo blows straight past that, and the INSERT fails with
 * "value too long for type character varying(1000000)" — which killed the whole
 * email handler before it ever got to proxying the message on.
 *
 * Rather than widen the columns (and balloon the database), anything oversized
 * goes to R2 and the column holds a pointer instead. Read it back with
 * `resolveOversizedEmailPart` — every read path must go through that, or the
 * pointer renders as literal text.
 */

/** Well under the varchar(1_000_000) cap, leaving room for multi-byte chars. */
export const OVERSIZED_PART_THRESHOLD = 900_000;

export const OVERSIZED_PART_POINTER_PREFIX = "r2:";

const OVERSIZED_PART_KEY_PREFIX = "oversized-email-part/";

export function isOversizedEmailPartPointer(value: string | null | undefined) {
  return (
    typeof value === "string" &&
    value.startsWith(OVERSIZED_PART_POINTER_PREFIX) &&
    value
      .slice(OVERSIZED_PART_POINTER_PREFIX.length)
      .startsWith(OVERSIZED_PART_KEY_PREFIX)
  );
}

/**
 * Returns the value to store in the column: either the original string, or a
 * `r2:oversized-email-part/...` pointer once it has been written to R2.
 */
export async function stashOversizedEmailPart(
  bucket: R2Bucket,
  kind: "html" | "body",
  value: string
): Promise<string> {
  if (value.length <= OVERSIZED_PART_THRESHOLD) {
    return value;
  }

  const key = `${OVERSIZED_PART_KEY_PREFIX}${kind}/${crypto.randomUUID()}`;

  const object = await bucket.put(key, value, {
    httpMetadata: {
      contentType: kind === "html" ? "text/html" : "text/plain",
    },
  });

  if (object === null) {
    throw new Error(
      `stashOversizedEmailPart failed to write ${kind} (${value.length} chars) to R2`
    );
  }

  console.log(
    "stashOversizedEmailPart stored",
    JSON.stringify({ kind, key: object.key, chars: value.length })
  );

  return `${OVERSIZED_PART_POINTER_PREFIX}${object.key}`;
}

/** Inverse of the above — pass any stored html/body value through this on read. */
export async function resolveOversizedEmailPart(
  bucket: R2Bucket,
  value: string | null
): Promise<string | null> {
  if (!isOversizedEmailPartPointer(value)) {
    return value;
  }

  const key = value!.slice(OVERSIZED_PART_POINTER_PREFIX.length);
  const object = await bucket.get(key);

  if (object === null) {
    throw new Error(`resolveOversizedEmailPart could not find ${key} in R2`);
  }

  return await object.text();
}
