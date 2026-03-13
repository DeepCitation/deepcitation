import { formatPageLocation } from "../../markdown/markdownVariants.js";
import type { ParsedCitationResult } from "../../parsing/parseCitationResponse.js";
import { buildProofUrl } from "../proofUrl.js";
import { resolveSourceLabel, walkCitationSegments } from "../shared.js";
import { renderSlackCitation, renderSlackSourceEntry } from "./slackVariants.js";
import type { SlackOutput, SlackRenderOptions } from "./types.js";

/**
 * Render LLM output with `[N]` citation markers as Slack mrkdwn with linked proof URLs.
 *
 * Accepts either a raw LLM response string (auto-parsed) or a pre-parsed
 * `ParsedCitationResult` for efficiency when reusing parsed data.
 *
 * @example
 * ```typescript
 * import { renderCitationsForSlack } from "deepcitation/slack";
 *
 * const output = renderCitationsForSlack(llmOutput, {
 *   verifications,
 *   variant: "brackets",
 *   proofBaseUrl: "https://proof.deepcitation.com",
 *   includeSources: true,
 * });
 * ```
 */
export function renderCitationsForSlack(
  input: string | ParsedCitationResult,
  options: SlackRenderOptions = {},
): SlackOutput {
  const {
    verifications = {},
    indicatorStyle = "check",
    proofBaseUrl,
    includeSources = false,
    sourceLabels = {},
    variant = "brackets",
    maxMessageLength = 4000,
  } = options;

  const { segments, citationsWithStatus } = walkCitationSegments(input, verifications);
  const proofUrls: Record<string, string> = {};

  const messageParts: string[] = [];

  for (const seg of segments) {
    if (seg.type === "text") {
      messageParts.push(seg.value);
      continue;
    }

    let proofUrl: string | undefined;
    if (proofBaseUrl) {
      proofUrl = buildProofUrl(seg.citationKey, { baseUrl: proofBaseUrl });
      proofUrls[seg.citationKey] = proofUrl;
    }

    messageParts.push(
      renderSlackCitation(
        seg.citationNumber,
        seg.citation.anchorText ?? undefined,
        seg.status,
        indicatorStyle,
        proofUrl,
        variant,
      ),
    );
  }

  const message = messageParts.join("");

  // Build sources section
  let sources: string | undefined;
  if (includeSources && citationsWithStatus.length > 0) {
    const sourceLines = ["*Sources:*"];
    for (const cws of citationsWithStatus) {
      const label = resolveSourceLabel(cws, sourceLabels);
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
