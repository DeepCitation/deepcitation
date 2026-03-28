import type { Citation, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import type { IndicatorStyle, LinePosition, RenderMarkdownOptions } from "./types.js";
import { INDICATOR_SETS, SUPERSCRIPT_DIGITS } from "./types.js";

/**
 * Line position thresholds for humanizing line IDs.
 * These define the boundaries for categorizing where on a page a line appears.
 * Each threshold is exclusive (uses < comparison).
 */
const LINE_POSITION_THRESHOLDS = {
  START: 0.2, // 0% to <20% of page
  EARLY: 0.33, // 20% to <33% of page
  MIDDLE: 0.66, // 33% to <66% of page
  LATE: 0.8, // 66% to <80% of page
  // END: 80% to 100% of page (implicit)
} as const;

/**
 * Get the indicator string for a verification status.
 */
export function getIndicator(status: CitationStatus, style: IndicatorStyle = "check"): string {
  const indicators = INDICATOR_SETS[style];

  if (status.isMiss) return indicators.notFound;
  if (status.isPartialMatch) return indicators.partial;
  if (status.isVerified) return indicators.verified;
  if (status.isPending) return indicators.pending;

  return indicators.pending;
}

/**
 * Convert a number to unicode superscript.
 * @param num - A non-negative integer
 * @returns The number as unicode superscript characters
 * @example toSuperscript(123) => "¹²³"
 */
export function toSuperscript(num: number): string {
  // Handle non-integers by truncating to integer
  const intNum = Math.trunc(num);
  // Handle negative numbers by using absolute value
  const absNum = Math.abs(intNum);
  return String(absNum)
    .split("")
    .map(digit => SUPERSCRIPT_DIGITS[parseInt(digit, 10)] || digit)
    .join("");
}

/**
 * Humanize a line ID to a relative position on the page.
 * Returns null if totalLinesOnPage is not available.
 *
 * @example humanizeLinePosition(10, 100) => "start"
 * @example humanizeLinePosition(50, 100) => "middle"
 */
export function humanizeLinePosition(lineId: number, totalLinesOnPage: number | null | undefined): LinePosition | null {
  if (!totalLinesOnPage || totalLinesOnPage <= 0) return null;

  const ratio = lineId / totalLinesOnPage;

  if (ratio < LINE_POSITION_THRESHOLDS.START) return "start";
  if (ratio < LINE_POSITION_THRESHOLDS.EARLY) return "early";
  if (ratio < LINE_POSITION_THRESHOLDS.MIDDLE) return "middle";
  if (ratio < LINE_POSITION_THRESHOLDS.LATE) return "late";
  return "end";
}

/**
 * Format page location string with optional humanized line position.
 */
export function formatPageLocation(
  citation: Citation,
  verification: Verification | null,
  options: RenderMarkdownOptions,
): string {
  const { showPageNumber = true, showLinePosition = true } = options;

  if (!showPageNumber) return "";

  // URL citations don't have page numbers or line IDs
  if (citation.type === "url") return "";

  const pageNumber = verification?.document?.verifiedPageNumber ?? citation.pageNumber;
  if (!pageNumber || pageNumber < 0) return "";

  let location = `p.${pageNumber}`;

  // Add humanized line position for mismatches if available
  if (
    showLinePosition &&
    verification?.status === "found_on_other_line" &&
    citation.lineIds?.length &&
    verification.document?.verifiedLineIds?.length
  ) {
    const expectedLineId = citation.lineIds[0];
    const foundLineId = verification.document?.verifiedLineIds[0];
    const totalLines = verification.document?.totalLinesOnPage;

    const expectedPos = humanizeLinePosition(expectedLineId, totalLines);
    const foundPos = humanizeLinePosition(foundLineId, totalLines);

    if (expectedPos && foundPos && expectedPos !== foundPos) {
      location += ` (expected ${expectedPos}, found ${foundPos})`;
    }
  }

  return location;
}
