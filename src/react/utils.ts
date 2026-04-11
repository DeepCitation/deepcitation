import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Joins class names, filtering out falsy values.
 */
export function classNames(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Shorthand alias for {@link classNames}. */
export const cn = classNames;

/**
 * Generates a unique instance ID for a citation component render.
 * Combines the citation key with a random suffix for uniqueness.
 */
export function generateCitationInstanceId(citationKey: string): string {
  const randomSuffix = Math.random().toString(36).slice(2, 11);
  return `${citationKey}-${randomSuffix}`;
}

/**
 * Gets the claim text for a citation (sourceMatch with fallback to number).
 */
export function getCitationClaimText(
  citation: Citation,
  options: {
    fallbackText?: string | null;
  } = {},
): string {
  const { fallbackText } = options;
  return citation.sourceMatch?.toString() || citation.citationNumber?.toString() || fallbackText || "1";
}

/**
 * Gets the citation number as a string.
 */
export function getCitationNumber(citation: Citation): string {
  return citation.citationNumber?.toString() || "1";
}

/**
 * Gets the sourceMatch text from a citation.
 */
export function getCitationSourceMatch(citation: Citation): string {
  return citation.sourceMatch?.toString() || "";
}

/**
 * Default padding values for citation styling.
 */
export const CITATION_X_PADDING = 4;
export const CITATION_Y_PADDING = 1;

/**
 * Normalizes garbled snippet text from the verification API for display.
 *
 * The API's internal text extraction produces artifacts (collapsed spaces,
 * missing punctuation spaces) that differ from the `prepare` pipeline.
 * A "found" citation with garbled display text damages trust more than
 * a partial, so we clean it up client-side before rendering.
 *
 * When a `referenceText` is provided (typically the citation's sourceContext),
 * uses it as a spacing template: strips spaces from both, finds the overlap,
 * and transfers correct spacing from the reference to the garbled snippet.
 * Falls back to regex heuristics for text not covered by the reference.
 */
export function normalizeSnippetText(text: string, referenceText?: string | null): string {
  if (!text) return text;

  // Phase 1: Reference-guided normalization (when sourceContext is available).
  // The sourceContext has correct spacing from the LLM; the snippet has the same
  // words but with collapsed/missing spaces from the API's OCR extraction.
  let result = text;
  if (referenceText) {
    result = applyReferenceSpacing(result, referenceText);
  }

  // Phase 2: Regex heuristics for remaining artifacts not covered by reference.
  // Insert space between lowercase→uppercase: "educationalFacilities" → "educational Facilities"
  result = result.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Insert space after sentence-ending punctuation + uppercase: "overruled.We" → "overruled. We"
  result = result.replace(/([.;:!?])([A-Z])/g, "$1 $2");
  // Insert space between letter+quote+letter: 'equal"has' → 'equal" has'
  result = result.replace(/([a-zA-Z])(["'"'"])([a-zA-Z])/g, "$1$2 $3");

  return result;
}

/**
 * Transfers spacing from a clean reference text to a garbled snippet.
 *
 * Algorithm: strip all whitespace from both texts. If the stripped garbled
 * text is a substring of the stripped reference (case-insensitive), rebuild
 * the garbled text using the reference's spacing. Otherwise return the garbled
 * text unchanged (regex heuristics in the caller handle the rest).
 *
 * Note: preserves the garbled text's original casing; the reference is used
 * only for spacing, not case correction.
 */
function applyReferenceSpacing(garbled: string, reference: string): string {
  const garbledStripped = garbled.replace(/\s+/g, "");
  if (garbledStripped.length === 0) return garbled;

  // Find where the garbled text (without spaces) appears in the reference (without spaces)
  const refStripped = reference.replace(/\s+/g, "");
  const matchIdx = refStripped.toLowerCase().indexOf(garbledStripped.toLowerCase());
  if (matchIdx < 0) return garbled; // No overlap — fall through to regex

  // Build a map: for each position in the stripped reference,
  // record whether the original reference has whitespace before it.
  const spaceBeforePositions = new Set<number>();
  let strippedIdx = 0;
  for (let i = 0; i < reference.length; i++) {
    if (/\s/.test(reference[i])) continue;
    if (i > 0 && /\s/.test(reference[i - 1])) {
      spaceBeforePositions.add(strippedIdx);
    }
    strippedIdx++;
  }

  // Rebuild using the original garbled characters but with reference spacing
  let result = "";
  for (let i = 0; i < garbledStripped.length; i++) {
    if (i > 0 && spaceBeforePositions.has(matchIdx + i)) {
      result += " ";
    }
    result += garbledStripped[i];
  }
  return result;
}

/**
 * Truncates a string in the middle, preserving the start and end.
 * Useful for API keys, IDs, and hashes where both prefix and suffix matter.
 */
export function truncateMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  if (maxLength <= 1) return maxLength === 1 ? "…" : "";
  const half = Math.floor((maxLength - 1) / 2);
  const endLength = maxLength - 1 - half;
  return `${str.slice(0, half)}…${str.slice(-endLength)}`;
}

/** Returns true when the verification source is a raster image (not a PDF). */
export function isImageSource(verification: Verification | null | undefined): boolean {
  const mt = verification?.document?.mimeType;
  return typeof mt === "string" && mt.startsWith("image/");
}
