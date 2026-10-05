/**
 * Inbox reads and writes, shared by the website and the `/v1` CLI API.
 *
 * Before the merge these lived in two repos: the website prepared its own
 * statements in `page.tsx`, the Worker hand-rolled the same aggregate in
 * `api.ts`, and the two returned different field names for identical data.
 * One definition now, and each consumer maps to whatever shape it presents.
 */
import * as driz from "drizzle-orm";
import { getEmailsDb } from "@/database";
import { emails, inboxes } from "@/database/schema";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveOversizedEmailPart } from "@/email/stashOversizedEmailPart";

export type InboxSummary = {
  to: string;
  total: number;
  unread: number;
  latest: Date | null;
};

export async function listInboxesWithCounts(): Promise<InboxSummary[]> {
  const latest = driz.max(emails.timestamp).as("latest");

  const rows = await getEmailsDb()
    .select({
      to: emails.to,
      total: driz.count(emails.emailId),
      unread: driz
        .sum(driz.sql`CASE WHEN ${emails.viewed} = false THEN 1 ELSE 0 END`)
        .as("unread"),
      latest,
    })
    .from(emails)
    .groupBy(emails.to)
    .orderBy(driz.desc(latest));

  return rows.map((row) => ({
    to: row.to,
    total: Number(row.total),
    unread: Number(row.unread ?? 0),
    latest: row.latest ?? null,
  }));
}

/** Homepage previews; keep full bodies and search vectors out of the list query. */
export async function listInboxesWithLatestEmail() {
  const db = getEmailsDb();
  const counts = db
    .select({
      to: emails.to,
      total: driz.count(emails.emailId).as("total"),
      unread: driz.sql<number>`count(*) filter (where ${emails.viewed} = false)`
        .mapWith(Number)
        .as("unread"),
    })
    .from(emails)
    .groupBy(emails.to)
    .as("inboxCounts");

  const latestEmail = db
    .select({
      emailId: emails.emailId,
      from: emails.from,
      subject: emails.subject,
      timestamp: emails.timestamp,
      body: driz.sql<string>`left(${emails.body}, 1000)`.as("body"),
    })
    .from(emails)
    .where(driz.eq(emails.to, counts.to))
    .orderBy(driz.desc(emails.timestamp), driz.desc(emails.emailId))
    .limit(1)
    .as("latestEmail");

  const rows = await db
    .select({
      to: counts.to,
      total: counts.total,
      unread: counts.unread,
      emailId: latestEmail.emailId,
      from: latestEmail.from,
      subject: latestEmail.subject,
      timestamp: latestEmail.timestamp,
      body: latestEmail.body,
    })
    .from(counts)
    .innerJoinLateral(latestEmail, driz.sql`true`)
    .orderBy(driz.desc(latestEmail.timestamp), driz.desc(latestEmail.emailId));

  const bucket = getCloudflareContext().env.ATTACHMENTS;
  return Promise.all(
    rows.map(async ({ body, ...inbox }) => {
      const text = await resolveOversizedEmailPart(bucket, body);
      const preview = text!.replace(/\s+/g, " ").trim();
      return {
        ...inbox,
        preview: preview.length > 240 ? `${preview.slice(0, 240)}…` : preview,
      };
    }),
  );
}

export type InboxEmailFilters = {
  limit?: number;
  unreadOnly?: boolean;
  since?: Date;
  afterId?: number;
  from?: string;
  subject?: string;
};

export async function listInboxEmails(
  inboxEmail: string,
  filters: InboxEmailFilters = {},
) {
  const conditions = [driz.eq(emails.to, inboxEmail)];

  if (filters.unreadOnly) {
    conditions.push(driz.eq(emails.viewed, false));
  }
  if (filters.since) {
    conditions.push(driz.gt(emails.timestamp, filters.since));
  }
  if (filters.afterId !== undefined) {
    conditions.push(driz.gt(emails.emailId, filters.afterId));
  }
  if (filters.from) {
    conditions.push(driz.ilike(emails.from, `%${filters.from}%`));
  }
  if (filters.subject) {
    conditions.push(driz.ilike(emails.subject, `%${filters.subject}%`));
  }

  const query = getEmailsDb()
    .select({
      emailId: emails.emailId,
      from: emails.from,
      to: emails.to,
      subject: emails.subject,
      timestamp: emails.timestamp,
      viewed: emails.viewed,
    })
    .from(emails)
    .where(driz.and(...conditions))
    .orderBy(driz.desc(emails.timestamp));

  return filters.limit === undefined ? query : query.limit(filters.limit);
}

export async function listInboxSenders(inboxEmail: string) {
  return getEmailsDb()
    .selectDistinct({ from: emails.from })
    .from(emails)
    .where(driz.eq(emails.to, inboxEmail));
}

export async function getInboxSettings(inboxEmail: string) {
  const [inbox] = await getEmailsDb()
    .select({ silent: inboxes.silent, receiver: inboxes.receiver })
    .from(inboxes)
    .where(driz.eq(inboxes.inbox, inboxEmail));

  return inbox ?? null;
}

export async function setInboxSilent(inboxEmail: string, silent: boolean) {
  await getEmailsDb()
    .insert(inboxes)
    .values({ inbox: inboxEmail, silent })
    .onConflictDoUpdate({ target: inboxes.inbox, set: { silent } });
}

/**
 * Only the website sets this — the CLI API deliberately cannot, because the
 * receiver dropdown is restricted to addresses that have already mailed the
 * inbox.
 */
export async function setInboxReceiver(inboxEmail: string, receiver: string) {
  await getEmailsDb()
    .insert(inboxes)
    .values({ inbox: inboxEmail, receiver })
    .onConflictDoUpdate({ target: inboxes.inbox, set: { receiver } });
}
