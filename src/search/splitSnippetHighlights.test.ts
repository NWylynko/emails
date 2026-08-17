import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { splitSnippetHighlights } from "./splitSnippetHighlights.ts";

describe("splitSnippetHighlights", () => {
  test("splits a snippet into plain and highlighted runs", () => {
    assert.deepEqual(splitSnippetHighlights("your <mark>code</mark> is 1234"), [
      { text: "your ", highlighted: false },
      { text: "code", highlighted: true },
      { text: " is 1234", highlighted: false },
    ]);
  });

  test("handles several highlights and adjacent markers", () => {
    assert.deepEqual(splitSnippetHighlights("<mark>a</mark><mark>b</mark> c"), [
      { text: "a", highlighted: true },
      { text: "b", highlighted: true },
      { text: " c", highlighted: false },
    ]);
  });

  test("returns a single plain run when nothing matched", () => {
    assert.deepEqual(splitSnippetHighlights("no highlights here"), [
      { text: "no highlights here", highlighted: false },
    ]);
  });

  test("returns nothing for an empty snippet", () => {
    assert.deepEqual(splitSnippetHighlights(""), []);
  });

  test("spans line breaks", () => {
    const parts = splitSnippetHighlights("before <mark>two\nlines</mark> after");

    assert.equal(parts[1]!.text, "two\nlines");
    assert.equal(parts[1]!.highlighted, true);
  });

  test("leaves HTML from the email body as inert text", () => {
    // The critical case. A sender can put anything in a message body, and
    // ts_headline does not escape it. This must come back as text to be
    // rendered as a React text node — never markup, and never treated as a
    // highlight just because it contains angle brackets.
    const hostile = `<script>alert('xss')</script> and <img src=x onerror=alert(1)> <mark>hit</mark>`;
    const parts = splitSnippetHighlights(hostile);

    assert.deepEqual(parts, [
      {
        text: "<script>alert('xss')</script> and <img src=x onerror=alert(1)> ",
        highlighted: false,
      },
      { text: "hit", highlighted: true },
    ]);

    // Nothing was stripped or interpreted: every part is plain text that React
    // will escape on render.
    assert.equal(parts.map((p) => p.text).join(""), hostile.replace(/<\/?mark>/g, ""));
  });

  test("a sender writing their own <mark> tags can only fake a highlight", () => {
    // Cosmetic worst case, not an injection: the text still renders as text.
    const parts = splitSnippetHighlights("body says <mark>fake</mark> highlight");

    assert.equal(parts.filter((p) => p.highlighted).length, 1);
    assert.equal(parts.find((p) => p.highlighted)!.text, "fake");
  });
});
