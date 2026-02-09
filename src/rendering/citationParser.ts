import type { Citation } from "../types/citation.js";

/**
 * Regex pattern for extracting HTML attributes from cite tags.
 * Matches: name="value" or name='value'
 */
const ATTR_REGEX_PATTERN = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(['"])((?:[^'"\\]|\\.)*)\2/g;

/**
 * Parse attributes from a cite tag string.
 * Converts camelCase attributes to snake_case keys.
 *
 * @param citeTag - The cite tag string (e.g., '<cite attachment_id="abc" />')
 * @returns Object with snake_case keys and values
 */
export function parseCiteAttributes(citeTag: string): Record<string, string | undefined> {
  const attrs: Record<string, string | undefined> = {};
  const attrRegex = new RegExp(ATTR_REGEX_PATTERN.source, ATTR_REGEX_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(citeTag)) !== null) {
    const key = match[1].replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    attrs[key] = match[3];
  }
  return attrs;
}

/**
 * Build a Citation object from parsed attributes.
 *
 * @param attrs - Parsed attributes from parseCiteAttributes()
 * @param citationNumber - The citation number for this citation
 * @returns Citation object
 */
export function buildCitationFromAttrs(attrs: Record<string, string | undefined>, citationNumber: number): Citation {
  const unescapeText = (str: string | undefined): string | undefined => str?.replace(/\\'/g, "'").replace(/\\"/g, '"');

  const parsePageNumber = (pageStr?: string): number | undefined => {
    if (!pageStr) return undefined;
    const match = pageStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : undefined;
  };

  const parseLineIds = (lineIdsStr?: string): number[] | undefined => {
    if (!lineIdsStr) return undefined;
    const nums = lineIdsStr
      .split(",")
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !Number.isNaN(n));
    return nums.length > 0 ? nums : undefined;
  };

  return {
    type: "document",
    attachmentId: attrs.attachment_id,
    pageNumber: attrs.page_number ? parseInt(attrs.page_number, 10) : parsePageNumber(attrs.start_page_id),
    fullPhrase: unescapeText(attrs.full_phrase),
    anchorText: unescapeText(attrs.anchor_text),
    lineIds: parseLineIds(attrs.line_ids),
    citationNumber,
  };
}
