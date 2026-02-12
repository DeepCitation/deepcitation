import { getCitationPageNumber } from "../parsing/normalizeCitation.js";
import type { Citation, DocumentCitation, UrlCitation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { sha1Hash } from "../utils/sha.js";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Type guard to check if a citation is a URL citation.
 * Narrows the Citation union to UrlCitation when true.
 */
export function isUrlCitation(citation: Citation): citation is UrlCitation {
  return citation.type === "url";
}

/**
 * Type guard to check if a citation is a document citation.
 * Narrows the Citation union to DocumentCitation when true.
 */
export function isDocumentCitation(citation: Citation): citation is DocumentCitation {
  return citation.type !== "url";
}

/**
 * Generates a unique, deterministic key for a citation based on its content.
 * Works with both document and URL citation types.
 *
 * For URL citations, the URL is included in the key generation for uniqueness.
 *
 * @param citation - The citation to generate a key for
 * @returns A unique, deterministic key for the citation
 */
export function generateCitationKey(citation: Citation): string {
  // Common key parts
  const keyParts = [
    citation.fullPhrase || "",
    citation.anchorText?.toString() || "",
    citation.timestamps?.startTime || "",
    citation.timestamps?.endTime || "",
  ];

  if (isUrlCitation(citation)) {
    // URL-specific key parts
    keyParts.push(citation.url || "", citation.title || "", citation.domain || "");
  } else {
    // Document-specific key parts
    const pageNumber = citation.pageNumber || getCitationPageNumber(citation.startPageId);
    keyParts.push(
      citation.attachmentId || "",
      pageNumber?.toString() || "",
      citation.lineIds?.join(",") || "",
    );
  }

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
    verification.verifiedAnchorText || "",
    verification.document?.verifiedLineIds?.join(",") || "",
    verification.document?.verifiedPageNumber?.toString() || "",

    verification.verifiedTimestamps?.startTime || "",
    verification.verifiedTimestamps?.endTime || "",

    verification.verifiedMatchSnippet || "",
    verification.document?.hitIndexWithinPage?.toString() || "",
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
 * Gets the display text for a citation (anchorText with fallback to number).
 */
export function getCitationDisplayText(
  citation: Citation,
  options: {
    fallbackDisplay?: string | null;
  } = {},
): string {
  const { fallbackDisplay } = options;
  return citation.anchorText?.toString() || citation.citationNumber?.toString() || fallbackDisplay || "1";
}

/**
 * Gets the citation number as a string.
 */
export function getCitationNumber(citation: Citation): string {
  return citation.citationNumber?.toString() || "1";
}

/**
 * Gets the anchorText text from a citation.
 */
export function getCitationAnchorText(citation: Citation): string {
  return citation.anchorText?.toString() || "";
}

/**
 * Joins class names, filtering out falsy values.
 * This is a minimal implementation for the base component.
 */
export function classNames(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Default padding values for citation styling.
 */
export const CITATION_X_PADDING = 4;
export const CITATION_Y_PADDING = 1;
