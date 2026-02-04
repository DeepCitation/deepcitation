import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import type { CitationStatus } from "../types/citation.js";
import type {
  MarkdownVariant,
  IndicatorStyle,
  LinePosition,
  RenderMarkdownOptions,
  CitationWithStatus,
} from "./types.js";
import { INDICATOR_SETS, SUPERSCRIPT_DIGITS } from "./types.js";

/**
 * Line position thresholds for humanizing line IDs.
 * These define the boundaries for categorizing where on a page a line appears.
 */
const LINE_POSITION_THRESHOLDS = {
  START: 0.2,   // 0-20% of page
  EARLY: 0.33,  // 20-33% of page
  MIDDLE: 0.66, // 33-66% of page
  LATE: 0.8,    // 66-80% of page
  // END: 80-100% of page (implicit)
} as const;

/**
 * Get the indicator string for a verification status.
 */
export function getIndicator(
  status: CitationStatus,
  style: IndicatorStyle = "check"
): string {
  const indicators = INDICATOR_SETS[style];

  if (status.isMiss) return indicators.notFound;
  if (status.isPartialMatch) return indicators.partial;
  if (status.isVerified) return indicators.verified;
  if (status.isPending) return indicators.pending;

  return indicators.pending;
}

/**
 * Convert a number to unicode superscript.
 * @example toSuperscript(123) => "¹²³"
 */
export function toSuperscript(num: number): string {
  return String(num)
    .split("")
    .map((digit) => SUPERSCRIPT_DIGITS[parseInt(digit, 10)] || digit)
    .join("");
}

/**
 * Humanize a line ID to a relative position on the page.
 * Returns null if totalLinesOnPage is not available.
 *
 * @example humanizeLinePosition(10, 100) => "start"
 * @example humanizeLinePosition(50, 100) => "middle"
 */
export function humanizeLinePosition(
  lineId: number,
  totalLinesOnPage: number | null | undefined
): LinePosition | null {
  if (!totalLinesOnPage || totalLinesOnPage <= 0) return null;

  const ratio = lineId / totalLinesOnPage;

  if (ratio < LINE_POSITION_THRESHOLDS.START) return "start";
  if (ratio < LINE_POSITION_THRESHOLDS.EARLY) return "early";
  if (ratio < LINE_POSITION_THRESHOLDS.MIDDLE) return "middle";
  if (ratio < LINE_POSITION_THRESHOLDS.LATE) return "late";
  return "end";
}

/**
 * Get display text from a citation based on variant needs.
 */
export function getCitationDisplayText(
  citation: Citation,
  variant: MarkdownVariant
): string {
  switch (variant) {
    case "brackets":
    case "superscript":
    case "footnote":
    case "minimal":
      return String(citation.citationNumber || 1);
    case "academic":
    case "inline":
    default:
      return citation.anchorText || citation.fullPhrase || String(citation.citationNumber || 1);
  }
}

/**
 * Format page location string with optional humanized line position.
 */
export function formatPageLocation(
  citation: Citation,
  verification: Verification | null,
  options: RenderMarkdownOptions
): string {
  const { showPageNumber = true, showLinePosition = true } = options;

  if (!showPageNumber) return "";

  const pageNumber = verification?.verifiedPageNumber ?? citation.pageNumber;
  if (!pageNumber || pageNumber < 0) return "";

  let location = `p.${pageNumber}`;

  // Add humanized line position for mismatches if available
  if (
    showLinePosition &&
    verification?.status === "found_on_other_line" &&
    citation.lineIds?.length &&
    verification.verifiedLineIds?.length
  ) {
    const expectedLineId = citation.lineIds[0];
    const foundLineId = verification.verifiedLineIds[0];
    const totalLines = verification.totalLinesOnPage;

    const expectedPos = humanizeLinePosition(expectedLineId, totalLines);
    const foundPos = humanizeLinePosition(foundLineId, totalLines);

    if (expectedPos && foundPos && expectedPos !== foundPos) {
      location += ` (expected ${expectedPos}, found ${foundPos})`;
    }
  }

  return location;
}

/**
 * Render a citation in the specified markdown variant.
 */
