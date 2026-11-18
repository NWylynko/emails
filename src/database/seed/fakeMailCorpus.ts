/**
 * Deterministic fake mail for the dev database.
 *
 * Everything here is generated from a seeded PRNG, never `Math.random()`, so
 * the same seed produces byte-identical output on every run. Tests depend on
 * that: they assert that a search for a specific phrase returns a specific
 * email, which only works if the corpus is reproducible.
 *
 * The corpus deliberately includes the awkward cases, not just tidy mail —
 * an R2 oversized-part pointer, a body big enough to overflow a tsvector, and
 * unicode. Those are the rows that break things, so seeded data that omits
 * them would give false confidence.
 */

export type FakeAttachment = {
  r2Key: string;
  name: string;
  size: number;
  contentType: string;
};

export type FakeEmail = {
  from: string;
  to: string;
  subject: string;
  body: string;
  html: string | null;
  timestamp: Date;
  viewed: boolean;
  attachments: FakeAttachment[];
};

export type FakeInbox = {
  inbox: string;
  silent: boolean;
  receiver: string | null;
};

export type FakeMailCorpus = {
  inboxes: FakeInbox[];
  emails: FakeEmail[];
};

/** mulberry32 — small, fast, and seedable, which `Math.random()` is not. */
function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INBOXES = [
  "primary@example.com",
  "github@example.com",
  "shopping@example.com",
  "banking@example.com",
  "newsletters@example.com",
  "signup-test@example.com",
  "cloud@example.com",
  "travel@example.com",
  "social@example.com",
  "receipts@example.com",
  "support@example.com",
  "throwaway@example.com",
];

/**
 * Each template owns a distinct vocabulary. That is what makes the corpus
 * useful for testing search: a query for "refund" should reach the refund mail
 * and nothing else, which only holds if the categories do not all share filler
 * text.
 */
/**
 * Facts generated once per email and shared by its subject and body, so the two
 * agree. Generating them independently produced mail whose subject quoted one
 * verification code while its body quoted a different one — harmless to the
 * index, but confusing enough to waste someone's time when they are staring at
 * seeded data trying to decide whether a bug is real.
 */
type MailFacts = {
  code: string;
  amount: string;
  refund: string;
  tracking: string;
  deploySucceeded: boolean;
};

const TEMPLATES = [
  {
    kind: "verification",
    senders: ["noreply@github.com", "accounts@google.com", "no-reply@discord.com"],
    subject: (f: MailFacts) => `Your verification code is ${f.code}`,
    body: (f: MailFacts) =>
      `Someone requested a sign-in code for your account.\n\nYour verification code is ${f.code}. It expires in 10 minutes.\n\nIf you did not request this code, you can safely ignore this email — nobody can access your account without it.`,
  },
  {
    kind: "password-reset",
    senders: ["security@dropbox.com", "no-reply@figma.com", "accounts@notion.so"],
    subject: () => "Reset your password",
    body: () =>
      `We received a request to reset the password on your account.\n\nFollow the link below to choose a new password. The link expires in one hour and can only be used once.\n\nIf you did not ask to reset your password, ignore this message and your password will stay unchanged.`,
  },
  {
    kind: "receipt",
    senders: ["billing@stripe.com", "receipts@apple.com", "invoice@cloudflare.com"],
    subject: (f: MailFacts) => `Your receipt — $${f.amount}`,
    body: (f: MailFacts) =>
      `Thanks for your payment.\n\nAmount charged: $${f.amount}\nPayment method: Visa ending 4242\n\nThis receipt is for your records. Your subscription renews automatically each month until cancelled.`,
  },
  {
    kind: "refund",
    senders: ["orders@amazon.com", "help@etsy.com", "support@ebay.com"],
    subject: () => "Your refund has been processed",
    body: (f: MailFacts) =>
      `We have processed a refund of $${f.refund} back to your original payment method.\n\nRefunds usually appear on your statement within five to ten business days depending on your bank.\n\nSorry the item did not work out.`,
  },
  {
    kind: "shipping",
    senders: ["tracking@dhl.com", "notify@auspost.com.au", "shipment@ups.com"],
    subject: (f: MailFacts) => `Your parcel is on its way — ${f.tracking}`,
    body: (f: MailFacts) =>
      `Good news, your parcel has left our depot and is out for delivery today.\n\nTracking number ${f.tracking} — follow it for live updates. A signature will be required on delivery.`,
  },
  {
    kind: "deployment",
    senders: ["notifications@vercel.com", "builds@cloudflare.com", "ci@github.com"],
    subject: (f: MailFacts) => (f.deploySucceeded ? "Deployment succeeded" : "Deployment failed"),
    body: (f: MailFacts) =>
      `Your latest build ${f.deploySucceeded ? "finished successfully" : "failed"}.\n\nThe deployment pipeline ran the install step, the build step and the upload step. Check the build logs for the full output including any warnings emitted during compilation.`,
  },
  {
    kind: "security-alert",
    senders: ["security@google.com", "alerts@1password.com", "noreply@okta.com"],
    subject: () => "New sign-in from an unrecognised device",
    body: () =>
      `We noticed a sign-in to your account from a device we have not seen before.\n\nIf this was you, no action is needed. If it was not, secure your account immediately by changing your password and reviewing active sessions.`,
  },
  {
    kind: "newsletter",
    senders: ["digest@substack.com", "weekly@hackernewsletter.com", "news@theverge.com"],
    subject: () => "The weekly digest",
    body: () =>
      `This week: why database indexes matter more than query rewriting, a long read on distributed consensus, and a short argument that most caching layers are premature.\n\nUnsubscribe at any time using the link at the bottom of this email.`,
  },
  {
    kind: "meeting",
    senders: ["calendar@zoom.us", "invites@calendly.com", "no-reply@teams.microsoft.com"],
    subject: () => "Invitation: design review",
    body: () =>
      `You have been invited to a meeting.\n\nAgenda: walk through the proposed interface changes, agree on scope, and assign follow-up actions. Please read the linked document beforehand so the session can stay focused on decisions.`,
  },
];

