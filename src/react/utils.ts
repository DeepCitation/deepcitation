import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { sha1Hash } from "../utils/sha.js";
import { getCitationPageNumber } from "../parsing/normalizeCitation.js";

/**
 * Generates a unique, deterministic key for a citation based on its content.
 *  @param citation - The citation to generate a key for
 * @returns A unique, deterministic key for the citation
 */
export function generateCitationKey(citation: Citation): string {
  const pageNumber =
    citation.pageNumber || getCitationPageNumber(citation.startPageKey);
  const keyParts = [
    citation.attachmentId || "",
    pageNumber?.toString() || "",
    citation.fullPhrase || "",
    citation.keySpan?.toString() || "",
    citation.lineIds?.join(",") || "",
    citation.timestamps?.startTime || "",
    citation.timestamps?.endTime || "",
  ];

  return sha1Hash(keyParts.join("|")).slice(0, 16);
}

/**
 * Generates a unique, deterministic key for a verification based on its content.
 * @param verification - The verification to generate a key for
 * @returns
 */
export function generateVerificationKey(verification: Verification): string {
  const keyParts = [
    verification.attachmentId || "",
    verification.label || "",
    verification.verifiedFullPhrase || "",
    verification.verifiedKeySpan || "",
    verification.verifiedLineIds?.join(",") || "",
    verification.verifiedPageNumber?.toString() || "",

    verification.verifiedTimestamps?.startTime || "",
    verification.verifiedTimestamps?.endTime || "",

    verification.verifiedMatchSnippet || "",
    verification.hitIndexWithinPage?.toString() || "",
  ];

  return sha1Hash(keyParts.join("|")).slice(0, 16);
}

/**
 * Generates a unique instance ID for a citation component render.
 * Combines the citation key with a random suffix for uniqueness.
 */
export function generateCitationInstanceId(citationKey: string): string {
  const randomSuffix = Math.random().toString(36).slice(2, 11);
  return `${citationKey}-${randomSuffix}`;
}

/**
 * Gets the display text for a citation based on configuration.
 */
export function getCitationDisplayText(
  citation: Citation,
  options: {
    hideKeySpan?: boolean;
    fallbackDisplay?: string | null;
  } = {}
): string {
  const { hideKeySpan = false, fallbackDisplay } = options;

  if (!hideKeySpan) {
    return (
      citation.keySpan?.toString() ||
      citation.citationNumber?.toString() ||
      fallbackDisplay ||
      ""
    );
  }

  return citation.citationNumber?.toString() || "";
}

/**
 * Gets the keySpan text to display before the citation bracket.
 */
export function getCitationKeySpanText(
  citation: Citation,
  options: {
    hideKeySpan?: boolean;
  } = {}
): string {
  const { hideKeySpan = false } = options;

  if (!hideKeySpan) {
    return "";
  }

  return citation.keySpan?.toString() || "";
}

/**
 * Joins class names, filtering out falsy values.
 * This is a minimal implementation for the base component.
 */
export function classNames(
  ...classes: (string | undefined | null | false)[]
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Default padding values for citation styling.
 */
export const CITATION_X_PADDING = 4;
export const CITATION_Y_PADDING = 1;
