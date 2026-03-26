import { formatPageLocation } from "../markdown/markdownVariants.js";
import type { ParsedCitationResult } from "../parsing/parseCitationResponse.js";
import { parseCitationResponse } from "../parsing/parseCitationResponse.js";
import { renderCitationsAsHtml } from "../rendering/html/htmlRenderer.js";
import { generateStyleBlock } from "../rendering/html/styles.js";
import {
  escapeHtml,
  getStatusKey,
  getStatusLabel,
  resolveSourceLabel,
  type StatusKey,
  walkCitationSegments,
} from "../rendering/shared.js";
import type { RenderCitationWithStatus } from "../rendering/types.js";
import { RUNTIME_JS } from "./_generated.js";
import { BRANDED_REPORT_CSS } from "./brandedReportStyles.js";
import { POPOVER_CSS } from "./popoverStyles.js";
import { escapeJsonForScript, stripStyleTags } from "./reportUtils.js";
import type { BrandedReportOptions } from "./types.js";

/** DeepCitation shield SVG wordmark — inline, no external deps. */
const WORDMARK_SVG = `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="28" height="28" rx="6" fill="currentColor"/>
  <path d="M7 14.5L11.5 19L21 9.5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const CHEVRON_SVG = `<svg class="dcr-section-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>`;

interface StatusGroups {
  verified: RenderCitationWithStatus[];
  partial: RenderCitationWithStatus[];
  notFound: RenderCitationWithStatus[];
  pending: RenderCitationWithStatus[];
}

/** Single-pass grouping of citations by status + summary counts. */
function groupAndSummarize(citations: RenderCitationWithStatus[]): {
  groups: StatusGroups;
  total: number;
  verified: number;
  partial: number;
  notFound: number;
} {
  const groups: StatusGroups = { verified: [], partial: [], notFound: [], pending: [] };
  for (const c of citations) {
    const key = getStatusKey(c.status);
    groups[key].push(c);
  }
  return {
    groups,
    total: citations.length,
    verified: groups.verified.length,
    partial: groups.partial.length,
    notFound: groups.notFound.length,
  };
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}\u2026`;
}

function buildCitationCards(citations: RenderCitationWithStatus[], sourceLabels: Record<string, string>): string {
  if (citations.length === 0) {
    return `<div class="dcr-empty"><div class="dcr-empty-icon">\u{1F50D}</div><p>No citations found in the response.</p></div>`;
  }

  return citations
    .map(cws => {
      const statusKey = getStatusKey(cws.status);
      const statusLabel = getStatusLabel(cws.status);
      const label = resolveSourceLabel(cws, sourceLabels);
      const location = formatPageLocation(cws.citation, cws.verification ?? undefined, {
        showPageNumber: true,
        showLinePosition: false,
      });
      const loc = location ? ` \u00B7 ${escapeHtml(location)}` : "";
      const quote = cws.citation.fullPhrase ? truncate(cws.citation.fullPhrase, 200) : "";

      const evidenceSrc = cws.verification?.evidence?.src;
      const thumbHtml =
        evidenceSrc && !evidenceSrc.startsWith("javascript:") && !evidenceSrc.includes("image/svg")
          ? `<img class="dcr-evidence-thumb" src="${escapeHtml(evidenceSrc)}" alt="Evidence for citation ${cws.citationNumber}" loading="lazy" data-citation-key="${escapeHtml(cws.citationKey)}">`
          : "";

      return `<div class="dcr-citation-card">
  <div class="dcr-citation-num dcr-citation-num-${statusKey}">${cws.citationNumber}</div>
  <div class="dcr-citation-content">
    <div class="dcr-citation-status" style="color:var(--dcr-${statusKey}-text)">${escapeHtml(statusLabel)}</div>
    <div class="dcr-citation-source">${escapeHtml(label)}${loc}</div>
    ${quote ? `<blockquote class="dcr-citation-quote">\u201C${escapeHtml(quote)}\u201D</blockquote>` : ""}
  </div>
  ${thumbHtml}
</div>`;
    })
    .join("\n");
}

function buildSectionsHtml(
  groups: StatusGroups,
  summary: { notFound: number; partial: number },
  sourceLabels: Record<string, string>,
): string {
  const parts: string[] = [];

  // Show problematic citations first — progressive disclosure
  if (groups.notFound.length > 0) {
    parts.push(buildSection("Not Verified", "notFound", groups.notFound, sourceLabels, true));
  }
  if (groups.partial.length > 0) {
    parts.push(buildSection("Partially Verified", "partial", groups.partial, sourceLabels, true));
  }
  if (groups.verified.length > 0) {
    parts.push(
      buildSection("Verified", "verified", groups.verified, sourceLabels, summary.notFound > 0 || summary.partial > 0),
    );
  }
  if (groups.pending.length > 0) {
    parts.push(buildSection("Pending", "pending", groups.pending, sourceLabels, true));
  }

  return parts.join("\n");
}

/** CSS class suffix for badge styling — maps StatusKey to the CSS convention. */
const STATUS_CSS_CLASS: Record<StatusKey, string> = {
  verified: "verified",
  partial: "partial",
  notFound: "notfound",
  pending: "pending",
};

function buildSection(
  title: string,
  statusKey: StatusKey,
  citations: RenderCitationWithStatus[],
  sourceLabels: Record<string, string>,
  startOpen: boolean,
): string {
  const cssClass = STATUS_CSS_CLASS[statusKey];
  return `<details class="dcr-section"${startOpen ? " open" : ""}>
  <summary class="dcr-section-header">
    ${CHEVRON_SVG}
    ${escapeHtml(title)}
    <span class="dcr-section-badge dcr-badge-${cssClass}">${citations.length}</span>
  </summary>
  <div class="dcr-section-body">
    ${buildCitationCards(citations, sourceLabels)}
  </div>
