/**
 * Lightweight markdown → HTML converter for the DeepCitation CLI.
 *
 * Handles the subset of markdown that LLM agents produce:
 * headings, paragraphs, tables, lists (ordered/unordered), bold, italic,
 * inline code, code blocks, links, and horizontal rules.
 *
 * Two output styles:
 * - "plain": Clean HTML with minimal styling
 * - "report": Progressive-disclosure structure with DeepCitation design tokens
 */

import { CDN_JS } from "../vanilla/_generated_cdn.js";
import { escapeJsForScript, escapeJsonForScript, stripExistingInjection } from "../vanilla/reportUtils.js";
import type { VerificationData } from "../vanilla/runtime/types.js";

// ── Types ──────────────────────────────────────────────────────────

export type ReportStyle = "plain" | "report";

export const AUDIENCE_PRESETS = ["general", "executive", "technical", "legal", "medical"] as const;
export type AudiencePreset = (typeof AUDIENCE_PRESETS)[number];

export interface MarkdownToHtmlOptions {
  /** Output style: "plain" (simple HTML) or "report" (progressive disclosure) */
  style?: ReportStyle;
  /** Audience preset — affects width, tier visibility, tone tokens */
  audience?: AudiencePreset;
  /** Optional title override (extracted from first H1 if not provided) */
  title?: string;
  /** Human-readable source label (document name, filename, etc.) */
  sourceLabel?: string;
  /** Source URL — rendered as a clickable link in the report header */
  sourceUrl?: string;
  /** Date the report was generated. Defaults to today (ISO string or locale string). */
  reportDate?: string;
  /** Number of citations analyzed — shown in the header meta strip */
  citationCount?: number;
  /** Number of pages in the source document — shown in the header meta strip */
  pageCount?: number;
  /** Citation anchor map: citation ID → anchorText. When provided, [N] markers
   *  wrap only the anchorText phrase instead of the entire preceding clause. */
  anchorMap?: CitationAnchorMap;
  /** When true, adds an info banner noting that interactive features require
   *  opening the file in a local browser (CDN blocked in Cowork sandbox). */
  cowork?: boolean;
}

// ── Inline formatting ──────────────────────────────────────────────

function inlineFormat(text: string): string {
  return (
    escHtml(text)
      // inline code (before bold/italic to avoid conflicts)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // bold+italic
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      // bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // links — cite:N scheme produces a citation span; http(s) produces a link
      // href is already HTML-escaped from the escHtml() call above; validate
      // the scheme but do not re-escape (that would double-encode & in URLs).
      .replace(/\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
        const citeMatch = href.match(/^cite:(\d+)$/);
        if (citeMatch) {
          return `<span data-cite="${citeMatch[1]}">${label}</span>`;
        }
        const safeHref = /^https?:\/\//i.test(href) ? href : "#";
        return `<a href="${safeHref}">${label}</a>`;
      })
  );
}

// ── Citation marker wrapping ───────────────────────────────────────

/**
 * Citation data lookup passed to wrapCitationMarkers so it can use the
 * anchorText as the clickable display label instead of guessing from
 * surrounding prose.
 */
export interface CitationAnchorMap {
  /** Map from citation number (as string) to the anchorText for that citation */
  [citationId: string]: string;
}

/**
 * Find [N] markers in HTML content and wrap the appropriate text fragment
 * in a <span data-cite="N">. The CDN runtime needs data-cite on inline
 * elements for indicator placement.
 *
 * When `anchorMap` is provided, the anchorText for each citation is used as
 * the clickable display label. The function searches backward in the text
 * before [N] for the anchorText (case-insensitive) and wraps only that
 * occurrence. This produces short, scannable inline citations that match
 * the evidence highlight.
 *
 * Without `anchorMap`, falls back to wrapping the last clause before [N].
 */
