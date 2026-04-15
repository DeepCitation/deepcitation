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

import { escapeHtml } from "../utils/htmlEscape.js";
import { CDN_JS } from "../vanilla/_generated_cdn.js";
import { escapeJsForScript, escapeJsonForScript, stripExistingInjection } from "../vanilla/reportUtils.js";
import type { VerificationData } from "../vanilla/runtime/types.js";

// ── Types ──────────────────────────────────────────────────────────

export type ReportStyle = "plain" | "report";

export interface MarkdownToHtmlOptions {
  /** Output style: "plain" (simple HTML) or "report" (progressive disclosure) */
  style?: ReportStyle;
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
  /** Citation anchor map: citation ID → sourceMatch. When provided, [N] markers
   *  wrap only the sourceMatch phrase instead of the entire preceding clause. */
  sourceMatchMap?: CitationSourceMatchMap;
  /** When true, adds an info banner noting that interactive features require
   *  opening the file in a local browser (CDN blocked in Cowork sandbox). */
  cowork?: boolean;
  /** The claim or question being verified. Rendered as a quoted card
   *  between the H1 and the meta strip. Supports inline markdown
   *  (bold/italic/code). Whitespace-only values are ignored. */
  claim?: string;
  /** Human-readable name of the model that performed the verification
   *  (e.g. "Claude Haiku 4.5"). Surfaced as a MODEL item in the meta
   *  strip, ordered between ANALYZED and CITATIONS. */
  model?: string;
}

// ── Inline formatting ──────────────────────────────────────────────