const ATTACHMENT_KINDS = [
  { name: "invoice.pdf", contentType: "application/pdf", size: 84_213 },
  { name: "receipt.pdf", contentType: "application/pdf", size: 42_880 },
  { name: "screenshot.png", contentType: "image/png", size: 310_552 },
  { name: "report.csv", contentType: "text/csv", size: 9_744 },
  { name: "logo.svg", contentType: "image/svg+xml", size: 4_120 },
];

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)]!;
}

function textToHtml(subject: string, body: string): string {
  const paragraphs = body
    .split("\n\n")
    .map((p) => `    <p>${p.replace(/\n/g, "<br />")}</p>`)
    .join("\n");

  return `<html>\n  <body style="font-family: sans-serif; max-width: 600px">\n    <h1>${subject}</h1>\n${paragraphs}\n    <hr />\n    <p style="color:#888;font-size:12px">Sent to you because you have an account. <a href="https://example.com/unsubscribe">Unsubscribe</a></p>\n  </body>\n</html>`;
}

/**
 * Fixed emails with distinctive tokens, appended after the generated ones.
 * Tests import these and assert that searching for the token returns exactly
 * this mail, which is only a meaningful assertion because the token appears
 * nowhere else in the corpus.
 */
export const SEARCH_FIXTURES = {
  /** Plain single-word needle. */
  uniqueToken: {
    token: "zarquon",
    to: "primary@example.com",
    from: "needle@fixtures.test",
    subject: "The zarquon report",
    body: "This is the only email in the corpus containing the word zarquon. Searching for it must return exactly this message.",
  },
  /** Proves ranking puts a subject hit above a body-only hit for the same term. */
  subjectWeighted: {
    token: "brindlewick",
    to: "primary@example.com",
    from: "ranking@fixtures.test",
    subject: "brindlewick in the subject line",
    body: "The body of this message does not repeat the term at all.",
  },
  bodyWeighted: {
    token: "brindlewick",
    to: "primary@example.com",
    from: "ranking@fixtures.test",
    subject: "A subject with no special term",
    body: "This message mentions brindlewick only down here in the body, so it must rank below the one carrying it in the subject.",
  },
  /** Stemming: indexed as "cancel", so a search for "cancel" must find it. */
  stemming: {
    token: "cancellations",
    to: "shopping@example.com",
    from: "stemming@fixtures.test",
    subject: "Policy on cancellations",
    body: "Repeated cancellations of the same order will be reviewed by our team.",
  },
  /** Phrase search must distinguish this from the decoy below. */
  phrase: {
    to: "banking@example.com",
    from: "phrase@fixtures.test",
    subject: "Your account balance is low",
    body: "The phrase account balance appears here in this exact order.",
  },
  phraseDecoy: {
    to: "banking@example.com",
    from: "phrase@fixtures.test",
    subject: "Balance of the account explained",
    body: "Here the words appear but the balance of your account is written the other way around.",
  },
  /** Unicode — must survive the round trip and stay searchable. */
  unicode: {
    token: "Grüße",
    to: "social@example.com",
    from: "unicode@fixtures.test",
    subject: "Grüße aus München 🎉",
    body: "Herzliche Grüße und einen schönen Tag. Emoji: 🎉🚀 — these must round-trip intact.",
  },
  /** The R2 pointer case: body is a pointer, not text. Content is NOT searchable. */
  oversizedPointer: {
    to: "primary@example.com",
    from: "oversized@fixtures.test",
    subject: "Email whose body was stashed in R2",
    body: "r2:oversized-email-part/seed-oversized-body-fixture",
  },
} as const;

