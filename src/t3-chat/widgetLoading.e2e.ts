import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, expect, type Page } from "playwright/test";

const origin = "http://localhost:3002";

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

async function signIn(page: Page, userId: string) {
  const ticket = (await clerkRequest("sign_in_tokens", {
    user_id: userId,
    expires_in_seconds: 120,
  })) as { token: string };
  try {
    await page.goto(
      `${origin}/authenticate?token=${encodeURIComponent(ticket.token)}`,
    );
  } catch {
    // Playwright navigation errors otherwise print the short-lived sign-in ticket.
    throw new Error(
      "Could not open the dev sign-in page. Check the existing server on port 3002.",
    );
  }
  await page.waitForURL(origin + "/");
  await expect(
    page.getByRole("heading", { name: "Inboxes", exact: true }),
  ).toBeVisible();
}

test("chat styles stay out of initial route assets; editors load only the launcher until opening", async () => {
  assert.ok(
    process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"),
    "Use the dev Infisical environment",
  );
  const editors =
    process.env.T3_CHAT_EDITOR_USER_IDS?.split(",").map((id) => id.trim()) ??
    [];
  const users = (await clerkRequest("users?limit=100")) as { id: string }[];
  const editor = users.find((user) => editors.includes(user.id));
  assert.ok(editor, "The dev Clerk instance needs a website editor");
  await fetch(origin);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const assetBodies: Promise<string>[] = [];
    const chatRequests: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (
        response.ok() &&
        new URL(response.url()).origin === origin &&
        ["script", "stylesheet"].includes(response.request().resourceType())
      ) {
        assetBodies.push(
          response.text().catch((error) => {
            errors.push(String(error));
            return "";
          }),
        );
      }
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/t3-chat")
        chatRequests.push(request.url());
    });
    // Keep the loading test isolated from Nick's live T3 environment.
    await page.route("**/api/t3-chat", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "forbidden",
            message: "Loading fixture denied access.",
          },
        }),
      }),
    );
    await signIn(page, editor.id);
    const html = await (await page.request.get(origin)).text();
    const stylesheets = [...html.matchAll(/<link\b[^>]*>/g)]
      .map((match) => match[0])
      .filter((link) => /rel="stylesheet"/.test(link))
      .map((link) => /href="([^"]+)"/.exec(link)?.[1])
      .filter((href): href is string => !!href);
    for (const href of stylesheets) {
      const css = await (
        await page.request.get(new URL(href, origin).href)
      ).text();
      assert.ok(
        !css.includes(".t3cw-root"),
        "The initial layout must not deliver widget CSS before client authorization",
      );
    }
    // A fresh full navigation observes the layout's actual initial assets.
    assetBodies.length = 0;
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Inboxes", exact: true }),
    ).toBeVisible();
    const launcher = page.getByRole("button", { name: "Edit with T3 Code" });
    await expect(launcher).toBeEnabled();
    const assets = (await Promise.all(assetBodies)).join("\n");
    assert.ok(
      !assets.includes("What should we work on?"),
      "The chat panel must remain lazy before opening",
    );
    assert.equal(
      await launcher.evaluate((element) => getComputedStyle(element).position),
      "fixed",
    );
    assert.deepEqual(chatRequests, []);
    await launcher.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "You are not authorized to use this chat.",
    );
    assert.ok(chatRequests.length > 0);
    await page.getByRole("button", { name: "Minimize chat" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
