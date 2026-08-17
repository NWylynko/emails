import { splitSnippetHighlights } from "./splitSnippetHighlights";

/**
 * Renders a `ts_headline` snippet with its matched terms highlighted.
 *
 * **Never render a snippet with `dangerouslySetInnerHTML`.** `ts_headline`
 * wraps matches in the delimiters it is given but does not escape the document
 * around them, so the snippet still contains raw email body text — attacker
 * controlled, since anyone can send mail to these inboxes. Injecting it as HTML
 * would execute whatever a sender put in a message body.
 *
 * The parsing lives in `splitSnippetHighlights`, which has tests covering the
 * hostile cases. Everything it returns is emitted as a React text node here, so
 * it escapes on the way out.
 */
export function SearchSnippet({ snippet }: { snippet: string }) {
  return (
    <p className="line-clamp-2 text-sm text-gray-600">
      {splitSnippetHighlights(snippet).map((part, index) =>
        part.highlighted ? (
          <mark key={index} className="rounded bg-yellow-200 px-0.5 text-gray-900">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </p>
  );
}
