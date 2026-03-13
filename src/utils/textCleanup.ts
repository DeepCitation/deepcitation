/**
 * Text cleanup utilities for removing page/line metadata from attachment text.
 * These operate on the raw page text format used by the attachment system,
 * not on citation tags.
 */

export const removePageNumberMetadata = (pageText: string): string => {
  return pageText.replace(/<\/?page_number_\d+_index_\d+>/g, "").trim();
};

export const removeLineIdMetadata = (pageText: string): string => {
  const lineIdRegex = /<line id="[^"]*">|<\/line>/g;
  return pageText.replace(lineIdRegex, "");
};

export const getCitationPageNumber = (startPageId?: string | null): number | null => {
  if (!startPageId) return null;
  const pageNumber = startPageId.match(/\d+/)?.[0];
  return pageNumber ? parseInt(pageNumber, 10) : null;
};
