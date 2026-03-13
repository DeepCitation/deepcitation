import { formatPageLocation } from "../../markdown/markdownVariants.js";
import type { ParsedCitationResult } from "../../parsing/parseCitationResponse.js";
import { buildProofUrl, buildSnippetImageUrl } from "../proofUrl.js";
import { resolveSourceLabel, walkCitationSegments } from "../shared.js";
import { renderHtmlCitation } from "./htmlVariants.js";
import { generateStyleBlock } from "./styles.js";
import type { HtmlOutput, HtmlRenderOptions } from "./types.js";

/**
 * Render LLM output with `[N]` citation markers as static HTML with CSS tooltips.
 *
 * Accepts either a raw LLM response string (auto-parsed) or a pre-parsed
 * `ParsedCitationResult` for efficiency when reusing parsed data.
 *
 * @example
 * ```typescript
 * import { renderCitationsAsHtml } from "deepcitation/html";
 *
 * const output = renderCitationsAsHtml(llmOutput, {
 *   verifications,
 *   variant: "brackets",
 *   proofBaseUrl: "https://proof.deepcitation.com",
 *   includeStyles: true,
 *   includeTooltips: true,
 * });
 * ```
 */
export function renderCitationsAsHtml(
  input: string | ParsedCitationResult,
  options: HtmlRenderOptions = {},
): HtmlOutput {
  const {
    verifications = {},
    indicatorStyle = "check",
    proofBaseUrl,
    includeSources = false,
    sourceLabels = {},
    variant = "brackets",
    includeStyles = true,
    inlineStyles = false,
    includeTooltips = true,
    theme = "light",
    classPrefix = "dc-",
  } = options;

  const { segments, citationsWithStatus } = walkCitationSegments(input, verifications);
  const proofUrls: Record<string, string> = {};

  const htmlParts: string[] = [];

  for (const seg of segments) {
    if (seg.type === "text") {
      htmlParts.push(escapeHtml(seg.value));
      continue;
    }

    let proofUrl: string | undefined;
    if (proofBaseUrl) {
      proofUrl = buildProofUrl(seg.citationKey, { baseUrl: proofBaseUrl });
      proofUrls[seg.citationKey] = proofUrl;
    }

    const label =
      seg.citation.type === "url"
        ? sourceLabels[""] || seg.verification?.label || seg.citation.title
        : sourceLabels[seg.citation.attachmentId || ""] || seg.verification?.label;
    const location = formatPageLocation(seg.citation, seg.verification, {
      showPageNumber: true,
      showLinePosition: false,
    });

    let imageUrl: string | undefined;
    if (proofBaseUrl) {
      imageUrl = buildSnippetImageUrl(seg.citationKey, { baseUrl: proofBaseUrl });
    }

    htmlParts.push(
      renderHtmlCitation({
        citationNumber: seg.citationNumber,
        anchorText: seg.citation.anchorText ?? undefined,
        status: seg.status,
        indicatorStyle,
        proofUrl,
        variant,
        prefix: classPrefix,
        inlineStyles,
        includeTooltips,
        theme,
        citationKey: seg.citationKey,
        sourceLabel: label ?? undefined,
        location,
        quote: seg.citation.fullPhrase ?? undefined,
        imageUrl,
        attachmentId: seg.citation.type !== "url" ? (seg.citation.attachmentId ?? undefined) : undefined,
        pageNumber: seg.citation.type !== "url" ? (seg.citation.pageNumber ?? undefined) : undefined,
      }),
    );
  }

  const html = htmlParts.join("");

  // Build sources section
  let sources: string | undefined;
  if (includeSources && citationsWithStatus.length > 0) {
    const sourceLines: string[] = [`<div class="${classPrefix}sources">`, `<h3>Sources</h3>`, "<ul>"];
    for (const cws of citationsWithStatus) {
      const label = resolveSourceLabel(cws, sourceLabels);
      const location = formatPageLocation(cws.citation, cws.verification, {
        showPageNumber: true,
        showLinePosition: false,
      });
      const proofUrl = proofUrls[cws.citationKey];
      const loc = location ? ` — ${escapeHtml(location)}` : "";
      const link = proofUrl
        ? `<a href="${escapeHtml(proofUrl)}" target="_blank" rel="noopener">[${cws.citationNumber}]</a>`
        : `[${cws.citationNumber}]`;
      sourceLines.push(`<li>${link} ${escapeHtml(label)}${loc}</li>`);
    }
    sourceLines.push("</ul>", "</div>");
    sources = sourceLines.join("\n");
  }

  // Generate styles
  const styles = includeStyles && !inlineStyles ? generateStyleBlock(classPrefix, theme) : undefined;

  const parts: string[] = [];
  if (styles) parts.push(styles);
  parts.push(html);
  if (sources) parts.push(sources);
  const full = parts.join("\n");

  return {
    content: html,
    html,
    styles,
    sources,
    full,
    citations: citationsWithStatus,
    proofUrls: Object.keys(proofUrls).length > 0 ? proofUrls : undefined,
  };
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
