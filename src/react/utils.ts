import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
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

/** Returns true when the verification source is a raster image (not a PDF). */
export function isImageSource(verification: Verification | null | undefined): boolean {
  const mt = verification?.document?.mimeType;
  return typeof mt === "string" && mt.startsWith("image/");
}
