/**
 * Citation content display utilities.
 *
 * Rendering helpers shared by CitationContentDisplay and CitationComponent.
 * Extracted here so CitationContentDisplay.tsx only exports the component.
 *
 * @packageDocumentation
 */

import { safeReplace } from "../utils/regexSafety.js";
import type { BaseCitationProps, CitationContent, CitationVariant } from "./types.js";
import { cn, isUrlCitation } from "./utils.js";

/** Variants that handle their own hover styling (don't need parent hover) */
export const VARIANTS_WITH_OWN_HOVER = new Set<CitationVariant>(["chip", "badge", "linter", "superscript", "footnote"]);

/** Variants rendered on a solid gray background (chip, badge). */
const SOLID_BG_VARIANTS = new Set<CitationVariant>(["chip", "badge"]);

/**
 * Get neutral interaction classes (hover + active) for a citation trigger.
 *
 * When `isOpen` is true the trigger shows a persistent "active" background and
 * hover classes are suppressed (mutually exclusive states).
 *
 * @param isOpen  - Whether the popover/tooltip is currently open
 * @param variant - The citation display variant
 * @returns A single className string with the appropriate interaction classes
 */
export function getInteractionClasses(isOpen: boolean, variant: CitationVariant): string {
  const isSolid = SOLID_BG_VARIANTS.has(variant);

  if (isOpen) {
    // Active state — persistent, not hover-dependent
    return isSolid
      ? cn("bg-gray-200 dark:bg-gray-700", "ring-1 ring-black/[0.08] dark:ring-white/[0.08]")
      : "bg-black/[0.10] dark:bg-white/[0.10]";
  }

  // Hover state — only when not active
  return isSolid
    ? "hover:bg-gray-200/70 dark:hover:bg-gray-700/70"
    : "hover:bg-black/[0.06] dark:hover:bg-white/[0.06]";
}

/**
 * Get the default content type based on variant.
 */
export function getDefaultContent(variant: CitationVariant): CitationContent {
  switch (variant) {
    case "chip":
    case "text":
    case "brackets":
    case "linter":
      return "anchorText";
    case "badge":
      return "source";
    default:
      return "number";
  }
}

/**
 * Strip leading/trailing brackets from text.
 * Handles cases where LLM output includes brackets in anchorText.
 */
function stripBrackets(text: string): string {
  return safeReplace(safeReplace(text, /^\[[\s[]*/, ""), /[\s\]]*\]$/, "");
}

/**
 * Get display text based on content type and citation data.
 * Returns "1" as fallback if no citation number is available.
 */
export function getDisplayText(
  citation: BaseCitationProps["citation"],
  content: CitationContent,
  fallbackDisplay?: string | null,
): string {
  if (content === "indicator") {
    return "";
  }

  if (content === "anchorText") {
    const raw = citation.anchorText?.toString() || citation.citationNumber?.toString() || fallbackDisplay || "1";
    return stripBrackets(raw);
  }

  if (content === "source") {
    // Source content: show siteName or domain (URL citations only)
    if (isUrlCitation(citation)) {
      return citation.siteName || citation.domain || citation.anchorText?.toString() || "Source";
    }
    return citation.anchorText?.toString() || "Source";
  }

  // content === "number"
  return citation.citationNumber?.toString() || "1";
}
