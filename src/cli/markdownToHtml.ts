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
  /** Optional source label shown in the meta line */
  sourceLabel?: string;
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
      // links (scheme allowlist: only http/https)
      // href is already HTML-escaped from the escHtml() call above; validate
      // the scheme but do not re-escape (that would double-encode & in URLs).
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
        const safeHref = /^https?:\/\//i.test(href) ? href : "#";
        return `<a href="${safeHref}">${label}</a>`;
      })
  );
}

// ── Citation marker wrapping ───────────────────────────────────────

/**
 * Find [N] markers in HTML content and wrap the preceding text fragment
 * in a <span data-cite="N">. The CDN runtime needs data-cite on inline
 * elements for indicator placement.
 *
 * Strategy: for each [N], find the innermost text context and wrap the
 * nearest meaningful phrase fragment in a span.
 */
export function wrapCitationMarkers(html: string): string {
  // Match [N] markers anywhere in text nodes. Excluding `<` keeps us out of HTML tags;
  // excluding `"` keeps us out of quoted attribute values. Without the old (?<=>|^) anchor,
  // multiple markers in the same paragraph are all matched.
  return html.replace(/([^<"]*?)\s*\[(\d+)\]/g, (_match, textBefore: string, num: string) => {
    const trimmed = textBefore.trimEnd();
    if (!trimmed) return `<span data-cite="${num}"></span>`;

    // Find a reasonable anchor: last clause (after comma, semicolon, or dash)
    // or the whole text if it's short
    const clauseMatch = trimmed.match(/(?:[,;–—]\s*)([^,;–—]+)$/);
    const anchor = clauseMatch ? clauseMatch[1].trim() : trimmed;
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
  a { color: #3B82F6; }
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 14px; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #E4E4E7; }
  th { font-weight: 600; background: #F4F4F5; }
  ul, ol { margin: 0.5rem 0 0.5rem 1.5rem; }
  li { margin: 0.25rem 0; }
  pre { background: #18181B; color: #E4E4E7; padding: 1rem; overflow-x: auto; margin: 0.75rem 0; font-size: 13px; }
  code { font-family: ${MONO_FONT}; font-size: 0.9em; background: #F4F4F5; padding: 1px 4px; }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid #E4E4E7; margin: 1.5rem 0; }
  .meta { color: #52525B; font-size: 14px; margin-bottom: 1.5rem; }`;

function plainShell(title: string, bodyHtml: string): string {
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
${bodyHtml}
<div data-dc-drawer-trigger></div>
</body>
</html>`;
}

function reportShell(title: string, bodyHtml: string, audience: AudiencePreset, sourceLabel?: string): string {
  const cfg = AUDIENCE_CONFIG[audience];
  const meta = sourceLabel ? `<p class="meta">${escHtml(sourceLabel)}</p>` : "";

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
    background: #FDFBF7;
    font-size: 16px;
  }
  h1 { margin-bottom: 0.25rem; }
  a { text-decoration: none; }
  a:hover { text-decoration: underline; }

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

  /* Table overrides */
  th { font-size: 13px; color: #52525B; text-transform: uppercase; letter-spacing: 0.04em; }

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
</style>
</head>
<body>
<header>
  <h1>${escHtml(title)}</h1>
  ${meta}
</header>
<div class="dc-verdict" id="dc-verdict"></div>
${bodyHtml}
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
  const { style = "report", audience = "general", sourceLabel } = options;

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

  // Wrap [N] citation markers in <span data-cite="N">
  bodyHtml = wrapCitationMarkers(bodyHtml);

  if (style === "report") {
    return reportShell(title, bodyHtml, audience, sourceLabel);
  }
  return plainShell(title, bodyHtml);
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
