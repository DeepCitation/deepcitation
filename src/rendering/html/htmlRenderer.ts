import { formatPageLocation } from "../../markdown/markdownVariants.js";
import { getCitationStatus } from "../../parsing/parseCitation.js";
import { generateCitationKey } from "../../react/utils.js";
import { safeReplace } from "../../utils/regexSafety.js";
import { buildCitationFromAttrs, parseCiteAttributes } from "../citationParser.js";
import { buildProofUrl, buildSnippetImageUrl } from "../proofUrl.js";
import type { RenderCitationWithStatus } from "../types.js";
import { renderHtmlCitation } from "./htmlVariants.js";
import { generateStyleBlock } from "./styles.js";
import type { HtmlOutput, HtmlRenderOptions } from "./types.js";

/**
 * Module-level compiled regex for cite tag matching.
 */
const CITE_TAG_REGEX = /<cite\s(?:[^>/]|\/(?!>))*\/>/g;

/**
 * Render LLM output with <cite /> tags as static HTML with CSS tooltips.
 *
 * @example
 * ```typescript
 * import { renderCitationsAsHtml } from "@deepcitation/deepcitation-js/html";
 *
 * const output = renderCitationsAsHtml(llmOutput, {
 *   verifications,
 *   variant: "brackets",
 *   proofBaseUrl: "https://proof.deepcitation.com",
 *   includeStyles: true,
 *   includeTooltips: true,
 * });
 * // output.html: '<p>Revenue grew...<span class="dc-citation dc-verified">[1<span class="dc-indicator">✓</span>]</span></p>'
 * ```
 */
export function renderCitationsAsHtml(input: string, options: HtmlRenderOptions = {}): HtmlOutput {
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

  const citationsWithStatus: RenderCitationWithStatus[] = [];
  const proofUrls: Record<string, string> = {};
  let citationIndex = 0;

  // Use safeReplace to validate input length before regex (ReDoS prevention)
  const html = safeReplace(input, CITE_TAG_REGEX, match => {
    citationIndex++;
    const attrs = parseCiteAttributes(match);
    const citation = buildCitationFromAttrs(attrs, citationIndex);
    const citationKey = generateCitationKey(citation);
    const verification = verifications[citationKey] || null;
    const status = getCitationStatus(verification);

    let proofUrl: string | undefined;
    if (proofBaseUrl) {
      proofUrl = buildProofUrl(citationKey, { baseUrl: proofBaseUrl });
      proofUrls[citationKey] = proofUrl;
    }

    const label =
      citation.type === "url"
        ? sourceLabels[""] || verification?.label || citation.title
        : sourceLabels[citation.attachmentId || ""] || verification?.label;
    const location = formatPageLocation(citation, verification, { showPageNumber: true, showLinePosition: false });

    let imageUrl: string | undefined;
    if (proofBaseUrl) {
      imageUrl = buildSnippetImageUrl(citationKey, { baseUrl: proofBaseUrl });
    }

    citationsWithStatus.push({
      citation,
      citationKey,
      verification,
      status,
      citationNumber: citationIndex,
    });

    return renderHtmlCitation({
      citationNumber: citationIndex,
      anchorText: citation.anchorText ?? undefined,
      status,
      indicatorStyle,
      proofUrl,
      variant,
      prefix: classPrefix,
      inlineStyles,
      includeTooltips,
      theme,
      citationKey,
      sourceLabel: label ?? undefined,
      location,
      quote: citation.fullPhrase ?? undefined,
      imageUrl,
    });
  });

  // Build sources section
  let sources: string | undefined;
  if (includeSources && citationsWithStatus.length > 0) {
    const sourceLines: string[] = [`<div class="${classPrefix}sources">`, `<h3>Sources</h3>`, "<ul>"];
    for (const cws of citationsWithStatus) {
      const label =
        cws.citation.type === "url"
          ? sourceLabels[""] || cws.verification?.label || cws.citation.title || `Source ${cws.citationNumber}`
          : sourceLabels[cws.citation.attachmentId || ""] || cws.verification?.label || `Source ${cws.citationNumber}`;
      const location = formatPageLocation(cws.citation, cws.verification, {
        showPageNumber: true,
        showLinePosition: false,
      });
      const proofUrl = proofUrls[cws.citationKey];
      const loc = location ? ` — ${escapeHtml(location)}` : "";
      const link = proofUrl
        ? `<a href="${escapeHtmlAttr(proofUrl)}" target="_blank" rel="noopener">[${cws.citationNumber}]</a>`
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

function escapeHtmlAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
