import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readEmailBody } from "@/email/emailQueries";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { linkifyText } from "../linkifyText";

// Cloudflare retires Workers AI models on a published schedule, and a retired
// model still returns HTTP 200 — with `success: false` and no `result.response`.
// Keep the id here so the next retirement is a one-line change, and see
// https://developers.cloudflare.com/workers-ai/models/ for current models.
const emailSummaryModel = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// What `pnpm dev` shows instead of a real summary. Has a link so linkifyText
// still has something to render.
const localDevFakeEmailSummary =
  "[local dev] Fake summary: Workers AI is production-only, so `pnpm dev` " +
  "never calls it. See https://developers.cloudflare.com/workers-ai/models/";

/**
 * Runs through the `AI` binding rather than the REST API, which drops the
 * account id and the `CLOUDFLARE_AI_KEY` secret from the project.
 *
 * The binding exists only in the production wrangler env. Development has none
 * (see wrangler.jsonc), so local dev needs no Cloudflare login and returns a
 * fixed fake summary. Anywhere else, a missing binding is a deploy mistake and
 * throws.
 *
 * The binding still needs the same defensive check: a retired model does not
 * throw, it comes back without a `response` string.
 */
async function runEmailSummaryModel(model: string, input: object) {
  if (process.env.NODE_ENV === "development") {
    return localDevFakeEmailSummary;
  }

  const { env } = getCloudflareContext();
  // `wrangler types` reads the development env, which has no AI binding.
  const ai = (env as CloudflareEnv & { AI?: Ai }).AI;

  if (ai === undefined) {
    throw new Error(
      "No Workers AI binding (`AI`) in this Worker. Only the production env in " +
        "wrangler.jsonc has one; `pnpm preview` runs the development env, so " +
        "it can't show summaries."
    );
  }

  const result = (await ai.run(model as never, input as never)) as {
    response?: string;
  };

  if (typeof result?.response !== "string") {
    throw new Error(
      `Workers AI returned no response for model ${model} — ` +
        `${JSON.stringify(result).slice(0, 500)}. The model may have been ` +
        `retired; see https://developers.cloudflare.com/workers-ai/models/`
    );
  }

  return result.response;
}

export default async function AiEmailPage(props: PageProps<"/email/[id]/ai">) {
  await connection();

  const { id } = await props.params;

  const body = await readEmailBody(Number(id));

  if (body === null) {
    notFound();
  }

  const summary = await runEmailSummaryModel(emailSummaryModel, {
    messages: [
      {
        role: "system",
        content:
          "You are a an email assistant that can help with email related tasks",
      },
      {
        role: "user",
        content: body,
      },
      {
        role: "user",
        content: `
          - condense the email down to a summary
          - only reply with the condensed email
          - do not include any other text
          - reply in the same language as the original email
          - reply in a single sentence
          - If there is an important link in the email, include it in the condensed email
          - If there is an important pin code in the email, include it in the condensed email
        `,
      },
    ],
  });

  return (
    <div className="whitespace-pre-wrap">
      {summary.split("\n").map((line, index) => (
        <p key={index}>{linkifyText(line)}</p>
      ))}
    </div>
  );
}
