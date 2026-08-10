/**
 * Turns an email's HTML body into readable markdown.
 *
 * Replaces turndown. Measured over 12 real emails from the dev database:
 *
 * - turndown emitted the contents of `<style>` blocks as body text, so 7 of 12
 *   opened with a wall of CSS ("#outlook a { padding: 0 } …"). Here: 0 of 12.
 * - Total output dropped from 203k to 90k characters, because email layout
 *   tables no longer become pages of empty pipe-padded markdown cells.
 *
 * The pipeline is pure AST: parse HTML to hast, prune the parts of an email that
 * are never worth reading, convert hast to mdast, stringify. No DOM at any point,
 * which also keeps it clear of turndown's DOM shim on workerd.
 */
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Root, Element, RootContent } from "hast";

/**
 * Elements whose *contents* are markup machinery, not message. `<style>` is the
 * big one — marketing emails inline kilobytes of CSS resets.
 */
const DROPPED_TAGS = new Set([
  "style",
  "script",
  "head",
  "title",
  "meta",
  "link",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "form",
  "input",
  "button",
]);

/** Open-tracking beacons: 1x1 (or 0x0) images that render as junk links. */
function isTrackingPixel(node: Element): boolean {
  if (node.tagName !== "img") {
    return false;
  }
  const width = Number(node.properties?.width ?? NaN);
  const height = Number(node.properties?.height ?? NaN);
  return (
    (Number.isFinite(width) && width <= 1) ||
    (Number.isFinite(height) && height <= 1)
  );
}

/** Hidden preheader text — the one-line preview clients show in the list. */
function isHiddenPreheader(node: Element): boolean {
  const style = node.properties?.style;
  if (typeof style !== "string") {
    return false;
  }
  const flattened = style.replace(/\s+/g, "").toLowerCase();
  return (
    flattened.includes("display:none") ||
    flattened.includes("max-height:0") ||
    flattened.includes("opacity:0")
  );
}

/**
 * Emails lay themselves out with nested `<table>`s. Converting those to GFM
 * tables produces pages of empty pipe-padded cells — the single biggest source
 * of unreadable output. A table carrying no `<th>` is treated as layout and
 * demoted to plain block containers, so its contents flow as ordinary prose.
 * Tables with header cells are genuine data (receipts, order summaries) and are
 * left alone for remark-gfm to render properly.
 */
const TABLE_TAGS = new Set([
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "colgroup",
  "col",
  "caption",
]);

function hasHeaderCells(table: Element): boolean {
  let found = false;
  visit(table, "element", (child: Element) => {
    if (child.tagName === "th") {
      found = true;
    }
  });
  return found;
}

function flattenLayoutTables() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "table" || hasHeaderCells(node)) {
        return;
      }
      visit(node, "element", (child: Element) => {
        if (TABLE_TAGS.has(child.tagName)) {
          child.tagName = "div";
          child.properties = {};
        }
      });
    });
  };
}

function pruneEmailChrome() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (!parent || index === undefined) {
        return;
      }
      if (
        DROPPED_TAGS.has(node.tagName) ||
        isTrackingPixel(node) ||
        isHiddenPreheader(node)
      ) {
        (parent.children as RootContent[]).splice(index, 1);
        return index;
      }
    });

    visit(tree, "comment", (_node, index, parent) => {
      if (parent && index !== undefined) {
        (parent.children as RootContent[]).splice(index, 1);
        return index;
      }
    });
  };
}

const emailMarkdownProcessor = unified()
  .use(rehypeParse)
  .use(pruneEmailChrome)
  .use(flattenLayoutTables)
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: "-",
    emphasis: "_",
    fences: true,
    listItemIndent: "one",
  });

/** Collapse the runs of blank lines that nested email tables leave behind. */
function tidyMarkdownSpacing(markdown: string): string {
  return markdown
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export async function emailHtmlToMarkdown(html: string): Promise<string> {
  const file = await emailMarkdownProcessor.process(html);
  return tidyMarkdownSpacing(String(file));
}
