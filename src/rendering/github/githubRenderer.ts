import { formatPageLocation, getIndicator } from "../../markdown/markdownVariants.js";
import type { ParsedCitationResult } from "../../parsing/parseCitationResponse.js";
import { buildProofUrl, buildSnippetImageUrl } from "../proofUrl.js";
import { resolveSourceLabel, walkCitationSegments } from "../shared.js";
import {
  getStatusLabel,
  renderGitHubCitation,
  renderGitHubSourcesDetailed,
  renderGitHubSourcesList,
  renderGitHubSourcesTable,
} from "./githubVariants.js";
import type { GitHubOutput, GitHubRenderOptions } from "./types.js";

/**
 * Render LLM output with `[N]` citation markers as GitHub-flavored Markdown.
 *
 * Accepts either a raw LLM response string (auto-parsed) or a pre-parsed
 * `ParsedCitationResult` for efficiency when reusing parsed data.
 *
 * @example
 * ```typescript
 * import { renderCitationsForGitHub } from "deepcitation/github";
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
export function renderCitationsForGitHub(
  input: string | ParsedCitationResult,
  options: GitHubRenderOptions = {},
): GitHubOutput {
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

  const { segments, citationsWithStatus } = walkCitationSegments(input, verifications);
  const proofUrls: Record<string, string> = {};

  const markdownParts: string[] = [];

  for (const seg of segments) {
    if (seg.type === "text") {
      markdownParts.push(seg.value);
      continue;
    }

    let proofUrl: string | undefined;
    if (proofBaseUrl) {
      proofUrl = buildProofUrl(seg.citationKey, { baseUrl: proofBaseUrl });
      proofUrls[seg.citationKey] = proofUrl;
    }

    markdownParts.push(
      renderGitHubCitation(
        seg.citationNumber,
        seg.citation.anchorText ?? undefined,
        seg.status,
        indicatorStyle,
        proofUrl,
        variant,
      ),
    );
  }

  const markdown = markdownParts.join("");

  // Build sources section
  let sources: string | undefined;
  if (includeSources && citationsWithStatus.length > 0) {
    const entries = citationsWithStatus.map(cws => {
      const label = resolveSourceLabel(cws, sourceLabels);
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
