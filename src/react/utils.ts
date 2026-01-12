import { sha1Hash } from "../utils/sha.js";
import type { Citation } from "../types/citation.js";

/**
 * Generates a unique, deterministic key for a citation based on its content.
 * Uses a hash of the citation's identifying properties.
 */
export function generateCitationKey(citation: Citation): string {
  const keyParts = [
    citation.fileId || "",
    citation.pageNumber?.toString() || "",
    citation.fullPhrase || "",
    citation.value || "",
    citation.citationNumber?.toString() || "",
    citation.lineIds?.join(",") || "",
    citation.timestamps?.startTime || "",
    citation.timestamps?.endTime || "",
  ];

  return sha1Hash(keyParts.join("|")).slice(0, 16);
}

/**
 * Generates a unique instance ID for a citation component render.
 * Combines the citation key with a random suffix for uniqueness.
 */
export function generateCitationInstanceId(citationKey: string): string {
  const randomSuffix = Math.random().toString(36).substr(2, 9);
  return `${citationKey}-${randomSuffix}`;
}

/**
 * Gets the display text for a citation based on configuration.
 */
export function getCitationDisplayText(
  citation: Citation,
  options: {
    displayCitationValue?: boolean;
    fallbackDisplay?: string | null;
  } = {}
): string {
  const { displayCitationValue = false, fallbackDisplay } = options;

  if (displayCitationValue) {
    return (
      citation.value ||
      citation.citationNumber?.toString() ||
      fallbackDisplay ||
      ""
    );
  }

  return citation.citationNumber?.toString() || "";
}

/**
 * Gets the value text to display before the citation bracket.
 */
export function getCitationValueText(
  citation: Citation,
  options: {
    displayCitationValue?: boolean;
  } = {}
): string {
  const { displayCitationValue = false } = options;

  if (displayCitationValue) {
    return "";
  }

  return citation.value || "";
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