/**
 * A body large enough that an unguarded `to_tsvector(body)` exceeds Postgres'
 * hard 1MB tsvector ceiling and throws. It has to be high-entropy — a
 * repetitive string of the same length collapses to a tiny tsvector, because
 * tsvector stores each distinct lexeme once.
 *
 * This row exists so the seeded database actually proves the truncation guard
 * on the search column is load-bearing. Without it the guard looks like dead
 * defensive code and someone will eventually delete it.
 */
export function buildTsvectorOverflowBody(): string {
  const tokens: string[] = [];
  for (let i = 0; i < 95_000; i++) {
    tokens.push(`tok${i.toString(36)}x`);
  }

  // Stay under the varchar(1_000_000) column limit while still overflowing the
  // 1MB tsvector limit once lexemes and position data are added.
  return tokens.join(" ").slice(0, 800_000);
}

export function generateFakeMailCorpus(count: number, seed = 20260817): FakeMailCorpus {
  const r = createSeededRandom(seed);
  const emails: FakeEmail[] = [];

  // Spread across the last 120 days, newest last. Anchored to the current time
  // so the UI shows plausible "3 hours ago" values rather than a frozen date.
  const now = Date.now();
  const windowMs = 120 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const template = pick(r, TEMPLATES);
    const to = pick(r, INBOXES);
    const from = pick(r, template.senders);

    const facts: MailFacts = {
      code: String(100000 + Math.floor(r() * 899999)),
      amount: (r() * 200).toFixed(2),
      refund: (r() * 90).toFixed(2),
      tracking: Math.floor(r() * 9e9).toString(36).toUpperCase(),
      deploySucceeded: r() > 0.5,
    };

    const subject = template.subject(facts);
    const body = template.body(facts);

    // Older mail is mostly read, recent mail mostly not — which is what makes
    // the unread badges on the inbox list look like a real account.
    const age = r();
    const timestamp = new Date(now - age * windowMs);
    const viewed = r() < 1 - age * 0.8;

    const attachments: FakeAttachment[] = [];
    if (r() < 0.18) {
      const kind = pick(r, ATTACHMENT_KINDS);
      attachments.push({
        r2Key: `seed/${i}-${kind.name}`,
        name: kind.name,
        size: kind.size,
        contentType: kind.contentType,
      });
    }

    emails.push({
      from,
      to,
      subject,
      body,
      // Most real mail is multipart; some is text only.
      html: r() < 0.75 ? textToHtml(subject, body) : null,
      timestamp,
      viewed,
      attachments,
    });
  }

  // Fixtures last, so their ids are predictable relative to the generated set.
  const fixtureBase = now - 60 * 60 * 1000;
  let fixtureOffset = 0;
  const fixture = (f: { from: string; to: string; subject: string; body: string }): FakeEmail => ({
    from: f.from,
    to: f.to,
    subject: f.subject,
    body: f.body,
    html: null,
    timestamp: new Date(fixtureBase + fixtureOffset++ * 60 * 1000),
    viewed: false,
    attachments: [],
  });

  emails.push(
    fixture(SEARCH_FIXTURES.uniqueToken),
    fixture(SEARCH_FIXTURES.subjectWeighted),
    fixture(SEARCH_FIXTURES.bodyWeighted),
    fixture(SEARCH_FIXTURES.stemming),
    fixture(SEARCH_FIXTURES.phrase),
    fixture(SEARCH_FIXTURES.phraseDecoy),
    fixture(SEARCH_FIXTURES.unicode),
    fixture(SEARCH_FIXTURES.oversizedPointer),
    {
      from: "overflow@fixtures.test",
      to: "primary@example.com",
      subject: "Body large enough to overflow a tsvector",
      body: buildTsvectorOverflowBody(),
      html: null,
      timestamp: new Date(fixtureBase + fixtureOffset++ * 60 * 1000),
      viewed: false,
      attachments: [],
    }
  );

  // Inbox settings: a couple muted, one with a forward-on receiver, so the
  // settings dialog has something to show.
  const inboxes: FakeInbox[] = INBOXES.map((inbox, i) => ({
    inbox,
    silent: i % 5 === 0,
    receiver: inbox === "primary@example.com" ? "noreply@github.com" : null,
  }));

  return { inboxes, emails };
}