export function renderCitationVariant(
  citationWithStatus: CitationWithStatus,
  options: RenderMarkdownOptions
): string {
  const { variant = "inline", indicatorStyle = "check", linkStyle = "anchor" } = options;
  const { citation, status, citationNumber } = citationWithStatus;

  const indicator = getIndicator(status, indicatorStyle);
  const num = citationNumber;

  switch (variant) {
    case "inline": {
      // Fallback chain: anchorText -> fullPhrase (truncated) -> citation number
      const text = citation.anchorText ||
        (citation.fullPhrase ? citation.fullPhrase.slice(0, 50) + (citation.fullPhrase.length > 50 ? "..." : "") : `[${num}]`);
      const anchor = linkStyle === "anchor" ? `[${text}${indicator}](#ref-${num})` : `${text}${indicator}`;
      return anchor;
    }

    case "brackets": {
      const anchor = linkStyle === "anchor" ? `[${num}${indicator}](#ref-${num})` : `[${num}${indicator}]`;
      return anchor;
    }

    case "superscript": {
      const sup = toSuperscript(num);
      const anchor = linkStyle === "anchor" ? `[${sup}${indicator}](#ref-${num})` : `${sup}${indicator}`;
      return anchor;
    }

    case "footnote": {
      // Markdown footnote syntax doesn't support inline indicators
      return `[^${num}]`;
    }

    case "academic": {
      const sourceLabel = options.sourceLabels?.[citation.attachmentId || ""] || "Source";
      const page = citation.pageNumber ? `, p.${citation.pageNumber}` : "";
      const anchor = linkStyle === "anchor"
        ? `[(${sourceLabel}${page})${indicator}](#ref-${num})`
        : `(${sourceLabel}${page})${indicator}`;
      return anchor;
    }

    case "minimal": {
      const anchor = linkStyle === "anchor" ? `[${indicator}](#ref-${num})` : indicator;
      return anchor;
    }

    default:
      return indicator;
  }
}

/**
 * Render a single reference entry for the references section.
 */
export function renderReferenceEntry(
  citationWithStatus: CitationWithStatus,
  options: RenderMarkdownOptions
): string {
  const { variant = "inline", indicatorStyle = "check", showReasoning = false } = options;
  const { citation, verification, status, citationNumber } = citationWithStatus;

  const indicator = getIndicator(status, indicatorStyle);
  const location = formatPageLocation(citation, verification, options);
  const quote = citation.fullPhrase || citation.anchorText || "";

  // Build the reference line
  const lines: string[] = [];

  if (variant === "footnote") {
    // Footnote style: [^1]: "quote" - location ✓
    let entry = `[^${citationNumber}]: `;
    if (quote) entry += `"${quote}"`;
    if (location) entry += ` - ${location}`;
    entry += ` ${indicator}`;
    lines.push(entry);
  } else {
    // Standard reference style with anchor
    const anchorText = citation.anchorText || `Citation ${citationNumber}`;
    let entry = `<a id="ref-${citationNumber}"></a>\n`;
    entry += `**[${citationNumber}]** ${indicator}`;
    if (anchorText && anchorText !== `Citation ${citationNumber}`) {
      entry += ` **${anchorText}**`;
    }
    if (location) entry += ` - ${location}`;
    lines.push(entry);

    // Add quote as blockquote
    if (quote) {
      lines.push(`> "${quote}"`);
    }

    // Add reasoning if requested
    if (showReasoning && citation.reasoning) {
      lines.push(`> *${citation.reasoning}*`);
    }
  }

  return lines.join("\n");
}

/**
 * Render the full references section.
 */
export function renderReferencesSection(
  citations: CitationWithStatus[],
  options: RenderMarkdownOptions
): string {
  const { referenceHeading = "## References", variant = "inline" } = options;

  if (citations.length === 0) return "";

  const lines: string[] = [referenceHeading, ""];

  if (variant === "footnote") {
    // Footnote style: all entries on their own lines
    for (const citation of citations) {
      lines.push(renderReferenceEntry(citation, options));
    }
  } else {
    // Group by status for better organization
    const verified = citations.filter((c) => c.status.isVerified && !c.status.isPartialMatch);
    const partial = citations.filter((c) => c.status.isPartialMatch);
    const notFound = citations.filter((c) => c.status.isMiss);
    const pending = citations.filter((c) => c.status.isPending && !c.status.isVerified && !c.status.isMiss);

    if (verified.length > 0) {
      lines.push("### Verified", "");
      for (const citation of verified) {
        lines.push(renderReferenceEntry(citation, options), "");
      }
    }

    if (partial.length > 0) {
      lines.push("### Partial Match", "");
      for (const citation of partial) {
        lines.push(renderReferenceEntry(citation, options), "");
      }
    }

    if (notFound.length > 0) {
      lines.push("### Not Found", "");
      for (const citation of notFound) {
        lines.push(renderReferenceEntry(citation, options), "");
      }
    }

    if (pending.length > 0) {
      lines.push("### Pending", "");
      for (const citation of pending) {
        lines.push(renderReferenceEntry(citation, options), "");
      }
    }
  }

  return lines.join("\n").trim();
}
