/**
 * Splits a `ts_headline` snippet into plain and highlighted runs.
 *
 * Kept apart from the component that renders it so it can be tested directly,
 * because this is the security-sensitive half. A snippet contains raw email
 * body text — attacker controlled, since anyone can send mail to these
 * inboxes — and `ts_headline` escapes none of it. The output of this function
 * must therefore be rendered as React text nodes, never as HTML.
 *
 * The only markup it recognises is the `<mark>` delimiters Postgres was asked
 * to insert. Everything else, including any HTML a sender put in their message,
 * stays inert text.
 */
export type SnippetPart = {
  text: string;
  highlighted: boolean;
};

// `[\s\S]` rather than `.` with the `s` flag: a snippet spans line breaks, and
// the dotAll flag needs a higher `target` than this project compiles with.
const HIGHLIGHT_PATTERN = /<mark>([\s\S]*?)<\/mark>/g;

export function splitSnippetHighlights(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let lastIndex = 0;

  for (const match of snippet.matchAll(HIGHLIGHT_PATTERN)) {
    if (match.index > lastIndex) {
      parts.push({ text: snippet.slice(lastIndex, match.index), highlighted: false });
    }

    parts.push({ text: match[1]!, highlighted: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < snippet.length) {
    parts.push({ text: snippet.slice(lastIndex), highlighted: false });
  }

  return parts;
}