</details>`;
}

/**
 * Render a branded, self-contained HTML report with progressive disclosure.
 *
 * Produces a polished single-file report with:
 * - DeepCitation branded header and wordmark
 * - Summary dashboard showing verification statistics
 * - Collapsible sections grouped by verification status
 * - Evidence thumbnails with click-to-expand
 * - Interactive citation popovers (vanilla runtime)
 * - Light/dark/auto theme support
 * - Print-friendly and responsive layout
 *
 * @example
 * ```typescript
 * import { renderBrandedReport } from 'deepcitation/vanilla';
 *
 * const html = renderBrandedReport(llmOutput, {
 *   verifications,
 *   title: 'Q4 Earnings Analysis',
 *   sourceLabels: { 'att_abc': 'Annual Report 2025' },
 * });
 *
 * fs.writeFileSync('report.html', html);
 * // Open in browser for full interactive experience
 * ```
 */
export function renderBrandedReport(input: string | ParsedCitationResult, options: BrandedReportOptions = {}): string {
  const {
    verifications = {},
    variant = "brackets",
    theme = "auto",
    title = "Citation Report",
    sourceLabels = {},
    indicatorStyle = "check",
    classPrefix = "dc-",
    proofBaseUrl,
    generatedAt = new Date().toISOString(),
    showResponseBody = true,
  } = options;

  // Parse once, reuse for both the walk and the HTML renderer
  const parsed = typeof input === "string" ? parseCitationResponse(input) : input;

  // Walk citations for summary and cards
  const { citationsWithStatus } = walkCitationSegments(parsed, verifications);
  const { groups, ...summary } = groupAndSummarize(citationsWithStatus);

  // Render the response body with inline citation markers + popovers
  // Passes parsed result to avoid re-parsing the input
  const rendered = renderCitationsAsHtml(parsed, {
    verifications,
    variant,
    indicatorStyle,
    proofBaseUrl,
    sourceLabels,
    includeStyles: false,
    inlineStyles: false,
    includeTooltips: false,
    theme,
    classPrefix,
  });

  const triggerCssBody = stripStyleTags(generateStyleBlock(classPrefix, theme));

  // Format timestamp
  const date = new Date(generatedAt);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const sectionsHtml = buildSectionsHtml(groups, summary, sourceLabels);

  const bodySection = showResponseBody
    ? `<div class="dcr-body">
  <h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">Response</h2>
  <div class="${classPrefix}report">${rendered.html}</div>
</div>`
    : "";

  const jsonData = escapeJsonForScript(JSON.stringify(verifications));

  return `<!DOCTYPE html>
<html lang="en" data-dc-theme="${escapeHtml(theme)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} \u2014 DeepCitation</title>
<style>
${BRANDED_REPORT_CSS}
${triggerCssBody}
${POPOVER_CSS}
</style>
</head>
<body>
<div class="dcr-shell">

  <!-- Header -->
  <header class="dcr-header">
    <div class="dcr-wordmark">
      ${WORDMARK_SVG}
      <span class="dcr-wordmark-text">DeepCitation</span>
    </div>
    <h1 class="dcr-title">${escapeHtml(title)}</h1>
    <div class="dcr-meta">
      <span>${formattedDate} at ${formattedTime}</span>
      <span>${summary.total} citation${summary.total !== 1 ? "s" : ""} analyzed</span>
    </div>
  </header>

  <!-- Summary Dashboard -->
  <div class="dcr-summary">
    <div class="dcr-stat dcr-stat-total dcr-animate-in">
      <div class="dcr-stat-count">${summary.total}</div>
      <div class="dcr-stat-label">Total Citations</div>
    </div>
    <div class="dcr-stat dcr-stat-verified dcr-animate-in">
      <div class="dcr-stat-count">${summary.verified}</div>
      <div class="dcr-stat-label">Verified</div>
    </div>
    <div class="dcr-stat dcr-stat-partial dcr-animate-in">
      <div class="dcr-stat-count">${summary.partial}</div>
      <div class="dcr-stat-label">Partial Match</div>
    </div>
    <div class="dcr-stat dcr-stat-notfound dcr-animate-in">
      <div class="dcr-stat-count">${summary.notFound}</div>
      <div class="dcr-stat-label">Not Found</div>
    </div>
  </div>

  <!-- Citation Details (Progressive Disclosure) -->
  ${sectionsHtml}

  <!-- Response Body with inline citations -->
  ${bodySection}

  <!-- Footer -->
  <footer class="dcr-footer">
    <span>Verified by <a href="https://deepcitation.com" target="_blank" rel="noopener">DeepCitation</a></span>
    <span>${escapeHtml(formattedDate)}</span>
  </footer>

</div>

<!-- Verification data for popover runtime -->
<script type="application/json" id="dc-data">${jsonData}</script>
<script>${RUNTIME_JS}</script>
</body>
</html>`;
}
