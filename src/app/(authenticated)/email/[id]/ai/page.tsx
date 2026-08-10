import { db } from "@/database";
import { emails } from "@/database/schema";
import * as driz from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { linkifyText } from "../linkifyText";

// Cloudflare retires Workers AI models on a published schedule, and a retired
// model still returns HTTP 200 — with `success: false` and no `result.response`.
// Keep the id here so the next retirement is a one-line change, and see
// https://developers.cloudflare.com/workers-ai/models/ for current models.
const emailSummaryModel = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

type CloudflareAIResponse = {
  result?: {
    response?: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
  success: boolean;
  errors: { code: number; message: string }[];
  messages: string[];
};

async function runAIModel(model: string, input: object) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/004b3c7f616265030549ffe5381eff06/ai/run/${model}`,
    {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_AI_KEY}` },
      method: "POST",
      body: JSON.stringify(input),
    }
  );

  const body = (await response.json()) as CloudflareAIResponse;

  // Surface the reason rather than letting an absent `result` become a
  // "Cannot read properties of undefined" further down the page.
  if (body.success === false || typeof body.result?.response !== "string") {
    const reason =
      body.errors?.map((error) => `${error.code}: ${error.message}`).join("; ") ||
      `unexpected response shape: ${JSON.stringify(body).slice(0, 500)}`;

    throw new Error(
      `Cloudflare AI call failed for model ${model} (HTTP ${response.status}) — ${reason}`
    );
  }

  return body.result.response;
}

const emailQuery = db
  .select({
    body: emails.body,
  })
  .from(emails)
  .where(driz.eq(emails.emailId, driz.sql.placeholder("id")))
  .prepare("emailQueryForAI");

export default async function AiEmailPage(props: PageProps<"/email/[id]/ai">) {
  await connection();

  const { id } = await props.params;

  const [email] = await emailQuery.execute({ id });

  if (email === undefined) {
    notFound();
  }

  const summary = await runAIModel(emailSummaryModel, {
    messages: [
      {
        role: "system",
        content:
          "You are a an email assistant that can help with email related tasks",
      },
      {
        role: "user",
        content: email.body,
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
