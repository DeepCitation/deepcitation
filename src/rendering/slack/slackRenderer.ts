import { formatPageLocation } from "../../markdown/markdownVariants.js";
import { getCitationStatus } from "../../parsing/parseCitation.js";
import { generateCitationKey } from "../../react/utils.js";
import { buildCitationFromAttrs, parseCiteAttributes } from "../citationParser.js";
import { buildProofUrl } from "../proofUrl.js";
import type { RenderCitationWithStatus } from "../types.js";
import { renderSlackCitation, renderSlackSourceEntry } from "./slackVariants.js";
import type { SlackOutput, SlackRenderOptions } from "./types.js";

/**
 * Module-level compiled regex for cite tag matching.
 */
const CITE_TAG_REGEX = /<cite\s+[^>]*?\/>/g;

/**
 * Render LLM output with <cite /> tags as Slack mrkdwn with linked proof URLs.
 *
 * @example
 * ```typescript
 * import { renderCitationsForSlack } from "@deepcitation/deepcitation-js/slack";
 *
 * const output = renderCitationsForSlack(llmOutput, {
 *   verifications,
 *   variant: "brackets",
 *   proofBaseUrl: "https://proof.deepcitation.com",
 *   includeSources: true,
 * });
 * // output.message: "Revenue grew 23%. <https://proof.deepcitation.com/p/abc123|[1✓]>"
 * ```
 */
export function renderCitationsForSlack(input: string, options: SlackRenderOptions = {}): SlackOutput {
  const {
    verifications = {},
    indicatorStyle = "check",
    proofBaseUrl,
    includeSources = false,
    sourceLabels = {},
    variant = "brackets",
    maxMessageLength = 4000,
  } = options;

  const citationsWithStatus: RenderCitationWithStatus[] = [];
  const proofUrls: Record<string, string> = {};
  let citationIndex = 0;

  const citationRegex = new RegExp(CITE_TAG_REGEX.source, CITE_TAG_REGEX.flags);

  const message = input.replace(citationRegex, match => {
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

    return renderSlackCitation(
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
    const sourceLines = ["*Sources:*"];
    for (const cws of citationsWithStatus) {
      const label =
        sourceLabels[cws.citation.attachmentId || ""] ||
        cws.verification?.label ||
        cws.citation.title ||
        `Source ${cws.citationNumber}`;
      const location = formatPageLocation(cws.citation, cws.verification, {
        showPageNumber: true,
        showLinePosition: false,
      });
      const proofUrl = proofUrls[cws.citationKey];
      sourceLines.push(
        renderSlackSourceEntry(cws.citationNumber, cws.status, indicatorStyle, label, location, proofUrl),
      );
    }
    sources = sourceLines.join("\n");
  }

  let full = sources ? `${message}\n\n${sources}` : message;

  // Truncate if over max length
  if (full.length > maxMessageLength) {
    full = `${full.slice(0, maxMessageLength - 3)}...`;
  }

  return {
    content: message,
    message,
    sources,
    full,
    citations: citationsWithStatus,
    proofUrls: Object.keys(proofUrls).length > 0 ? proofUrls : undefined,
  };
}
