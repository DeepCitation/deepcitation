import { getIndicator, toSuperscript } from "../../markdown/markdownVariants.js";
import type { IndicatorStyle } from "../../markdown/types.js";
import type { CitationStatus } from "../../types/citation.js";
import type { SlackVariant } from "./types.js";

/**
 * Render a citation marker in Slack mrkdwn format.
 * Wraps the marker in a Slack link if proofUrl is provided.
 */
export function renderSlackCitation(
  citationNumber: number,
  anchorText: string | undefined,
  status: CitationStatus,
  indicatorStyle: IndicatorStyle,
  proofUrl: string | undefined,
  variant: SlackVariant,
): string {
  const indicator = getIndicator(status, indicatorStyle);
  let text: string;

  switch (variant) {
    case "inline":
      text = `${anchorText || `Citation ${citationNumber}`}${indicator}`;
      break;
    case "number":
      text = `${toSuperscript(citationNumber)}${indicator}`;
      break;
    default:
      text = `[${citationNumber}${indicator}]`;
      break;
  }

  if (proofUrl) {
    return `<${proofUrl}|${text}>`;
  }
  return text;
}

/**
 * Format a source entry for the Slack sources appendix.
 */
export function renderSlackSourceEntry(
  citationNumber: number,
  status: CitationStatus,
  indicatorStyle: IndicatorStyle,
  sourceLabel: string,
  pageLocation: string,
  proofUrl: string | undefined,
): string {
  const indicator = getIndicator(status, indicatorStyle);
  const marker = proofUrl ? `<${proofUrl}|[${citationNumber}${indicator}]>` : `[${citationNumber}${indicator}]`;

  const location = pageLocation ? ` — ${pageLocation}` : "";
  return `• ${marker} ${sourceLabel}${location}`;
}
