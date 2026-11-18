/**
 * End-to-end tests for email search, run against the real dev database with the
 * seeded corpus in it. Nothing is mocked: these build a live postgres.js client,
 * run the same `searchEmails` the website and /v1 call, and assert on rows that
 * actually came back from Postgres.
 *
 *   pnpm db:seed:dev -- --reset   # once, to put the corpus in place
 *   pnpm test
 *
 * They assert on specific messages from SEARCH_FIXTURES, which is only sound
 * because the seeder is deterministic.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { SEARCH_FIXTURES } from "../database/seed/fakeMailCorpus.ts";
import { searchEmails } from "./searchEmails.ts";

type Db = ReturnType<typeof drizzle>;

let sql: ReturnType<typeof postgres>;
let db: Db;

before(async () => {
  const url = process.env.MIGRATIONS_DATABASE_URL;
  if (!url) {
    throw new Error("MIGRATIONS_DATABASE_URL is not set. Run via 'pnpm test'.");
  }

  sql = postgres(url, { ssl: "require", prepare: false, fetch_types: false, max: 5 });
  db = drizzle(sql);

  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from emails`;
  if (count === 0) {
    throw new Error("The dev database is empty. Run 'pnpm db:seed:dev -- --reset' first.");
  }
});

after(async () => {
  await sql?.end();
});

describe("searchEmails", () => {
  test("finds an email by a token that appears exactly once in the corpus", async () => {
    const results = await searchEmails(db, { query: SEARCH_FIXTURES.uniqueToken.token });

    assert.equal(results.length, 1, "a token seeded exactly once must return exactly one email");
    assert.equal(results[0]!.subject, SEARCH_FIXTURES.uniqueToken.subject);
    assert.equal(results[0]!.to, SEARCH_FIXTURES.uniqueToken.to);
  });

  test("ranks a subject match above a body-only match for the same term", async () => {
    const results = await searchEmails(db, { query: SEARCH_FIXTURES.subjectWeighted.token });

    assert.equal(results.length, 2, "the term is seeded into exactly two emails");
    assert.equal(
      results[0]!.subject,
      SEARCH_FIXTURES.subjectWeighted.subject,
      "the email carrying the term in its subject must rank first"
    );
    assert.equal(results[1]!.subject, SEARCH_FIXTURES.bodyWeighted.subject);
    assert.ok(
      results[0]!.rank > results[1]!.rank,
      `expected a strictly higher rank, got ${results[0]!.rank} vs ${results[1]!.rank}`
    );
  });

  test("matches on word stem, so 'cancel' finds 'cancellations'", async () => {
    const results = await searchEmails(db, { query: "cancel" });
    const subjects = results.map((r) => r.subject);

    assert.ok(
      subjects.includes(SEARCH_FIXTURES.stemming.subject),
      `expected the stemming fixture in results, got: ${subjects.join(" | ")}`
    );
  });

  test("distinguishes a quoted phrase from the same words in another order", async () => {
    const results = await searchEmails(db, { query: '"account balance"' });
    const subjects = results.map((r) => r.subject);

    assert.ok(subjects.includes(SEARCH_FIXTURES.phrase.subject), "the exact phrase must match");
    assert.ok(
      !subjects.includes(SEARCH_FIXTURES.phraseDecoy.subject),
      "the decoy has the same words in a different order and must NOT match a phrase query"
    );
  });

  test("supports negation to exclude a term", async () => {
    const all = await searchEmails(db, { query: "refund" });
    const excluded = await searchEmails(db, { query: "refund -processed" });

    assert.ok(all.length > 0, "the corpus contains refund mail");
    assert.ok(
      excluded.length < all.length,
      "excluding a term that appears in the refund template must narrow the results"
    );
  });

  test("scopes results to a single inbox", async () => {
    // Deliberately a term the generated corpus also uses, so this exercises
    // real filtering rather than a term that happens to appear once.
    const scoped = await searchEmails(db, { query: "cancel", inbox: "shopping@example.com" });

    assert.ok(scoped.length > 0, "the corpus has matching mail in this inbox");
    for (const row of scoped) {
      assert.equal(row.to, "shopping@example.com", "no other inbox may appear in scoped results");
    }

    const unscoped = await searchEmails(db, { query: "cancel", limit: 200 });
    assert.ok(
      unscoped.length > scoped.length,
      "searching every inbox must return more than searching one"
    );

    // A token seeded into exactly one inbox must not surface in another.
    const wrongInbox = await searchEmails(db, {
      query: SEARCH_FIXTURES.uniqueToken.token,
      inbox: "banking@example.com",
    });
    assert.equal(wrongInbox.length, 0, "the fixture must not leak into another inbox's results");
  });

  test("returns a highlighted snippet showing why the email matched", async () => {
    const [result] = await searchEmails(db, { query: SEARCH_FIXTURES.uniqueToken.token });

    assert.ok(result, "expected a hit");
    assert.match(
      result.snippet,
      new RegExp(`<mark>${SEARCH_FIXTURES.uniqueToken.token}</mark>`, "i"),
      `snippet should wrap the matched term, got: ${result.snippet}`
    );
  });

  test("finds mail by part of the sender address", async () => {
    // Postgres tokenises an email address as ONE lexeme — `noreply@github.com`
    // does not split into "github" — so without help, searching a sender's name
    // or domain returns nothing at all. Searching by who sent it is one of the
    // most natural things to type into a mail search box.
    for (const term of ["github", "etsy", "cloudflare"]) {
      const results = await searchEmails(db, { query: term, limit: 200 });

      assert.ok(
        results.length > 0,
        `searching "${term}" must find mail from that sender, got 0 results`
      );
      assert.ok(
        results.some((r) => r.from.includes(term)),
        `results for "${term}" should include mail actually from that sender`
      );
    }
  });

  test("still matches a full sender address exactly", async () => {
    const results = await searchEmails(db, { query: "help@etsy.com", limit: 200 });

    assert.ok(results.length > 0, "the whole address must still be searchable");
    for (const row of results) {
      assert.equal(row.from, "help@etsy.com");
    }
  });

  test("finds unicode content and returns it intact", async () => {
    const results = await searchEmails(db, { query: "München" });

    assert.equal(results.length, 1);
    assert.equal(results[0]!.subject, SEARCH_FIXTURES.unicode.subject);
    assert.ok(results[0]!.subject.includes("🎉"), "emoji must survive the round trip");
  });

  test("returns nothing for a term that is not in the corpus", async () => {
    const results = await searchEmails(db, { query: "supercalifragilistic" });

    assert.equal(results.length, 0);
  });

  test("respects the limit", async () => {
    // "account" appears across several templates, so the unlimited result set
    // is comfortably larger than the limit — otherwise this would pass
    // trivially without the limit doing anything.
    const unlimited = await searchEmails(db, { query: "account", limit: 200 });
    assert.ok(unlimited.length > 5, `need more than 5 matches to test a limit, got ${unlimited.length}`);

    const limited = await searchEmails(db, { query: "account", limit: 5 });
    assert.equal(limited.length, 5);
  });

  test("returns nothing for a query made only of stopwords", async () => {
    // Worth pinning down because it looks like a bug from the outside: the
    // english config strips "the", so the query reduces to nothing and matches
    // nothing, even though the word is in every email.
    assert.deepEqual(await searchEmails(db, { query: "the" }), []);
  });

  test("tolerates an empty or whitespace-only query without throwing", async () => {
    assert.deepEqual(await searchEmails(db, { query: "" }), []);
    assert.deepEqual(await searchEmails(db, { query: "   " }), []);
  });

  test("does not throw on punctuation that would break a raw tsquery", async () => {
    // to_tsquery() would raise a syntax error on these; websearch_to_tsquery
    // must not. A search box takes whatever the user types.
    for (const query of ["!!!", "a & b", "foo | bar", "(unbalanced", "'quote", "a <-> b", "\\"]) {
      await assert.doesNotReject(
        () => searchEmails(db, { query }),
        `query ${JSON.stringify(query)} must not throw`
      );
    }
  });

  test("filters to unread when asked", async () => {
    const all = await searchEmails(db, { query: "account", limit: 200 });
    const unread = await searchEmails(db, { query: "account", unreadOnly: true, limit: 200 });

    assert.ok(unread.length > 0, "the corpus has unread mail matching this term");
    assert.ok(unread.length < all.length, "the corpus also has read mail matching it");
    for (const row of unread) {
      assert.equal(row.viewed, false);
    }
  });

  test("indexes only the pointer, not the content, of a body stashed in R2", async () => {
    // Documents a real limitation rather than pretending it does not exist.
    // An oversized body is replaced in the column by an `r2:...` pointer, so
    // the indexed text is the pointer string — the actual message content
    // lives in R2 and is not searchable at all. If this ever starts failing,
    // the limitation was fixed and AGENTS.md should be updated to match.
    const byPointerText = await searchEmails(db, { query: "oversized" });

    assert.ok(
      byPointerText.some((r) => r.subject === SEARCH_FIXTURES.oversizedPointer.subject),
      "a term from the pointer string reaches the email, because that is what got indexed"
    );

    // The snippet gives it away: it is a storage path, not a sentence of mail.
    // Strip the highlight tags first, since they split the path token.
    const hit = byPointerText.find((r) => r.subject === SEARCH_FIXTURES.oversizedPointer.subject);
    const plainSnippet = hit!.snippet.replace(/<\/?mark>/g, "");
    assert.match(
      plainSnippet,
      /oversized-email-part\//,
      `the snippet for a stashed email exposes the pointer path, got: ${plainSnippet}`
    );
  });

  test("indexed an 800k-character body without overflowing the tsvector limit", async () => {
    // Postgres caps a tsvector at 1MB. The seeder includes a high-entropy body
    // big enough to breach that, so if the search column were not truncated
    // this row could not exist at all.
    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count from emails where "from" = 'overflow@fixtures.test'`;

    assert.equal(row!.count, 1, "the oversized-body fixture must be present and indexable");
  });
});