export function wrapCitationMarkers(html: string, anchorMap?: CitationAnchorMap): string {
  // Match [N] markers anywhere in text nodes. Excluding `<` and `>` keeps us from
  // consuming HTML tag boundaries; excluding `"` keeps us out of quoted attribute values.
  return html.replace(/([^<>"]*?)\s*\[(\d+)\]/g, (_match, textBefore: string, num: string) => {
    const trimmed = textBefore.trimEnd();
    if (!trimmed) return `<span data-cite="${num}"></span>`;

    // ── Strategy 1: Use anchorText from citation data ─────────────
    // Find the anchorText within the preceding text and wrap only that phrase.
    const anchorText = anchorMap?.[num];
    if (anchorText) {
      const idx = trimmed.toLowerCase().lastIndexOf(anchorText.toLowerCase());
      if (idx >= 0) {
        const before = trimmed.slice(0, idx);
        const matched = trimmed.slice(idx, idx + anchorText.length);
        const after = trimmed.slice(idx + anchorText.length);
        return `${before}<span data-cite="${num}">${matched}</span>${after}`;
      }
      // anchorText not found in text — fall through to heuristic
    }

    // ── Strategy 2: Heuristic — last clause before [N] ───────────
    const clauseMatch = trimmed.match(/(?:[,;–—]\s*)([^,;–—]+)$/);
    const anchor = clauseMatch ? clauseMatch[1].trim() : trimmed;

    // If the anchor is only punctuation (e.g. the [^<"] regex cut off at a
    // literal quote in text content like Schedule "C".), emit an empty span
    // so the CDN shows a superscript indicator instead of wrapping garbage.
    if (!/[a-zA-Z0-9]/.test(anchor)) {
      return `${trimmed}<span data-cite="${num}"></span>`;
    }

    const prefix = clauseMatch
      ? trimmed.slice(0, trimmed.length - clauseMatch[0].length) +
        clauseMatch[0].slice(0, clauseMatch[0].length - anchor.length)
      : "";

    return `${prefix}<span data-cite="${num}">${anchor}</span>`;
  });
}

// ── Block-level parsing ────────────────────────────────────────────

interface Block {
  type: "heading" | "paragraph" | "table" | "code" | "list" | "hr" | "html" | "empty";
  content: string;
  level?: number; // heading level or list nesting
  ordered?: boolean; // for lists
  language?: string; // for code blocks
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // HTML passthrough — if line starts with < and isn't a list marker
    if (/^\s*</.test(line) && !/^\s*<\d/.test(line)) {
      const htmlLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        htmlLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "html", content: htmlLines.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Code block
    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", content: codeLines.join("\n"), language });
      continue;
    }

    // Table (line contains | and next line is a separator)
    if (line.includes("|") && i + 1 < lines.length && /^\|?\s*[-:]+[-|\s:]*$/.test(lines[i + 1])) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "table", content: tableLines.join("\n") });
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && (/^\s*[-*+]\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        listLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "list", ordered: false, content: listLines.join("\n") });
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && (/^\s*\d+[.)]\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        listLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "list", ordered: true, content: listLines.join("\n") });
      continue;
    }

    // Paragraph (collect until empty line or new block)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !lines[i].trim().startsWith("```") &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*</.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join("\n") });
    }
  }

  return blocks;
}

// ── Table rendering ────────────────────────────────────────────────

function renderTable(block: Block): string {
  const rows = block.content.split("\n").filter(r => r.trim());
  if (rows.length < 2) return `<p>${inlineFormat(block.content)}</p>`;

  const parseRow = (row: string) =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map(cell => cell.trim());

  const headerCells = parseRow(rows[0]);
  // rows[1] is the separator, skip it
  const bodyRows = rows.slice(2);

  let html = "<table>\n<thead><tr>";
  for (const cell of headerCells) {
    html += `<th>${inlineFormat(cell)}</th>`;
  }
  html += "</tr></thead>\n<tbody>\n";
  for (const row of bodyRows) {
    html += "<tr>";
    for (const cell of parseRow(row)) {
      html += `<td>${inlineFormat(cell)}</td>`;
    }
    html += "</tr>\n";
  }
  html += "</tbody>\n</table>";
  return html;
}

