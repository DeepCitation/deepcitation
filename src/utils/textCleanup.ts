/**
 * Text cleanup utilities for removing page/line metadata from attachment text.
 * These operate on the raw page text format used by the attachment system,
 * not on citation tags.
 */
import { safeMatch } from "./regexSafety.js";

const PAGE_NUMBER_RE = /<\/?page_number_\d+_index_\d+>/g;
const LINE_ID_RE = /<line id="[^"]*">|<\/line>/g;

export const removePageNumberMetadata = (pageText: string): string => {
  return pageText.replace(PAGE_NUMBER_RE, "").trim();
};

export const removeLineIdMetadata = (pageText: string): string => {
  return pageText.replace(LINE_ID_RE, "");
};

export const getCitationPageNumber = (startPageId?: string | null): number | null => {
  if (!startPageId) return null;
  // Try the structured format first (page_number_N_index_M), fall back to first digit run
  const match = safeMatch(startPageId, /page_number_(\d+)/)?.[1] ?? safeMatch(startPageId, /\d+/)?.[0];
  return match ? parseInt(match, 10) : null;
};
