/**
 * Text cleanup utilities for removing page/line metadata from attachment text.
 * These operate on the raw page text format used by the attachment system,
 * not on citation tags.
 */
import { normalizeQuotes } from "./normalizeQuotes.js";
import { safeMatch } from "./regexSafety.js";

const PAGE_NUMBER_RE = /<\/?page_number_\d+_index_\d+>/g;
const LINE_ID_RE = /<line id="[^"]*">|<\/line>/g;

export const removePageNumberMetadata = (pageText: string): string => {
  // PAGE_NUMBER_RE is O(n) with no backtracking — safeReplace's 100KB guard
  // would reject large pages, so we call .replace() directly.
  return pageText.replace(PAGE_NUMBER_RE, "").trim();
};

export const removeLineIdMetadata = (pageText: string): string => {
  // LINE_ID_RE is O(n) with no backtracking — safeReplace's 100KB guard
  // would reject large pages, so we call .replace() directly.
  return pageText.replace(LINE_ID_RE, "");
};

/** Strip all page-number and line-id metadata tags from a raw deep-text page. */
export const cleanDeepTextPage = (pageText: string): string => removeLineIdMetadata(removePageNumberMetadata(pageText));

/**
 * Trims a long sourceContext to a window around the sourceMatch for display.
 *
 * When sourceContext is significantly longer than sourceMatch (e.g. a full page dump),
 * this returns only the surrounding context — `contextChars` characters before
 * and after the anchor — with `...` sentinels where text was cut.
 *
 * Returns the original phrase unchanged when:
 * - sourceMatch is empty or not found in sourceContext
 * - sourceContext is already short enough relative to sourceMatch
 *
 * @param sourceContext  The complete phrase (possibly very long)
 * @param sourceMatch  The specific cited text to center the window on
 * @param contextChars  Max chars of surrounding context on each side (default 150)
 */
export const trimPhraseToAnchorWindow = (
  sourceContext: string,
  sourceMatch: string | undefined | null,
  contextChars = 150,
): { text: string; prefixTrimmed: boolean; suffixTrimmed: boolean } => {
  const noTrim = { text: sourceContext, prefixTrimmed: false, suffixTrimmed: false };
  if (!sourceMatch) return noTrim;

  const idx = normalizeQuotes(sourceContext.toLowerCase()).indexOf(normalizeQuotes(sourceMatch.toLowerCase()));
  if (idx === -1) return noTrim;

  const anchorEnd = idx + sourceMatch.length;
  // Only trim when phrase is materially longer than the anchor + context window
  const windowLength = sourceMatch.length + 2 * contextChars;
  if (sourceContext.length <= windowLength) return noTrim;

  const start = Math.max(0, idx - contextChars);
  const end = Math.min(sourceContext.length, anchorEnd + contextChars);

  return {
    text: sourceContext.slice(start, end),
    prefixTrimmed: start > 0,
    suffixTrimmed: end < sourceContext.length,
  };
};

export const getCitationPageNumber = (startPageId?: string | null): number | null => {
  if (!startPageId) return null;
  // Try the structured format first (page_number_N_index_M), fall back to first digit run
  const match = safeMatch(startPageId, /page_number_(\d+)/)?.[1] ?? safeMatch(startPageId, /\d+/)?.[0];
  return match ? parseInt(match, 10) : null;
};
