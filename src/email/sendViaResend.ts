import type { CreateEmailOptions, Resend } from "resend";

/**
 * `resend.emails.send()` NEVER throws — it returns `{ data, error }`, and even a
 * total network failure comes back as an error object. Every send in this
 * service used to discard that return value, so a rejected send looked exactly
 * like a successful one (and we still fired an "Email sent" push notification).
 *
 * Always send through this helper: it logs the full Resend error and then
 * throws, so the failure shows up in `wrangler tail` and bounces back to the
 * sender instead of vanishing.
 */
export async function sendViaResend(
  resend: Resend,
  context: string,
  payload: CreateEmailOptions
) {
  const attachmentBytes =
    payload.attachments?.reduce(
      (total, attachment) =>
        total +
        (typeof attachment.content === "string"
          ? attachment.content.length
          : attachment.content?.byteLength ?? 0),
      0
    ) ?? 0;

  const attempt = {
    context,
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    attachmentCount: payload.attachments?.length ?? 0,
    attachmentBytes,
    textLength: typeof payload.text === "string" ? payload.text.length : 0,
  };

  console.log("sendViaResend attempt", JSON.stringify(attempt));

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    console.error(
      "sendViaResend rejected",
      JSON.stringify({ ...attempt, error }, null, 2)
    );

    throw new Error(
      `Resend rejected [${context}] ${String(payload.from)} -> ${String(
        payload.to
      )}: ${error.name} (status ${
        "statusCode" in error ? error.statusCode : "unknown"
      }) ${error.message}`
    );
  }

  console.log(
    "sendViaResend sent",
    JSON.stringify({ ...attempt, resendId: data?.id })
  );

  return data;
}