// ── List rendering ─────────────────────────────────────────────────

function renderList(block: Block): string {
  const tag = block.ordered ? "ol" : "ul";
  const pattern = block.ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
  const items = block.content.split("\n").filter(l => pattern.test(l));

  let html = `<${tag}>\n`;
  for (const item of items) {
    const text = item.replace(pattern, "");
    html += `<li>${inlineFormat(text)}</li>\n`;
  }
  html += `</${tag}>`;
  return html;
}

// ── Block rendering ────────────────────────────────────────────────

function renderBlock(block: Block): string {
  switch (block.type) {
    case "heading":
      return `<h${block.level}>${inlineFormat(block.content)}</h${block.level}>`;
    case "paragraph":
      return `<p>${inlineFormat(block.content)}</p>`;
    case "table":
      return renderTable(block);
    case "code":
      return `<pre><code${block.language ? ` class="language-${escHtml(block.language)}"` : ""}>${escHtml(block.content)}</code></pre>`;
    case "list":
      return renderList(block);
    case "hr":
      return "<hr>";
    case "html":
      return block.content;
    case "empty":
      return "";
  }
}

// ── Style shells ───────────────────────────────────────────────────

// DeepCitation mark: brackets (zinc-900, light surface) contain the spark (blue-700).
// Per BRANDING.md: crispEdges mandatory, square caps, no softness.
const BRAND_LOGO_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 1 L1 1 L1 23 L4 23" stroke="#18181B"/><path d="M20 1 L23 1 L23 23 L20 23" stroke="#18181B"/><path d="M12 6 L12 18 M6 12 L18 12 M7.5 7.5 L16.5 16.5 M16.5 7.5 L7.5 16.5" stroke="#1D4ED8" stroke-width="1.5"/></svg>`;

const AUDIENCE_CONFIG: Record<AudiencePreset, { width: string; tier2Open: boolean }> = {
  general: { width: "960px", tier2Open: true },
  executive: { width: "720px", tier2Open: false },
  technical: { width: "960px", tier2Open: true },
  legal: { width: "840px", tier2Open: true },
  medical: { width: "840px", tier2Open: true },
};

const MONO_FONT = `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`;
const SANS_FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

const BASE_CSS = `  * { margin: 0; padding: 0; box-sizing: border-box; }
  h1 { font-size: 24px; font-weight: 600; }
  h2 { font-size: 18px; font-weight: 600; margin: 2rem 0 0.75rem; border-bottom: 1px solid #E4E4E7; padding-bottom: 0.4rem; }
  h3 { font-size: 16px; font-weight: 600; margin: 1.5rem 0 0.5rem; }
  p { margin: 0.5rem 0; }
  a { color: #0284C7; }
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 14px; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #E4E4E7; }
  th { font-weight: 600; background: #F4F4F5; }
  ul, ol { margin: 0.5rem 0 0.5rem 1.5rem; }
  li { margin: 0.25rem 0; }
  pre { background: #18181B; color: #E4E4E7; padding: 1rem; overflow-x: auto; margin: 0.75rem 0; font-size: 13px; }
  code { font-family: ${MONO_FONT}; font-size: 0.9em; background: #F4F4F5; padding: 1px 4px; }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid #E4E4E7; margin: 1.5rem 0; }
  .meta { color: #52525B; font-size: 14px; margin-bottom: 1.5rem; }
  .dc-cowork-notice {
    display: flex; align-items: flex-start; gap: 0.6rem;
    padding: 0.65rem 0.9rem; margin-bottom: 1rem;
    background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px;
    font-size: 13px; line-height: 1.5; color: #1E40AF;
  }
  .dc-cowork-notice svg { flex-shrink: 0; margin-top: 2px; }`;

