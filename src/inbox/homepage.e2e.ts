import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser, type Page } from "playwright/test";
import postgres from "postgres";

const homepageUrl = "http://localhost:3002";
const testInbox = `homepage-${crypto.randomUUID()}@wylynko.me`;
const secondInbox = `homepage-${crypto.randomUUID()}@wylynko.me`;
let sql: ReturnType<typeof postgres>;
let browser: Browser;
let page: Page;
let latestEmailId: number;

async function clerkRequest(path: string, body?: object) {
  const response = await fetch(`https://api.clerk.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.ok(response.ok, `Clerk ${path} returned ${response.status}`);
  return response.json();
}

before(async () => {
  const databaseUrl = process.env.MIGRATIONS_DATABASE_URL;
  assert.ok(
    databaseUrl,
    "Run with pnpm test:homepage to inject dev credentials",
  );
  assert.match(
    new URL(databaseUrl).hostname,
    /^ep-twilight-sunset-a76wg4dm(?:-pooler)?\./,
    "Homepage fixtures must only be written to the known dev database",
  );
  assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
  await fetch(homepageUrl);

  sql = postgres(databaseUrl, { ssl: "require", prepare: false });
  // The second message in the test inbox has a higher ID but an older timestamp.
  const inserted = await sql<{ emailId: number }[]>`
    insert into emails ("from", "to", subject, body, timestamp, viewed) values
      ('newest@preview.test', ${testInbox}, 'Latest homepage message',
       ${"Your verification code is 482901.\n\nUse it to finish signing in."}, '2099-02-02', false),
      ('older@preview.test', ${testInbox}, 'Older homepage message',
       'This older body must not be previewed.', '2099-01-01', true),
      ('other@preview.test', ${secondInbox}, 'Latest other inbox message',
       'Preview for the other inbox.', '2099-02-01', true)
    returning "emailId"`;
  latestEmailId = inserted[0]!.emailId;

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const users = (await clerkRequest("users?limit=1")) as { id: string }[];
  assert.ok(
    users[0],
    "The dev Clerk instance needs a user for browser sign-in",
  );
  const ticket = (await clerkRequest("sign_in_tokens", {
    user_id: users[0].id,
    expires_in_seconds: 120,
  })) as { token: string };
  await page.goto(
    `${homepageUrl}/authenticate?token=${encodeURIComponent(ticket.token)}`,
  );
  await page.waitForURL(homepageUrl + "/");
  await expect(
    page.getByRole("heading", { name: "Inboxes", exact: true }),
  ).toBeVisible();
});

after(async () => {
  await browser?.close();
  if (sql) {
    try {
      await sql`delete from emails where "to" in (${testInbox}, ${secondInbox})`;
    } finally {
      await sql.end();
    }
  }
});

test("compact inbox previews show the newest subject and open it directly", async () => {
  const inboxLink = page.getByRole("link", { name: testInbox });
  await expect(inboxLink).toBeVisible();
  await expect(
    page.getByText("Latest homepage message", { exact: true }),
  ).toBeVisible();
  const inboxRow = page.getByRole("listitem").filter({ has: inboxLink });
  await expect(inboxRow).toContainText("Latest homepage message");
  await expect(inboxRow).not.toContainText("newest@preview.test");
  await expect(inboxRow).not.toContainText("Your verification code is 482901.");
  await expect(inboxRow).not.toContainText(
    "This older body must not be previewed.",
  );
  await expect(inboxRow).toContainText("1 unread");
  await expect(inboxRow).toContainText("2 emails");
  const otherRow = page.getByRole("listitem").filter({
    has: page.getByRole("link", { name: secondInbox }),
  });
  await expect(otherRow).toContainText("Latest other inbox message");
  await expect(otherRow).not.toContainText("Preview for the other inbox.");
  assert.ok(
    (await inboxRow.boundingBox())!.height <= 100,
    "Desktop inbox previews fit in a compact row",
  );
  assert.ok(
    (await inboxRow.boundingBox())!.y < (await otherRow.boundingBox())!.y,
    "Inboxes with newer mail appear first",
  );

  const latestLink = inboxRow.getByRole("link", { name: /Open latest/ });
  await expect(latestLink).toHaveAttribute("href", `/email/${latestEmailId}`);
  await inboxRow.click({ position: { x: 4, y: 4 } });
  await page.waitForURL(
    `${homepageUrl}/inbox/${encodeURIComponent(testInbox)}`,
    { timeout: 5000 },
  );
  await expect(
    page.getByText("Older homepage message", { exact: true }),
  ).toBeVisible();
  await page.goto(homepageUrl);
  await page.reload();
  await expect(inboxRow).toContainText("1 unread");
  await latestLink.click();
  await page.waitForURL(`${homepageUrl}/email/${latestEmailId}`);
  await expect(
    page.getByRole("heading", { name: "Latest homepage message" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your verification code is 482901.", { exact: true }),
  ).toBeVisible();

  await page.goto(homepageUrl);
  await expect(inboxRow).not.toContainText("1 unread");
  await inboxLink.click();
  await page.waitForURL(
    `${homepageUrl}/inbox/${encodeURIComponent(testInbox)}`,
  );
  await expect(
    page.getByText("Older homepage message", { exact: true }),
  ).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(homepageUrl);
  await expect(latestLink).toBeVisible();
  assert.ok(
    (await inboxRow.boundingBox())!.height <= 150,
    "Mobile inbox previews stay compact even with a long inbox address",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    "The homepage fits a mobile viewport without horizontal scrolling",
  );
  const mobileRowBounds = (await inboxRow.boundingBox())!;
  const mobileSubjectBounds = (await inboxRow
    .getByText("Latest homepage message", { exact: true })
    .boundingBox())!;
  await inboxRow.click({
    position: {
      x: mobileSubjectBounds.x - mobileRowBounds.x + 4,
      y: mobileSubjectBounds.y - mobileRowBounds.y + 4,
    },
  });
  await page.waitForURL(
    `${homepageUrl}/inbox/${encodeURIComponent(testInbox)}`,
    { timeout: 5000 },
  );
});
