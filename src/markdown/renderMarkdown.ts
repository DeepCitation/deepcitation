import { getCitationStatus } from "../parsing/parseCitation.js";
import { generateCitationKey } from "../react/utils.js";
import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { safeReplace } from "../utils/regexSafety.js";
import {
  getCitationDisplayText,
  getIndicator,
  renderCitationVariant,
  renderReferencesSection,
} from "./markdownVariants.js";
import type { CitationWithStatus, MarkdownOutput, RenderMarkdownOptions } from "./types.js";

/**
 * Module-level compiled regex for cite tag matching.
 * Matches self-closing <cite ... /> tags.
 */
const CITE_TAG_REGEX = /<cite\s[^>]*\/>/g;

/**
 * Regex pattern for parsing cite tag attributes.
 * Stored as pattern (not pre-compiled) so we can create fresh RegExp instances
 * in parseCiteAttributes. This avoids stateful lastIndex issues that occur when
 * reusing a global regex across multiple exec() calls on different strings.
 */
const ATTR_REGEX_PATTERN = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\2/g;

/**
 * Map of attribute key aliases to their normalized form.
 * Keys are lowercase variants that should map to a canonical attribute name.
 */
const ATTR_KEY_NORMALIZATION: Record<string, string> = {
  fileid: "attachment_id",
  file_id: "attachment_id",
  attachmentid: "attachment_id",
  anchortext: "anchor_text",
  anchor_text: "anchor_text",
  fullphrase: "full_phrase",
  full_phrase: "full_phrase",
  lineids: "line_ids",
  line_ids: "line_ids",
  pagenumber: "page_number",
  page_number: "page_number",
  citationnumber: "citation_number",
  citation_number: "citation_number",
};

/**
 * Parse attributes from a cite tag.
 */
function parseCiteAttributes(citeTag: string): Record<string, string | undefined> {
  const attrs: Record<string, string | undefined> = {};
  // Create fresh regex instance to avoid stateful lastIndex issues
  const attrRegex = new RegExp(ATTR_REGEX_PATTERN.source, ATTR_REGEX_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(citeTag)) !== null) {
    // Two-step normalization:
    // 1. Convert camelCase to snake_case (e.g., "attachmentId" -> "attachment_id")
    // 2. Lookup in alias map for legacy/alternate names (e.g., "fileid" -> "attachment_id")
    const key = match[1].replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    const value = match[3];

    const normalizedKey = ATTR_KEY_NORMALIZATION[key] ?? key;

    attrs[normalizedKey] = value;
  }

  return attrs;
}

/**
 * Build a Citation object from parsed cite tag attributes.
 */
function buildCitationFromAttrs(attrs: Record<string, string | undefined>, citationNumber: number): Citation {
  const parseLineIds = (lineIdsStr?: string): number[] | undefined => {
    if (!lineIdsStr) return undefined;
    const nums = lineIdsStr
      .split(",")
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !Number.isNaN(n));
    return nums.length > 0 ? nums : undefined;
  };

  const parsePageNumber = (pageStr?: string): number | undefined => {
    if (!pageStr) return undefined;
    // Handle page_number_X_index_Y format
    const match = pageStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : undefined;
  };

  // Unescape quotes in text fields
  const unescapeText = (str: string | undefined): string | undefined => str?.replace(/\\'/g, "'").replace(/\\"/g, '"');

  return {
    attachmentId: attrs.attachment_id,
    pageNumber: attrs.page_number ? parseInt(attrs.page_number, 10) : parsePageNumber(attrs.start_page_id),
    fullPhrase: unescapeText(attrs.full_phrase),
    anchorText: unescapeText(attrs.anchor_text),
    lineIds: parseLineIds(attrs.line_ids),
    citationNumber: attrs.citation_number ? parseInt(attrs.citation_number, 10) : citationNumber,
  };
}

/**
 * Renders LLM output with <cite /> tags to clean markdown with verification indicators.
 *
 * @param input - LLM response text containing <cite /> tags
 * @param options - Rendering options
 * @returns Structured output with markdown, references, and citation metadata
 *
 * @example Basic usage (inline with check indicators)
 * ```typescript
 * const output = renderCitationsAsMarkdown(llmOutput, {
 *   verifications,
 *   variant: "inline",
 *   indicatorStyle: "check",
 * });
 * // output.markdown: "Revenue grew 45%✓ according to the report."
 * // output.full: includes references section if requested
 * ```
 *
 * @example Footnote style with references
 * ```typescript
 * const output = renderCitationsAsMarkdown(llmOutput, {
 *   verifications,
 *   variant: "footnote",
 *   includeReferences: true,
 * });
 * // output.markdown: "Revenue grew 45%[^1] according to the report."
 * // output.references: "[^1]: \"Revenue grew 45%\" - p.3 ✓"
 * ```
 */
export function renderCitationsAsMarkdown(input: string, options: RenderMarkdownOptions = {}): MarkdownOutput {
  const { verifications = {}, includeReferences = false } = options;

  const citationsWithStatus: CitationWithStatus[] = [];
  let citationIndex = 0;

  // Replace cite tags with rendered variants
  // Use safeReplace to validate input length before regex (ReDoS prevention)
  const markdown = safeReplace(input, CITE_TAG_REGEX, match => {
    citationIndex++;
    const attrs = parseCiteAttributes(match);
    const citation = buildCitationFromAttrs(attrs, citationIndex);
    const citationKey = generateCitationKey(citation);
    const verification = verifications[citationKey] || null;
    const status = getCitationStatus(verification);

    const citationWithStatus: CitationWithStatus = {
      citation,
      citationKey,
      verification,
      status,
      displayText: getCitationDisplayText(citation, options.variant || "inline"),
      citationNumber: citationIndex,
    };

    citationsWithStatus.push(citationWithStatus);

    return renderCitationVariant(citationWithStatus, options);
  });

  // Generate references section if requested
  const references = includeReferences ? renderReferencesSection(citationsWithStatus, options) : undefined;

  // Combine markdown and references for full output
  const full = references ? `${markdown}\n\n---\n\n${references}` : markdown;

  return {
    markdown,
    references,
    full,
    citations: citationsWithStatus,
  };
}

/**
 * Simplified function that returns just the markdown string.
 * Use renderCitationsAsMarkdown() for structured output with metadata.
 *
 * @param input - LLM response text containing <cite /> tags
 * @param options - Rendering options
 * @returns Rendered markdown string (with references appended if requested)
 *
 * @example
 * ```typescript
 * const md = toMarkdown(llmOutput, {
 *   verifications,
 *   variant: "brackets",
 *   includeReferences: true,
 * });
 * ```
 */
export function toMarkdown(input: string, options: RenderMarkdownOptions = {}): string {
  return renderCitationsAsMarkdown(input, options).full;
}

/**
 * Get verification indicator for plain text/terminal output.
 * This is a re-export of the existing TUI function for convenience.
 *
 * @param verification - Verification result
 * @param style - Indicator style (default: "check")
 * @returns Indicator character(s)
 */
export function getVerificationIndicator(
  verification: Verification | null | undefined,
  style: import("./types.js").IndicatorStyle = "check",
): string {
  const status = getCitationStatus(verification);
  return getIndicator(status, style);
}
