import { formatPageLocation, getIndicator } from "../../markdown/markdownVariants.js";
import { getCitationStatus } from "../../parsing/parseCitation.js";
import { generateCitationKey } from "../../react/utils.js";
import { buildCitationFromAttrs, parseCiteAttributes } from "../citationParser.js";
import { buildProofUrl, buildSnippetImageUrl } from "../proofUrl.js";
import type { RenderCitationWithStatus } from "../types.js";
import {
  getStatusLabel,
  renderGitHubCitation,
  renderGitHubSourcesDetailed,
  renderGitHubSourcesList,
  renderGitHubSourcesTable,
} from "./githubVariants.js";
import type { GitHubOutput, GitHubRenderOptions } from "./types.js";

/**
 * Module-level compiled regex for cite tag matching.
 */
const CITE_TAG_REGEX = /<cite\s+[^>]*?\/>/g;

/**
 * Render LLM output with <cite /> tags as GitHub-flavored Markdown.
 *
 * @example
 * ```typescript
 * import { renderCitationsForGitHub } from "@deepcitation/deepcitation-js/github";
 *
 * const output = renderCitationsForGitHub(llmOutput, {
 *   verifications,
 *   variant: "brackets",
 *   proofBaseUrl: "https://proof.deepcitation.com",
 *   includeSources: true,
 *   sourcesFormat: "table",
 * });
 * ```
 */
export function renderCitationsForGitHub(input: string, options: GitHubRenderOptions = {}): GitHubOutput {
  const {
    verifications = {},
    indicatorStyle = "check",
    proofBaseUrl,
    includeSources = false,
    sourceLabels = {},
    variant = "brackets",
    sourcesFormat = "table",
    includeImages = false,
  } = options;

  const citationsWithStatus: RenderCitationWithStatus[] = [];
  const proofUrls: Record<string, string> = {};
  let citationIndex = 0;

  // Use module-level regex directly - replace() handles lastIndex reset automatically
  const markdown = input.replace(CITE_TAG_REGEX, match => {
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

    citationsWithStatus.push({
      citation,
      citationKey,
      verification,
      status,
      citationNumber: citationIndex,
    });

    return renderGitHubCitation(
      citationIndex,
      citation.anchorText ?? undefined,
      status,
      indicatorStyle,
      proofUrl,
      variant,
    );
  });

  // Build sources section
  let sources: string | undefined;
  if (includeSources && citationsWithStatus.length > 0) {
    const entries = citationsWithStatus.map(cws => {
      const label =
        cws.citation.type === "url"
          ? sourceLabels[""] || cws.verification?.label || cws.citation.title || `Source ${cws.citationNumber}`
          : sourceLabels[cws.citation.attachmentId || ""] || cws.verification?.label || `Source ${cws.citationNumber}`;
      const location = formatPageLocation(cws.citation, cws.verification, {
        showPageNumber: true,
        showLinePosition: false,
      });
      const indicator = getIndicator(cws.status, indicatorStyle);
      const statusLabel = getStatusLabel(cws.status);
      const proofUrl = proofUrls[cws.citationKey];

      let imageUrl: string | undefined;
      if (includeImages && proofBaseUrl) {
        imageUrl = buildSnippetImageUrl(cws.citationKey, { baseUrl: proofBaseUrl });
      }

      return {
        citationNumber: cws.citationNumber,
        indicator,
        statusLabel,
        sourceLabel: label,
        location,
        quote: cws.citation.fullPhrase ?? undefined,
        proofUrl,
        imageUrl,
      };
    });

    if (variant === "footnote") {
      // Generate footnote definitions
      const footnoteLines = entries.map(entry => {
        const location = entry.location ? ` — ${entry.location}` : "";
        const proofLink = entry.proofUrl ? ` [View proof](${entry.proofUrl})` : "";
        return `[^${entry.citationNumber}]: ${entry.indicator} ${entry.sourceLabel}${location}${proofLink}`;
      });
      sources = footnoteLines.join("\n");
    } else if (sourcesFormat === "detailed") {
      sources = renderGitHubSourcesDetailed(entries);
    } else if (sourcesFormat === "list") {
      sources = renderGitHubSourcesList(entries);
    } else {
      sources = renderGitHubSourcesTable(entries);
    }
  }

  const full = sources ? `${markdown}\n\n${sources}` : markdown;

  return {
    content: markdown,
    markdown,
    sources,
    full,
    citations: citationsWithStatus,
    proofUrls: Object.keys(proofUrls).length > 0 ? proofUrls : undefined,
  };
}