function plainShell(title: string, bodyHtml: string, options?: { cowork?: boolean }): string {
  const coworkNotice = options?.cowork
    ? `<div class="dc-cowork-notice">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#3B82F6" stroke-width="1.5"/><path d="M8 7v4M8 5h.01" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round"/></svg>
  <span>Generated in a Claude Cowork session. Citation popovers work normally, but full page views within popovers require opening this file in Chrome or another browser on your local machine.</span>
</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<style>
${BASE_CSS}
  body { font-family: ${SANS_FONT}; max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem; line-height: 1.6; color: #18181B; background: #fff; }
  h1 { margin-bottom: 0.5rem; }
</style>
</head>
<body>
${coworkNotice}
${bodyHtml}
<div data-dc-drawer-trigger></div>
</body>
</html>`;
}

/**
 * Strip scheme from a URL for display: "https://example.com/doc" → "example.com/doc".
 * Port and query/fragment are intentionally omitted for scannability.
 */
function formatSourceUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

/**
 * Build the header meta strip: SOURCE · ANALYZED · AUDIENCE · CITATIONS · PAGES.
 * Only renders items that have data. Date always renders (defaults to today).
 */
function buildMetaStrip(opts: {
  sourceLabel?: string;
  sourceUrl?: string;
  reportDate?: string;
  citationCount?: number;
  pageCount?: number;
  audience: AudiencePreset;
}): string {
  const items: string[] = [];

  // SOURCE — https URLs only (http would trigger mixed-content warnings in browsers)
  const url = opts.sourceUrl && /^https:\/\//i.test(opts.sourceUrl) ? opts.sourceUrl : null;
  const sourceDisplay = url ? formatSourceUrl(url) : opts.sourceLabel;
  if (sourceDisplay) {
    const inner = url
      ? `<a class="dc-meta-link" href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(sourceDisplay)}</a>`
      : `<span class="dc-meta-val">${escHtml(sourceDisplay)}</span>`;
    items.push(`<span class="dc-meta-item"><span class="dc-meta-key">SOURCE</span>${inner}</span>`);
  }

  // ANALYZED — always shown; caller may pass a pre-formatted string
  const date = opts.reportDate
    ? opts.reportDate
    : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  items.push(
    `<span class="dc-meta-item"><span class="dc-meta-key">ANALYZED</span><span class="dc-meta-val">${escHtml(date)}</span></span>`,
  );

  // AUDIENCE — only shown when non-default
  if (opts.audience !== "general") {
    const label = opts.audience.charAt(0).toUpperCase() + opts.audience.slice(1);
    items.push(
      `<span class="dc-meta-item"><span class="dc-meta-key">AUDIENCE</span><span class="dc-meta-val">${escHtml(label)}</span></span>`,
    );
  }

  // CITATIONS
  if (opts.citationCount !== undefined) {
    items.push(
      `<span class="dc-meta-item"><span class="dc-meta-key">CITATIONS</span><span class="dc-meta-val">${opts.citationCount}</span></span>`,
    );
  }

  // PAGES
  if (opts.pageCount !== undefined) {
    items.push(
      `<span class="dc-meta-item"><span class="dc-meta-key">PAGES</span><span class="dc-meta-val">${opts.pageCount}</span></span>`,
    );
  }

  const sep = `<span class="dc-meta-sep"> · </span>`;
  return `<div class="dc-meta">${items.join(sep)}</div>`;
}

