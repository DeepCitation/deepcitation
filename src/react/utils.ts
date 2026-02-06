import { getCitationPageNumber } from "../parsing/normalizeCitation.js";
import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { sha1Hash } from "../utils/sha.js";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Type guard to check if a citation is a URL citation (type: "url" or has url field).
 */
export function isUrlCitation(citation: Citation): boolean {
  return citation.type === "url" || (typeof citation.url === "string" && citation.url.length > 0);
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
  const pageNumber = citation.pageNumber || getCitationPageNumber(citation.startPageId);

  // Base key parts for all citations
  const keyParts = [
    citation.attachmentId || "",
    pageNumber?.toString() || "",
    citation.fullPhrase || "",
    citation.anchorText?.toString() || "",
    citation.lineIds?.join(",") || "",
    citation.timestamps?.startTime || "",
    citation.timestamps?.endTime || "",
  ];

  // Add URL-specific fields if present
  if (isUrlCitation(citation)) {
    keyParts.push(citation.url || "", citation.title || "", citation.domain || "");
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
