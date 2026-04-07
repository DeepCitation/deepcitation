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
  return pageText.replace(PAGE_NUMBER_RE, "").trim();
};

export const removeLineIdMetadata = (pageText: string): string => {
  return pageText.replace(LINE_ID_RE, "");
};

/**
 * Trims a long fullPhrase to a window around the anchorText for display.
 *
 * When fullPhrase is significantly longer than anchorText (e.g. a full page dump),
 * this returns only the surrounding context — `contextChars` characters before
 * and after the anchor — with `...` sentinels where text was cut.
 *
 * Returns the original phrase unchanged when:
 * - anchorText is empty or not found in fullPhrase
 * - fullPhrase is already short enough relative to anchorText
 *
 * @param fullPhrase  The complete phrase (possibly very long)
 * @param anchorText  The specific cited text to center the window on
 * @param contextChars  Max chars of surrounding context on each side (default 150)
 */
export const trimPhraseToAnchorWindow = (
  fullPhrase: string,
  anchorText: string | undefined | null,
  contextChars = 150,
): { text: string; prefixTrimmed: boolean; suffixTrimmed: boolean } => {
  const noTrim = { text: fullPhrase, prefixTrimmed: false, suffixTrimmed: false };
  if (!anchorText) return noTrim;

  const idx = normalizeQuotes(fullPhrase.toLowerCase()).indexOf(normalizeQuotes(anchorText.toLowerCase()));
  if (idx === -1) return noTrim;

  const anchorEnd = idx + anchorText.length;
  // Only trim when phrase is materially longer than the anchor + context window
  const windowLength = anchorText.length + 2 * contextChars;
  if (fullPhrase.length <= windowLength) return noTrim;

  const start = Math.max(0, idx - contextChars);
  const end = Math.min(fullPhrase.length, anchorEnd + contextChars);

  return {
    text: fullPhrase.slice(start, end),
    prefixTrimmed: start > 0,
    suffixTrimmed: end < fullPhrase.length,
  };
};

export const getCitationPageNumber = (startPageId?: string | null): number | null => {
  if (!startPageId) return null;
  // Try the structured format first (page_number_N_index_M), fall back to first digit run
  const match = safeMatch(startPageId, /page_number_(\d+)/)?.[1] ?? safeMatch(startPageId, /\d+/)?.[0];
  return match ? parseInt(match, 10) : null;
};