function inlineFormat(text: string): string {
  // Strip NUL bytes — we use \x00 as placeholder delimiters below.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — NUL is a collision-safe placeholder delimiter
  text = text.replace(/\x00/g, "");
  // Extract cite links BEFORE escapeHtml — title strings contain quotes and parens
  // that escapeHtml would encode, breaking the regex. We replace cite links with
  // placeholder tokens, escape the rest, then restore them.
  const citePlaceholders: string[] = [];
  let withPlaceholders = text.replace(
    /\[([^\][]+)\]\(cite:(\d+)(?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?\s*\)/g,
    (_m, label: string, id: string) => {
      const idx = citePlaceholders.length;
      const labelHtml = escapeHtml(label)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
      citePlaceholders.push(`<span data-cite="${id}">${labelHtml}</span>`);
      return `\x00CITE${idx}\x00`;
    },
  );

  // Strategy 2c: **bold text** [N] markers — extract before escapeHtml so the
  // <strong> tags don't break wrapCitationMarkers' [^<>"] regex.
  withPlaceholders = withPlaceholders.replace(/\*\*([^*]+)\*\*\s*\[(\d+)\]/g, (_m, label: string, id: string) => {
    const idx = citePlaceholders.length;
    citePlaceholders.push(`<span data-cite="${id}"><strong>${escapeHtml(label)}</strong></span>`);
    return `\x00CITE${idx}\x00`;
  });

  let result = escapeHtml(withPlaceholders)
    // inline code (before bold/italic to avoid conflicts)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // bold+italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    // bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // general links — http(s) produces a link; anything else gets "#"
    .replace(/\[([^[\]]*)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
      const safeHref = /^https?:\/\//i.test(href) ? href : "#";
      return `<a href="${safeHref}">${label}</a>`;
    });

  // Restore cite placeholders
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — NUL is a collision-safe placeholder delimiter
  result = result.replace(/\x00CITE(\d+)\x00/g, (_m, idx: string) => citePlaceholders[parseInt(idx, 10)]);
  return result;
}

// ── Citation marker wrapping ───────────────────────────────────────

/**
 * Citation data lookup passed to wrapCitationMarkers so it can use the
 * sourceMatch as the clickable display label instead of guessing from
 * surrounding prose.
 */
export interface CitationSourceMatchMap {
  /** Map from citation number (as string) to the sourceMatch for that citation */
  [citationId: string]: string;
}

/**
 * Find [N] markers in HTML content and wrap the appropriate text fragment
 * in a <span data-cite="N">. The CDN runtime needs data-cite on inline
 * elements for indicator placement.
 *
 * When `sourceMatchMap` is provided, the sourceMatch for each citation is used as
 * the clickable display label. The function searches backward in the text
 * before [N] for the sourceMatch (case-insensitive) and wraps only that
 * occurrence. This produces short, scannable inline citations that match
 * the evidence highlight.
 *
 * Without `sourceMatchMap`, falls back to wrapping the last clause before [N].
 */
export function wrapCitationMarkers(html: string, sourceMatchMap?: CitationSourceMatchMap): string {
  // Match [N] markers anywhere in text nodes. Excluding `<` and `>` keeps us from
  // consuming HTML tag boundaries; excluding `"` keeps us out of quoted attribute values.
  return html.replace(/([^<>"]*?)\s*\[(\d+)\]/g, (_match, textBefore: string, num: string) => {
    const trimmed = textBefore.trimEnd();
    if (!trimmed) return `<span data-cite="${num}"></span>`;

    // ── Strategy 1: Use sourceMatch from citation data ─────────────
    // Find the sourceMatch within the preceding text and wrap only that phrase.
    const sourceMatch = sourceMatchMap?.[num];
    if (sourceMatch) {
      const idx = trimmed.toLowerCase().lastIndexOf(sourceMatch.toLowerCase());
      if (idx >= 0) {
        const before = trimmed.slice(0, idx);
        const matched = trimmed.slice(idx, idx + sourceMatch.length);
        const after = trimmed.slice(idx + sourceMatch.length);
        return `${before}<span data-cite="${num}">${matched}</span>${after}`;
      }
      // sourceMatch not found in text — fall through to heuristic
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
      return `<pre><code${block.language ? ` class="language-${escapeHtml(block.language)}"` : ""}>${escapeHtml(block.content)}</code></pre>`;
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

const FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-linecap="square" stroke-linejoin="miter" shape-rendering="crispEdges" width="24" height="24"><path d="M4 1 L1 1 L1 23 L4 23" stroke="#A1A1AA" stroke-width="1"/><path d="M20 1 L23 1 L23 23 L20 23" stroke="#A1A1AA" stroke-width="1"/><path d="M5.5 12 L18.5 12" stroke="#3B82F6" stroke-width="1.8"/><path d="M12 5.5 L12 18.5" stroke="#3B82F6" stroke-width="1.8"/><path d="M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5" stroke="#3B82F6" stroke-width="2.35"/></svg>')}`;

const MONO_FONT = `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`;
const SANS_FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

// CSS custom-property defaults injected into every <style> block.
// Generated HTML is self-contained; hosts can override via :root {}.
const DC_ROOT_TOKENS = `  :root {
    --dc-background: #ffffff;
    --dc-muted: #f4f4f5;
    --dc-foreground: #18181b;
    --dc-muted-foreground: #71717a;
    --dc-subtle-foreground: #a1a1aa;
    --dc-border: #e4e4e7;
    --dc-primary: #3b82f6;
    --dc-primary-foreground: #ffffff;
    --dc-verified: #10b981;
    --dc-partial: #f59e0b;
    --dc-destructive: #ef4444;
    --dc-verified-bg: #f0fdf4;
    --dc-partial-bg: #fffbeb;
    --dc-destructive-bg: #fef2f2;
    --dc-radius-sm: 0.25rem;
    --dc-radius-md: 0.375rem;
    --dc-radius-lg: 0.5rem;
    --dc-font-family: ${SANS_FONT};
    --dc-font-family-mono: ${MONO_FONT};
  }`;

const BASE_CSS = `  * { margin: 0; padding: 0; box-sizing: border-box; }
  h1 { font-size: 24px; font-weight: 600; }
  h2 { font-size: 18px; font-weight: 600; margin: 2rem 0 0.75rem; border-bottom: 1px solid var(--dc-border); padding-bottom: 0.4rem; }
  h3 { font-size: 16px; font-weight: 600; margin: 1.5rem 0 0.5rem; }
  p { margin: 0.5rem 0; }
  [data-cite] strong { font-weight: 600; }
  a { color: var(--dc-primary); }
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 14px; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--dc-border); }
  th { font-weight: 600; background: var(--dc-muted); }
  ul, ol { margin: 0.5rem 0 0.5rem 1.5rem; }
  li { margin: 0.25rem 0; }
  pre { background: var(--dc-foreground); color: var(--dc-border); padding: 1rem; overflow-x: auto; margin: 0.75rem 0; font-size: 13px; }
  code { font-family: var(--dc-font-family-mono); font-size: 0.9em; background: var(--dc-muted); padding: 1px 4px; }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid var(--dc-border); margin: 1.5rem 0; }
  .meta { color: var(--dc-muted-foreground); font-size: 14px; margin-bottom: 1.5rem; }
  .dc-cowork-notice {
    display: flex; align-items: flex-start; gap: 0.6rem;
    padding: 0.65rem 0.9rem; margin-bottom: 1rem;
    background: var(--dc-muted); border: 1px solid var(--dc-border);
    font-size: 13px; line-height: 1.5; color: var(--dc-foreground);
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
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<title>${escapeHtml(title)}</title>
<style>
${DC_ROOT_TOKENS}
${BASE_CSS}
  body { font-family: var(--dc-font-family); max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem; line-height: 1.6; color: var(--dc-foreground); background: var(--dc-background); }
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
 * Build the header meta strip: SOURCE · ANALYZED · CITATIONS · PAGES.
 * Only renders items that have data. Date always renders (defaults to today).
 */
function buildMetaStrip(opts: {
  sourceLabel?: string;
  sourceUrl?: string;
  reportDate?: string;
  citationCount?: number;
  pageCount?: number;
  model?: string;
}): string {
  const items: string[] = [];

  // SOURCE — https URLs only (http would trigger mixed-content warnings in browsers)
  const url = opts.sourceUrl && /^https:\/\//i.test(opts.sourceUrl) ? opts.sourceUrl : null;
  const sourceDisplay = url ? formatSourceUrl(url) : opts.sourceLabel;
  if (sourceDisplay) {
    const inner = url
      ? `<a class="dc-meta-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(sourceDisplay)}</a>`
      : `<span class="dc-meta-val">${escapeHtml(sourceDisplay)}</span>`;
    items.push(`<span class="dc-meta-item"><span class="dc-meta-key">SOURCE</span>${inner}</span>`);
  }

  // ANALYZED — always shown; caller may pass a pre-formatted string
  const date = opts.reportDate
    ? opts.reportDate
    : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  items.push(
    `<span class="dc-meta-item"><span class="dc-meta-key">ANALYZED</span><span class="dc-meta-val">${escapeHtml(date)}</span></span>`,
  );

  // MODEL — only shown when provided
  if (opts.model) {
    items.push(
      `<span class="dc-meta-item"><span class="dc-meta-key">MODEL</span><span class="dc-meta-val">${escapeHtml(opts.model)}</span></span>`,
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

function reportShell(title: string, bodyHtml: string, options: MarkdownToHtmlOptions): string {
  const cfg = { width: "960px", tier2Open: true };
  const metaStrip = buildMetaStrip(options);

  const claimText = options.claim?.trim();
  const claimCard = claimText
    ? `<div class="dc-claim" role="note" aria-label="Claim under verification">
<span class="dc-claim-label">CLAIM</span>
<blockquote class="dc-claim-text">${inlineFormat(claimText)}</blockquote>
</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<title>${escapeHtml(title)}</title>
<style>
${DC_ROOT_TOKENS}
${BASE_CSS}
  body {
    font-family: var(--dc-font-family);
    max-width: ${cfg.width};
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    line-height: 1.6;
    color: var(--dc-foreground);
    background: var(--dc-muted);
    font-size: 16px;
  }
  h1 { margin-bottom: 0.25rem; }
  a { text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Header meta strip */
  .dc-meta {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.1rem 0;
    margin: 0.5rem 0 1.5rem;
    font-family: var(--dc-font-family-mono); font-size: 12px; color: var(--dc-muted-foreground);
  }
  .dc-meta-item { display: inline-flex; align-items: center; gap: 0.5rem; }
  .dc-meta-key { text-transform: uppercase; letter-spacing: 0.06em; color: var(--dc-subtle-foreground); font-size: 11px; }
  .dc-meta-val { color: var(--dc-foreground); }
  .dc-meta-link { color: var(--dc-primary); text-decoration: none; }
  .dc-meta-link:hover { text-decoration: underline; }
  .dc-meta-sep { color: var(--dc-border); margin: 0 0.4rem; }

  /* Verdict banner */
  .dc-verdict {
    display: flex; gap: 1.5rem; padding: 1rem 0;
    border-top: 1px solid var(--dc-border); border-bottom: 1px solid var(--dc-border);
    font-family: var(--dc-font-family-mono); font-size: 14px;
    margin-bottom: 1.5rem;
  }
  .dc-verdict .v-found  { color: var(--dc-verified); }
  .dc-verdict .v-partial { color: var(--dc-partial); }
  .dc-verdict .v-miss   { color: var(--dc-destructive); }

  /* Table overrides — §6.1 Anti-Grid: no header fill, heavier separators, blue row hover */
  th, td { border-bottom: 1px solid var(--dc-subtle-foreground); }
  th { font-size: 12px; font-weight: 500; background: none; color: var(--dc-muted-foreground); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid var(--dc-subtle-foreground); }
  tbody tr:hover { background: var(--dc-muted); }

  /* Code overrides */
  pre { line-height: 1.7; }
  code { padding: 1px 5px; }

  /* Progressive disclosure */
  details { margin: 0.75rem 0; }
  summary {
    cursor: pointer; font-weight: 500; font-size: 14px; color: var(--dc-muted-foreground);
    padding: 0.5rem 0; user-select: none;
  }
  summary:hover { color: var(--dc-foreground); }

  /* Cards */
  .dc-section { background: var(--dc-background); border: 1px solid var(--dc-border); padding: 1.25rem; margin: 1rem 0; }

  /* Mono metrics */
  .mono { font-family: var(--dc-font-family-mono); font-size: 14px; font-weight: 500; }

  /* Branding footer */
  .dc-footer {
    margin-top: 3rem; padding-top: 1rem;
    border-top: 1px solid var(--dc-border);
    font-size: 12px; color: var(--dc-subtle-foreground);
    display: flex; align-items: center; gap: 0.5rem;
  }
  .dc-footer a { color: var(--dc-subtle-foreground); text-decoration: none; }
  .dc-footer a:hover { color: var(--dc-muted-foreground); text-decoration: underline; }
  .dc-footer svg { flex-shrink: 0; }

  /* Cowork environment notice */
  .dc-cowork-notice {
    display: flex; align-items: flex-start; gap: 0.6rem;
    padding: 0.65rem 0.9rem;
    margin-bottom: 1rem;
    background: var(--dc-muted); border: 1px solid var(--dc-border);
    font-size: 13px; line-height: 1.5; color: var(--dc-foreground);
  }
  .dc-cowork-notice svg { flex-shrink: 0; margin-top: 2px; }

  /* Claim card — eyebrow label + quoted thesis */
  .dc-claim {
    margin: 0.75rem 0 1rem;
    padding: 0.9rem 1.1rem;
    background: var(--dc-muted);
    border: 1px solid var(--dc-border);
    border-left: 3px solid var(--dc-foreground);
  }
  .dc-claim-label {
    display: block;
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--dc-muted-foreground);
    margin-bottom: 0.35rem;
  }
  .dc-claim-text {
    margin: 0;
    padding: 0;
    border: none;
    font-family: inherit;
    font-size: 17px;
    line-height: 1.55;
    color: var(--dc-foreground);
    font-weight: 450;
    max-width: 65ch;
  }
  .dc-claim-text strong { font-weight: 600; }
  .dc-claim-text em { font-style: italic; }
  @media print {
    .dc-claim { background: var(--dc-background); border-color: var(--dc-border); border-left-color: var(--dc-foreground); }
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  ${claimCard}
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

// ── Review variants (layout exploration) ─────────────────────────
//
// Four alternate LAYOUTS applied over the main report HTML as a post-
// processing step. Each variant fully replaces the author-controlled
// <style>…</style> block in the output HTML, preserving body markup and
// the CDN runtime injection so citation popovers still work for review.
//
// All variants share the numbered-outline counter system (CSS counters
// in a left gutter) as their structural backbone — the most literal
// expression of FileLasso v2.1 "structure without walls". They diverge
// on the property each one optimizes for:
//
//   numbered-outline → the structural baseline, kept as-is
//   reviewer-console → USABILITY (active review: sticky verdict, scan affordances)
//   briefing-card    → SHAREABILITY (screenshot/PDF/social: self-contained hero)
//   marginalia       → MEMORABILITY (distinctive bracket + spine motif)
//
// All four use the --dc-* token system and system font stack per SDK BRANDING.md.

interface ReviewVariant {
  slug: string;
  label: string;
  description: string;
  css: string;
}

// Structural defaults shared by every variant: reset, citation rule, table
// primitives, code, horizontal rules, details/summary, verdict colors, and
// the cowork notice SVG positioning. Each variant appends its own layout-
// specific rules after this block, so the cascade lets variants override
// anything they need without repeating the basics.
const REVIEW_SHARED_BASE_CSS = `  * { margin: 0; padding: 0; box-sizing: border-box; }
  h1, h2, h3 { color: var(--dc-foreground); }
  p { margin: 0.65rem 0; }
  a { color: var(--dc-primary); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--dc-primary) 35%, transparent); text-underline-offset: 2px; }
  a:hover { text-decoration-color: var(--dc-primary); }
  [data-cite] strong { font-weight: 500; color: var(--dc-primary); }
  ul, ol { margin: 0.6rem 0 0.6rem 1.5rem; }
  li { margin: 0.3rem 0; }
  pre { background: var(--dc-muted); color: var(--dc-foreground); padding: 1rem 1.15rem; overflow-x: auto; margin: 1rem 0; font-size: 13px; line-height: 1.7; border: 1px solid var(--dc-border); border-left: 3px solid var(--dc-foreground); font-family: var(--dc-font-family-mono); }
  code { font-family: var(--dc-font-family-mono); font-size: 0.88em; background: var(--dc-muted); color: var(--dc-foreground); padding: 1px 5px; border: 1px solid var(--dc-border); border-radius: 0; }
  pre code { background: none; border: none; padding: 0; }
  hr { border: none; border-top: 1px solid var(--dc-border); margin: 2rem 0; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 14px; }
  th, td { padding: 0.55rem 0.75rem; text-align: left; border-bottom: 1px solid var(--dc-border); }
  th { font-family: var(--dc-font-family-mono); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dc-muted-foreground); background: transparent; border-bottom: 2px solid var(--dc-foreground); }
  tbody tr:hover { background: var(--dc-muted); }
  details { margin: 0.75rem 0; }
  summary { cursor: pointer; font-weight: 500; font-size: 13px; color: var(--dc-muted-foreground); padding: 0.5rem 0; user-select: none; font-family: var(--dc-font-family-mono); text-transform: uppercase; letter-spacing: 0.05em; }
  summary:hover { color: var(--dc-foreground); }
  .dc-section { background: var(--dc-background); border: 1px solid var(--dc-border); padding: 1.25rem 1.5rem; margin: 1rem 0; }
  .mono { font-family: var(--dc-font-family-mono); font-size: 14px; font-weight: 500; }
  .dc-verdict .v-found  { color: var(--dc-verified); }
  .dc-verdict .v-partial { color: var(--dc-partial); }
  .dc-verdict .v-miss   { color: var(--dc-destructive); }
  .dc-meta-sep { display: none; }
  .dc-cowork-notice svg { flex-shrink: 0; margin-top: 2px; }`;

const REVIEW_VARIANTS: ReviewVariant[] = [
  {
    slug: "numbered-outline",
    label: "Numbered Outline",
    description:
      "Single column with a 5rem left gutter holding CSS-counter section numbers (01, 01.1, 01.2) aligned to each H2 and H3. Reviewers can reference sections by number, and the gutter gives an at-a-glance sense of structural depth while scrolling.",
    css: `  body {
    font-family: var(--dc-font-family);
    color: var(--dc-foreground);
    background: var(--dc-background);
    font-size: 16px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    max-width: 900px;
    margin: 0 auto;
    padding: 3rem 1.5rem 4rem 6.5rem;
    counter-reset: h2section;
  }
  body > header { margin-bottom: 2rem; position: relative; }
  body > header::before {
    content: "00";
    position: absolute;
    left: -5rem;
    top: 0.4rem;
    font-family: var(--dc-font-family-mono);
    font-size: 12px;
    font-weight: 500;
    color: var(--dc-border);
    letter-spacing: 0.05em;
  }
  body > header h1 {
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
    margin-bottom: 0.75rem;
  }
  body > header .dc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.5rem;
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    color: var(--dc-muted-foreground);
    margin: 0.75rem 0 0;
    padding-top: 0.85rem;
    border-top: 1px solid var(--dc-border);
  }
  .dc-meta-item { display: inline-flex; align-items: baseline; gap: 0.4rem; }
  .dc-meta-key { text-transform: uppercase; letter-spacing: 0.08em; color: var(--dc-subtle-foreground); font-size: 10px; font-weight: 500; }
  .dc-meta-val { color: var(--dc-foreground); font-weight: 500; }
  .dc-meta-link { color: var(--dc-primary); text-decoration: none; font-weight: 500; }
  .dc-meta-link:hover { text-decoration: underline; }
  .dc-verdict {
    display: flex;
    gap: 1.5rem;
    padding: 0.85rem 1rem;
    margin-bottom: 2.25rem;
    font-family: var(--dc-font-family-mono);
    font-size: 12px;
    border: 1px solid var(--dc-border);
    background: var(--dc-muted);
  }
  h1 { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; }
  h2 {
    counter-increment: h2section;
    counter-reset: h3section;
    font-size: 20px;
    font-weight: 600;
    margin: 2.75rem 0 0.85rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--dc-border);
    letter-spacing: -0.01em;
    position: relative;
  }
  h2::before {
    content: counter(h2section, decimal-leading-zero);
    position: absolute;
    left: -5rem;
    top: 0.35rem;
    font-family: var(--dc-font-family-mono);
    font-size: 12px;
    font-weight: 500;
    color: var(--dc-primary);
    letter-spacing: 0.05em;
  }
  h3 {
    counter-increment: h3section;
    font-size: 16px;
    font-weight: 600;
    margin: 1.75rem 0 0.5rem;
    position: relative;
  }
  h3::before {
    content: counter(h2section, decimal-leading-zero) "." counter(h3section);
    position: absolute;
    left: -5rem;
    top: 0.2rem;
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--dc-subtle-foreground);
  }
  .dc-footer {
    margin: 3.5rem 0 0 -5rem;
    padding: 1.25rem 0 0 5rem;
    border-top: 1px solid var(--dc-border);
    font-size: 11px;
    color: var(--dc-subtle-foreground);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--dc-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .dc-footer a { color: var(--dc-subtle-foreground); text-decoration: none; }
  .dc-footer a:hover { color: var(--dc-muted-foreground); text-decoration: underline; }
  .dc-cowork-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.65rem 0.9rem;
    background: var(--dc-muted);
    border: 1px solid var(--dc-border);
    font-size: 13px;
    line-height: 1.5;
    color: var(--dc-foreground);
    margin-bottom: 1.5rem;
  }
  @media (max-width: 720px) {
    body { padding: 2rem 1.25rem 3rem; }
    body > header::before, h2::before, h3::before { position: static; display: block; margin-bottom: 0.2rem; }
    .dc-footer { margin-left: 0; padding-left: 0; }
  }`,
  },
  {
    slug: "reviewer-console",
    label: "Reviewer's Console",
    description:
      "Numbered-outline gutter plus a sticky verdict console that pins FOUND / PARTIAL / MISS counts to the viewport while the reviewer scrolls. Citation triggers are larger and more obviously interactive; jumping to a section via anchor scrolls it under the verdict bar with a soft :target highlight. Optimized for the active review moment — every affordance speeds the cite-by-cite walkthrough.",
    css: `  body {
    font-family: var(--dc-font-family);
    color: var(--dc-foreground);
    background: var(--dc-background);
    font-size: 16px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    max-width: 920px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem 6.5rem;
    counter-reset: h2section;
    scroll-padding-top: 5rem;
  }
  body > header { margin-bottom: 1.25rem; position: relative; }
  body > header::before {
    content: "00";
    position: absolute;
    left: -5rem;
    top: 0.65rem;
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--dc-border);
    letter-spacing: 0.05em;
  }
  body > header h1 {
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
    margin-bottom: 0.85rem;
  }
  body > header .dc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.5rem;
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    color: var(--dc-muted-foreground);
    margin: 0;
    padding-top: 0.85rem;
    border-top: 1px solid var(--dc-border);
  }
  .dc-meta-item { display: inline-flex; align-items: baseline; gap: 0.4rem; }
  .dc-meta-key { text-transform: uppercase; letter-spacing: 0.08em; color: var(--dc-subtle-foreground); font-size: 10px; font-weight: 500; }
  .dc-meta-val { color: var(--dc-foreground); font-weight: 500; }
  .dc-meta-link { color: var(--dc-primary); text-decoration: none; font-weight: 500; }
  .dc-meta-link:hover { text-decoration: underline; }
  .dc-verdict {
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    gap: 1.25rem;
    padding: 0.7rem 1.5rem 0.7rem 6.5rem;
    margin: 0 -1.5rem 2.25rem -6.5rem;
    font-family: var(--dc-font-family-mono);
    font-size: 12px;
    background: rgba(255, 255, 255, 0.96);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--dc-border);
  }
  .dc-verdict:empty { display: none; }
  .dc-verdict .v-found,
  .dc-verdict .v-partial,
  .dc-verdict .v-miss {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 600;
  }
  .dc-verdict .v-found::before,
  .dc-verdict .v-partial::before,
  .dc-verdict .v-miss::before {
    content: "";
    width: 8px;
    height: 8px;
    background: currentColor;
    border-radius: 50%;
  }
  h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
  h2 {
    counter-increment: h2section;
    counter-reset: h3section;
    font-size: 20px;
    font-weight: 600;
    margin: 2.75rem 0 0.85rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--dc-border);
    letter-spacing: -0.01em;
    position: relative;
    scroll-margin-top: 5rem;
  }
  h2::before {
    content: counter(h2section, decimal-leading-zero);
    position: absolute;
    left: -5rem;
    top: 0.35rem;
    font-family: var(--dc-font-family-mono);
    font-size: 12px;
    font-weight: 500;
    color: var(--dc-primary);
    letter-spacing: 0.05em;
  }
  h3 {
    counter-increment: h3section;
    font-size: 16px;
    font-weight: 600;
    margin: 1.75rem 0 0.5rem;
    position: relative;
    scroll-margin-top: 5rem;
  }
  h3::before {
    content: counter(h2section, decimal-leading-zero) "." counter(h3section);
    position: absolute;
    left: -5rem;
    top: 0.2rem;
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--dc-subtle-foreground);
  }
  h2:target, h3:target {
    background: linear-gradient(to right, color-mix(in srgb, var(--dc-primary) 7%, transparent), transparent 60%);
    padding-left: 0.5rem;
    margin-left: -0.5rem;
    transition: background-color 0.3s ease;
  }
  [data-cite] strong {
    cursor: pointer;
    padding: 1px 4px;
    margin: 0 -1px;
    border-bottom: 1px dotted color-mix(in srgb, var(--dc-primary) 40%, transparent);
    transition: background-color 0.12s ease, border-color 0.12s ease;
  }
  [data-cite]:hover strong {
    background: color-mix(in srgb, var(--dc-primary) 8%, transparent);
    border-bottom-color: var(--dc-primary);
  }
  .dc-section {
    background: var(--dc-background);
    border: 1px solid var(--dc-border);
    padding: 1.25rem 1.5rem;
    margin: 1rem 0;
    transition: border-color 0.12s ease;
  }
  .dc-section:hover { border-color: var(--dc-subtle-foreground); }
  .dc-footer {
    margin: 3.5rem 0 0 -5rem;
    padding: 1.25rem 0 0 5rem;
    border-top: 1px solid var(--dc-border);
    font-size: 11px;
    color: var(--dc-subtle-foreground);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--dc-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .dc-footer a { color: var(--dc-subtle-foreground); text-decoration: none; }
  .dc-footer a:hover { color: var(--dc-muted-foreground); text-decoration: underline; }
  .dc-cowork-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.65rem 0.9rem;
    background: var(--dc-muted);
    border: 1px solid var(--dc-border);
    font-size: 13px;
    line-height: 1.5;
    color: var(--dc-foreground);
    margin-bottom: 1.5rem;
  }
  @media (max-width: 720px) {
    body { padding: 2rem 1.25rem 3rem; }
    body > header::before, h2::before, h3::before { position: static; display: block; margin-bottom: 0.2rem; }
    .dc-verdict { padding: 0.7rem 1.25rem; margin: 0 -1.25rem 1.75rem; }
    .dc-footer { margin-left: 0; padding-left: 0; }
  }`,
  },
  {
    slug: "briefing-card",
    label: "Briefing Card",
    description:
      "A self-contained hero panel (title + meta + verdict) sits in the first viewport so a screenshot of the top of the report conveys the entire status at a glance. Verdict counts render as full-width tinted chips for thumbnail legibility. Title is framed with FileLasso's bracket motif. A print stylesheet keeps headings and tables intact when exported to PDF. Optimized for the handoff moment — the report has to survive being cropped, screenshotted, and pasted into Slack.",
    css: `  body {
    font-family: var(--dc-font-family);
    color: var(--dc-foreground);
    background: var(--dc-background);
    font-size: 15px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    max-width: 760px;
    margin: 0 auto;
    padding: 2.25rem 1.5rem 4rem;
    counter-reset: h2section;
  }
  body > header {
    position: relative;
    padding: 1.85rem 2rem 1.5rem;
    margin-bottom: 0;
    background: var(--dc-muted);
    border: 1px solid var(--dc-border);
    border-bottom: none;
  }
  body > header::before,
  body > header::after {
    content: "";
    position: absolute;
    width: 18px;
    height: 18px;
    border: 2px solid var(--dc-primary);
    pointer-events: none;
  }
  body > header::before {
    top: -1px;
    left: -1px;
    border-right: none;
    border-bottom: none;
  }
  body > header::after {
    top: -1px;
    right: -1px;
    border-left: none;
    border-bottom: none;
  }
  body > header h1 {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.18;
    margin-bottom: 1rem;
    color: var(--dc-foreground);
  }
  body > header .dc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.5rem;
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    margin: 0;
    padding-top: 0.85rem;
    border-top: 1px solid var(--dc-border);
  }
  .dc-meta-item { display: inline-flex; align-items: baseline; gap: 0.4rem; }
  .dc-meta-key { text-transform: uppercase; letter-spacing: 0.1em; color: var(--dc-subtle-foreground); font-size: 10px; font-weight: 500; }
  .dc-meta-val { color: var(--dc-foreground); font-weight: 600; }
  .dc-meta-link { color: var(--dc-primary); text-decoration: none; font-weight: 600; }
  .dc-meta-link:hover { text-decoration: underline; }
  .dc-verdict {
    display: flex;
    gap: 0;
    padding: 0;
    margin: 0 0 2.25rem;
    background: var(--dc-background);
    border: 1px solid var(--dc-border);
    border-top: none;
    font-family: var(--dc-font-family-mono);
    position: relative;
  }
  .dc-verdict::after {
    content: "";
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 18px;
    height: 18px;
    border: 2px solid var(--dc-primary);
    border-left: none;
    border-top: none;
    pointer-events: none;
  }
  .dc-verdict:empty { display: none; }
  .dc-verdict .v-found,
  .dc-verdict .v-partial,
  .dc-verdict .v-miss {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.95rem 1rem;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    border-right: 1px solid var(--dc-border);
  }
  .dc-verdict .v-miss { border-right: none; }
  .dc-verdict .v-found  { color: var(--dc-verified); background: var(--dc-verified-bg); }
  .dc-verdict .v-partial { color: var(--dc-partial); background: var(--dc-partial-bg); }
  .dc-verdict .v-miss   { color: var(--dc-destructive); background: var(--dc-destructive-bg); }
  h1 { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; margin: 2rem 0 0.5rem; }
  h2 {
    counter-increment: h2section;
    counter-reset: h3section;
    font-size: 19px;
    font-weight: 600;
    margin: 2.5rem 0 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--dc-border);
    letter-spacing: -0.01em;
    page-break-after: avoid;
    break-after: avoid-page;
  }
  h2::before {
    content: counter(h2section, decimal-leading-zero) "  ";
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--dc-primary);
    letter-spacing: 0.06em;
    margin-right: 0.5rem;
    vertical-align: 0.18em;
  }
  h3 { font-size: 15px; font-weight: 600; margin: 1.75rem 0 0.5rem; page-break-after: avoid; break-after: avoid-page; }
  .dc-cowork-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.65rem 0.9rem;
    margin: -0.5rem 0 1.5rem;
    background: var(--dc-muted);
    border: 1px solid var(--dc-border);
    font-size: 13px;
    line-height: 1.5;
    color: var(--dc-foreground);
  }
  .dc-footer {
    margin: 3.5rem 0 0;
    padding: 1.25rem 0 0;
    border-top: 1px solid var(--dc-border);
    font-size: 11px;
    color: var(--dc-subtle-foreground);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--dc-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .dc-footer a { color: var(--dc-subtle-foreground); text-decoration: none; }
  .dc-footer a:hover { color: var(--dc-muted-foreground); text-decoration: underline; }
  @media print {
    body { max-width: none; padding: 0.5in; font-size: 11pt; }
    body > header { background: transparent; }
    body > header::before, body > header::after, .dc-verdict::after { border-color: var(--dc-foreground); }
    .dc-verdict .v-found,
    .dc-verdict .v-partial,
    .dc-verdict .v-miss {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h2, h3 { page-break-after: avoid; break-after: avoid-page; }
    .dc-section, table, pre, figure { page-break-inside: avoid; break-inside: avoid; }
    .dc-footer { page-break-before: avoid; }
  }`,
  },
  {
    slug: "marginalia",
    label: "Marginalia",
    description:
      "Bracket-framed title, a §-marginalia gutter for every section, and a thin two-tone spine running the full document height along the left edge. Custom selection color in brand blue, corner brackets on the verdict box, and a bracketed footer. The signature element is the spine: any screenshot taken from inside the document will carry FileLasso's blue ledger line. Optimized for the months-later recognition moment — when a colleague spots a thumbnail and instantly knows what tool produced it.",
    css: `  body {
    font-family: var(--dc-font-family);
    color: var(--dc-foreground);
    background: var(--dc-background);
    font-size: 16px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
    max-width: 920px;
    margin: 0 auto;
    padding: 3.25rem 2rem 4rem 7rem;
    counter-reset: h2section;
    position: relative;
  }
  body::before {
    content: "";
    position: absolute;
    left: 1.85rem;
    top: 3.25rem;
    bottom: 4rem;
    width: 2px;
    background: var(--dc-primary);
    pointer-events: none;
  }
  body::after {
    content: "";
    position: absolute;
    left: 2.05rem;
    top: 3.25rem;
    bottom: 4rem;
    width: 1px;
    background: var(--dc-border);
    pointer-events: none;
  }
  ::selection { background: color-mix(in srgb, var(--dc-primary) 18%, transparent); color: var(--dc-foreground); }
  body > header { margin-bottom: 2.5rem; position: relative; }
  body > header::before {
    content: "\\00a7";
    position: absolute;
    left: -5.15rem;
    top: 0.45rem;
    font-family: var(--dc-font-family-mono);
    font-size: 18px;
    font-weight: 500;
    color: var(--dc-primary);
    line-height: 1;
  }
  body > header h1 {
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.12;
    color: var(--dc-foreground);
  }
  body > header h1::before {
    content: "[";
    font-family: var(--dc-font-family-mono);
    color: var(--dc-primary);
    font-weight: 400;
    margin-right: 0.55rem;
    font-size: 0.85em;
    vertical-align: 0.05em;
  }
  body > header h1::after {
    content: "]";
    font-family: var(--dc-font-family-mono);
    color: var(--dc-primary);
    font-weight: 400;
    margin-left: 0.55rem;
    font-size: 0.85em;
    vertical-align: 0.05em;
  }
  body > header .dc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.5rem;
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    color: var(--dc-muted-foreground);
    margin: 1.25rem 0 0;
    padding-top: 1rem;
    border-top: 1px solid var(--dc-border);
  }
  .dc-meta-item { display: inline-flex; align-items: baseline; gap: 0.45rem; }
  .dc-meta-key { text-transform: uppercase; letter-spacing: 0.1em; color: var(--dc-subtle-foreground); font-size: 10px; font-weight: 500; }
  .dc-meta-val { color: var(--dc-foreground); font-weight: 500; }
  .dc-meta-link { color: var(--dc-primary); text-decoration: none; font-weight: 500; }
  .dc-meta-link:hover { text-decoration: underline; }
  .dc-verdict {
    display: flex;
    gap: 1.5rem;
    padding: 1rem 1.25rem;
    margin: 0 0 2.5rem;
    font-family: var(--dc-font-family-mono);
    font-size: 12px;
    background: var(--dc-muted);
    border: 1px solid var(--dc-border);
    position: relative;
  }
  .dc-verdict:empty { display: none; }
  .dc-verdict::before,
  .dc-verdict::after {
    content: "";
    position: absolute;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--dc-primary);
    pointer-events: none;
  }
  .dc-verdict::before {
    top: -2px;
    left: -2px;
    border-right: none;
    border-bottom: none;
  }
  .dc-verdict::after {
    bottom: -2px;
    right: -2px;
    border-left: none;
    border-top: none;
  }
  h1 { font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
  h2 {
    counter-increment: h2section;
    counter-reset: h3section;
    font-size: 21px;
    font-weight: 600;
    margin: 3rem 0 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--dc-border);
    letter-spacing: -0.015em;
    position: relative;
  }
  h2::before {
    content: "\\00a7 " counter(h2section, decimal-leading-zero);
    position: absolute;
    left: -5.5rem;
    top: 0.5rem;
    font-family: var(--dc-font-family-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--dc-primary);
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
  }
  h3 {
    counter-increment: h3section;
    font-size: 16px;
    font-weight: 600;
    margin: 1.85rem 0 0.5rem;
    position: relative;
  }
  h3::before {
    content: counter(h2section, decimal-leading-zero) "\\00b7" counter(h3section);
    position: absolute;
    left: -5rem;
    top: 0.25rem;
    font-family: var(--dc-font-family-mono);
    font-size: 10px;
    font-weight: 500;
    color: var(--dc-subtle-foreground);
    font-variant-numeric: tabular-nums;
  }
  .dc-cowork-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.7rem 0.95rem;
    background: var(--dc-muted);
    border: 1px solid var(--dc-border);
    font-size: 13px;
    line-height: 1.5;
    color: var(--dc-foreground);
    margin-bottom: 1.5rem;
  }
  .dc-footer {
    margin: 4rem 0 0 -5rem;
    padding: 1.5rem 0 0 5rem;
    border-top: 1px solid var(--dc-border);
    font-size: 11px;
    color: var(--dc-subtle-foreground);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--dc-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .dc-footer::before { content: "[\\00a0"; color: var(--dc-border); }
  .dc-footer::after { content: "\\00a0]"; color: var(--dc-border); }
  .dc-footer a { color: var(--dc-subtle-foreground); text-decoration: none; }
  .dc-footer a:hover { color: var(--dc-muted-foreground); text-decoration: underline; }
  @media (max-width: 720px) {
    body { padding: 2.25rem 1.25rem 3rem; }
    body::before, body::after { display: none; }
    body > header::before, h2::before, h3::before { position: static; display: block; margin-bottom: 0.25rem; }
    .dc-footer { margin-left: 0; padding-left: 0; }
  }`,
  },
];

/**
 * Produce design-review variants of an already-rendered report HTML.
 *
 * Each variant is the same body markup — same meta strip, same verdict
 * banner, same citation spans — with a fully replaced `<style>` block.
 * The CDN runtime script and `<<<CITATION_DATA>>>` block are left intact,
 * so popovers still function for design review.
 *
 * Callers typically run this AFTER `verifyHtml` has written the main file,
 * so variants get the same runtime injection and verification payload.
 */
export function generateReviewVariants(
  mainHtml: string,
): Array<{ slug: string; label: string; description: string; html: string }> {
  return REVIEW_VARIANTS.map(v => {
    const fullCss = `${DC_ROOT_TOKENS}\n${REVIEW_SHARED_BASE_CSS}\n${v.css}`;
    const html = mainHtml.replace(/<style>[\s\S]*?<\/style>/, `<style>\n${fullCss}\n</style>`);
    return { slug: v.slug, label: v.label, description: v.description, html };
  });
}

// ── Main conversion ────────────────────────────────────────────────

/**
 * Convert markdown content (without <<<CITATION_DATA>>> block) to HTML.
 * Returns a full HTML document with the chosen style shell.
 */
export function markdownToHtml(markdown: string, options: MarkdownToHtmlOptions = {}): string {
  const { style = "report" } = options;

  const blocks = parseBlocks(markdown);

  // Caller-provided title takes precedence; fall back to first H1, then default.
  const firstH1 = blocks.find(b => b.type === "heading" && b.level === 1);
  const title = options.title ?? firstH1?.content ?? "Verification Report";

  // Render blocks to HTML body
  let bodyParts: string[];

  if (style === "report") {
    bodyParts = buildReportBody(blocks);
  } else {
    bodyParts = blocks.map(renderBlock);
  }

  let bodyHtml = bodyParts.join("\n");

  // Wrap [N] citation markers in <span data-cite="N">.
  // When sourceMatchMap is available, the sourceMatch becomes the clickable display
  // label — producing short inline citations that match the evidence highlight.
  bodyHtml = wrapCitationMarkers(bodyHtml, options.sourceMatchMap);

  if (style === "report") {
    return reportShell(title, bodyHtml, options);
  }
  return plainShell(title, bodyHtml, { cowork: options.cowork });
}

// ── Report body builder (progressive disclosure) ───────────────────

function buildReportBody(blocks: Block[]): string[] {
  const cfg = { tier2Open: true };
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
    const preamble = sections.shift();
    // Skip the H1 (already in shell header)
    for (const b of preamble?.blocks ?? []) {
      if (b.type === "heading" && b.level === 1) continue;
      parts.push(renderBlock(b));
    }
  }

  // Find "key findings" section (first section, or one with "finding" / "summary" in title)
  const findingsIdx = sections.findIndex(s => s.heading && /finding|summary|overview|key\s/i.test(s.heading.content));

  if (findingsIdx >= 0) {
    const findings = sections.splice(findingsIdx, 1)[0];
    if (findings.heading) parts.push(renderBlock(findings.heading));
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
    status: "found",
    label: "Brown v. Board of Education, 347 U.S. 483 (1954)",
    verifiedSourceContext:
      "the policy of separating the races is usually interpreted as denoting the inferiority of the negro group",
    verifiedSourceMatch: "inferiority of the negro group",
    citation: {
      type: "document",
      sourceContext:
        "the policy of separating the races is usually interpreted as denoting the inferiority of the negro group",
      sourceMatch: "inferiority of the negro group",
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
    status: "partial_text_found",
    label: "Q4 Financial Report",
    verifiedSourceContext:
      "Total revenue reached $2.3 billion for the fiscal year, representing a 45% increase year-over-year",
    verifiedSourceMatch: "$2.3 billion",
    sourceSnippet: "Total revenue reached $2.3 billion for the fiscal year",
    citation: {
      type: "document",
      sourceContext: "Total revenue reached $2.3 billion for the fiscal year",
      sourceMatch: "$2.3 billion",
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
    status: "found",
    label: "FDA Clinical Trial Guidance 2024",
    verifiedSourceContext: "Phase III clinical trial completed enrollment with 2,400 participants across 15 sites",
    verifiedSourceMatch: "Phase III completion",
    citation: {
      type: "document",
      sourceContext: "Phase III clinical trial completed enrollment",
      sourceMatch: "Phase III completion",
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

const CDN_SHOWCASE_ANCHOR_MAP: CitationSourceMatchMap = {
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
    sourceMatchMap: CDN_SHOWCASE_ANCHOR_MAP,
  });
  return injectCdnRuntime(html, CDN_SHOWCASE_VERIFICATIONS, CDN_SHOWCASE_KEY_MAP);
}