function reportShell(
  title: string,
  bodyHtml: string,
  audience: AudiencePreset,
  options: MarkdownToHtmlOptions,
): string {
  const cfg = AUDIENCE_CONFIG[audience];
  const metaStrip = buildMetaStrip({ ...options, audience });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<style>
${BASE_CSS}
  body {
    font-family: ${SANS_FONT};
    max-width: ${cfg.width};
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    line-height: 1.6;
    color: #18181B;
    background: #F8FAFC;
    font-size: 16px;
  }
  h1 { margin-bottom: 0.25rem; }
  a { text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Header meta strip */
  .dc-meta {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.1rem 0;
    margin: 0.5rem 0 1.5rem;
    font-family: ${MONO_FONT}; font-size: 12px; color: #52525B;
  }
  .dc-meta-item { display: inline-flex; align-items: center; gap: 0.5rem; }
  .dc-meta-key { text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; font-size: 11px; }
  .dc-meta-val { color: #334155; }
  .dc-meta-link { color: #0284C7; text-decoration: none; }
  .dc-meta-link:hover { text-decoration: underline; }
  .dc-meta-sep { color: #CBD5E1; margin: 0 0.4rem; }

  /* Verdict banner */
  .dc-verdict {
    display: flex; gap: 1.5rem; padding: 1rem 0;
    border-top: 1px solid #E4E4E7; border-bottom: 1px solid #E4E4E7;
    font-family: ${MONO_FONT}; font-size: 14px;
    margin-bottom: 1.5rem;
  }
  .dc-verdict .v-found  { color: #10B981; }
  .dc-verdict .v-partial { color: #D97706; }
  .dc-verdict .v-miss   { color: #EF4444; }

  /* Table overrides — §6.1 Anti-Grid: no header fill, heavier separators, blue row hover */
  th, td { border-bottom: 1px solid #94A3B8; }
  th { font-size: 12px; font-weight: 500; background: none; color: #52525B; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid #94A3B8; }
  tbody tr:hover { background: #EFF6FF; }

  /* Code overrides */
  pre { line-height: 1.7; }
  code { padding: 1px 5px; }

  /* Progressive disclosure */
  details { margin: 0.75rem 0; }
  summary {
    cursor: pointer; font-weight: 500; font-size: 14px; color: #52525B;
    padding: 0.5rem 0; user-select: none;
  }
  summary:hover { color: #18181B; }

  /* Cards */
  .dc-section { background: #fff; border: 1px solid #E4E4E7; padding: 1.25rem; margin: 1rem 0; }

  /* Mono metrics */
  .mono { font-family: ${MONO_FONT}; font-size: 14px; font-weight: 500; }

  /* Branding footer */
  .dc-footer {
    margin-top: 3rem; padding-top: 1rem;
    border-top: 1px solid #E4E4E7;
    font-size: 12px; color: #A1A1AA;
    display: flex; align-items: center; gap: 0.5rem;
  }
  .dc-footer a { color: #A1A1AA; text-decoration: none; }
  .dc-footer a:hover { color: #52525B; text-decoration: underline; }
  .dc-footer svg { flex-shrink: 0; }

  /* Cowork environment notice */
  .dc-cowork-notice {
    display: flex; align-items: flex-start; gap: 0.6rem;
    padding: 0.65rem 0.9rem;
    margin-bottom: 1rem;
    background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px;
    font-size: 13px; line-height: 1.5; color: #1E40AF;
  }
  .dc-cowork-notice svg { flex-shrink: 0; margin-top: 2px; }
</style>
</head>
<body>
<header>
  <h1>${escHtml(title)}</h1>
  ${metaStrip}
</header>
${
  options.cowork
    ? `<div class="dc-cowork-notice">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#3B82F6" stroke-width="1.5"/><path d="M8 7v4M8 5h.01" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round"/></svg>
  <span>Generated in a Claude Cowork session. Citation popovers work normally, but full page views within popovers require opening this file in Chrome or another browser on your local machine.</span>
</div>`
    : ""
}
<div class="dc-verdict" id="dc-verdict"></div>
${bodyHtml}
<footer class="dc-footer">
  ${BRAND_LOGO_SVG}
  <span>Verified by <a href="https://deepcitation.com" target="_blank" rel="noopener">DeepCitation</a></span>
</footer>
<div data-dc-drawer-trigger></div>
</body>
</html>`;
}

// ── Utilities ──────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Main conversion ────────────────────────────────────────────────

/**
 * Convert markdown content (without <<<CITATION_DATA>>> block) to HTML.
 * Returns a full HTML document with the chosen style shell.
 */
export function markdownToHtml(markdown: string, options: MarkdownToHtmlOptions = {}): string {
  const { style = "report", audience = "general" } = options;

  const blocks = parseBlocks(markdown);

  // Caller-provided title takes precedence; fall back to first H1, then default.
  const firstH1 = blocks.find(b => b.type === "heading" && b.level === 1);
  const title = options.title ?? firstH1?.content ?? "Verification Report";

  // Render blocks to HTML body
  let bodyParts: string[];

  if (style === "report") {
    bodyParts = buildReportBody(blocks, audience);
  } else {
    bodyParts = blocks.map(renderBlock);
  }

  let bodyHtml = bodyParts.join("\n");

  // Wrap [N] citation markers in <span data-cite="N">.
  // When anchorMap is available, the anchorText becomes the clickable display
  // label — producing short inline citations that match the evidence highlight.
  bodyHtml = wrapCitationMarkers(bodyHtml, options.anchorMap);

  if (style === "report") {
    return reportShell(title, bodyHtml, audience, options);
  }
  return plainShell(title, bodyHtml, { cowork: options.cowork });
}

// ── Report body builder (progressive disclosure) ───────────────────

function buildReportBody(blocks: Block[], audience: AudiencePreset): string[] {
  const cfg = AUDIENCE_CONFIG[audience];
  const parts: string[] = [];

  // Split blocks into sections by H2
  const sections: { heading?: Block; blocks: Block[] }[] = [];
  let current: { heading?: Block; blocks: Block[] } = { blocks: [] };

  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      if (current.heading || current.blocks.length > 0) {
        sections.push(current);
      }
      current = { heading: block, blocks: [] };
    } else {
      current.blocks.push(block);
    }
  }
  if (current.heading || current.blocks.length > 0) {
    sections.push(current);
  }

  // Tier 1: preamble (everything before first H2) — always visible
  if (sections.length > 0 && !sections[0].heading) {
    const preamble = sections.shift()!;
    // Skip the H1 (already in shell header)
    for (const b of preamble.blocks) {
      if (b.type === "heading" && b.level === 1) continue;
      parts.push(renderBlock(b));
    }
  }

  // Find "key findings" section (first section, or one with "finding" / "summary" in title)
  const findingsIdx = sections.findIndex(s => s.heading && /finding|summary|overview|key\s/i.test(s.heading.content));

  if (findingsIdx >= 0) {
    const findings = sections.splice(findingsIdx, 1)[0];
    parts.push(renderBlock(findings.heading!));
    for (const b of findings.blocks) {
      parts.push(renderBlock(b));
    }
  }

  // Tier 2: remaining main sections
  if (sections.length > 0) {
    const tier2Open = cfg.tier2Open ? " open" : "";
    parts.push(`<details${tier2Open}>`);
    parts.push(`<summary>Full Report (${sections.length} sections)</summary>`);

    for (const section of sections) {
      if (section.heading) parts.push(renderBlock(section.heading));
      for (const b of section.blocks) {
        parts.push(renderBlock(b));
      }
    }

    parts.push("</details>");
  }

  return parts;
}

// ── CDN showcase fixture ───────────────────────────────────────────

const CDN_SHOWCASE_MARKDOWN = `# CDN Comparison Showcase

This fixture is generated from \`markdownToHtml()\` plus a small mock verification map.

## Inline citations

The policy of separating the races is usually interpreted as denoting the [inferiority of the negro group](cite:1).
Revenue reached [$2.3 billion](cite:2), and the FDA noted [Phase III completion](cite:3).

## Drawer trigger

The drawer below is injected by the CDN runtime and uses the same mock data as the inline citations.
`;

const CDN_SHOWCASE_IMAGE_URL = "/src/vanilla/testing/demo-page.png";

const CDN_SHOWCASE_VERIFICATIONS: Record<string, VerificationData> = {
  "demo-citation-1": {
    status: "verified",
    label: "Brown v. Board of Education, 347 U.S. 483 (1954)",
    verifiedFullPhrase:
      "the policy of separating the races is usually interpreted as denoting the inferiority of the negro group",
    verifiedAnchorText: "inferiority of the negro group",
    citation: {
      type: "document",
      fullPhrase:
        "the policy of separating the races is usually interpreted as denoting the inferiority of the negro group",
      anchorText: "inferiority of the negro group",
    },
    document: {
      verifiedPageNumber: 1,
      mimeType: "application/pdf",
    },
    pageImages: [
      {
        pageNumber: 1,
        dimensions: { width: 1200, height: 1600 },
        imageUrl: CDN_SHOWCASE_IMAGE_URL,
        isMatchPage: true,
      },
    ],
  },
  "demo-citation-2": {
    status: "partial_match",
    label: "Q4 Financial Report",
    verifiedFullPhrase:
      "Total revenue reached $2.3 billion for the fiscal year, representing a 45% increase year-over-year",
    verifiedAnchorText: "$2.3 billion",
    verifiedMatchSnippet: "Total revenue reached $2.3 billion for the fiscal year",
    citation: {
      type: "document",
      fullPhrase: "Total revenue reached $2.3 billion for the fiscal year",
      anchorText: "$2.3 billion",
    },
    document: {
      verifiedPageNumber: 1,
      mimeType: "application/pdf",
    },
    pageImages: [
      {
        pageNumber: 1,
        dimensions: { width: 1200, height: 1600 },
        imageUrl: CDN_SHOWCASE_IMAGE_URL,
        isMatchPage: true,
      },
    ],
  },
  "demo-citation-3": {
    status: "verified",
    label: "FDA Clinical Trial Guidance 2024",
    verifiedFullPhrase: "Phase III clinical trial completed enrollment with 2,400 participants across 15 sites",
    verifiedAnchorText: "Phase III completion",
    citation: {
      type: "document",
      fullPhrase: "Phase III clinical trial completed enrollment",
      anchorText: "Phase III completion",
    },
    document: {
      verifiedPageNumber: 1,
      mimeType: "application/pdf",
    },
    pageImages: [
      {
        pageNumber: 1,
        dimensions: { width: 1200, height: 1600 },
        imageUrl: CDN_SHOWCASE_IMAGE_URL,
        isMatchPage: true,
      },
    ],
  },
};

const CDN_SHOWCASE_KEY_MAP: Record<string, string> = {
  "cite-1": "demo-citation-1",
  "cite-2": "demo-citation-2",
  "cite-3": "demo-citation-3",
};

const CDN_SHOWCASE_ANCHOR_MAP: CitationAnchorMap = {
  1: "inferiority of the negro group",
  2: "$2.3 billion",
  3: "Phase III completion",
};

function injectCdnRuntime(
  html: string,
  verifications: Record<string, VerificationData>,
  keyMap: Record<string, string>,
) {
  const jsonData = escapeJsonForScript(JSON.stringify(verifications));
  const keyMapJson = escapeJsonForScript(JSON.stringify(keyMap));
  const snippet = [
    `<script type="application/json" id="dc-data">${jsonData}</script>`,
    `<script type="application/json" id="dc-key-map">${keyMapJson}</script>`,
    `<script>${escapeJsForScript(CDN_JS)}</script>`,
    `<script>window.DeepCitationPopover&&window.DeepCitationPopover.init({theme:"light",indicatorVariant:"icon"});</script>`,
  ].join("\n");

  const stripped = stripExistingInjection(html);
  let output = stripped.html;
  if (output.includes("</body>")) {
    output = output.replace("</body>", () => `${snippet}\n</body>`);
  } else if (output.includes("</html>")) {
    output = output.replace("</html>", () => `${snippet}\n</html>`);
  } else {
    output = `${output}\n${snippet}`;
  }
  return output;
}

export function buildCdnComparisonShowcaseHtml(): string {
  const html = markdownToHtml(CDN_SHOWCASE_MARKDOWN, {
    style: "report",
    title: "DeepCitation — CDN Comparison Showcase",
    sourceLabel: "DeepCitation mock fixture",
    citationCount: Object.keys(CDN_SHOWCASE_KEY_MAP).length,
    pageCount: 1,
    anchorMap: CDN_SHOWCASE_ANCHOR_MAP,
  });
  return injectCdnRuntime(html, CDN_SHOWCASE_VERIFICATIONS, CDN_SHOWCASE_KEY_MAP);
}
