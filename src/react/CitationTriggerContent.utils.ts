/**
 * Citation content display utilities.
 *
 * Rendering helpers shared by CitationTriggerContent and CitationComponent.
 * Extracted here so CitationTriggerContent.tsx only exports the component.
 *
 * @packageDocumentation
 */

import { isUrlCitation } from "../types/citation.js";
import { safeReplace } from "../utils/regexSafety.js";
import { defaultMessages } from "./i18n.js";
import type { BaseCitationProps, CitationContent, CitationVariant } from "./types.js";

/** Variants that handle their own hover styling (don't need parent hover) */
export const VARIANTS_WITH_OWN_HOVER = new Set<CitationVariant>([
  "chip",
  "badge",
  "linter",
  "superscript",
  "footnote",
  "block",
]);

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

  // Block variant: shadow + lift for active; cursor for hover (border color stays from status)
  if (variant === "block") {
    if (isOpen) {
      return "shadow-[1.5px_1.5px_0px_0px_#cbd5e1] dark:shadow-[1.5px_1.5px_0px_0px_#334155] translate-y-[-1px]";
    }
    return "cursor-pointer";
  }

  if (isOpen) {
    // Active state — solid variants get luminance-inverted bg/text at the
    // call site (scan anchor reset rule, concepts.md). Inline variants get a
    // stronger overlay (up from 10% to 20%) so the active citation is
    // scannable on attention reset.
    return isSolid ? "" : "bg-black/20 dark:bg-white/20 rounded-sm";
  }

  // Hover state — only when not active
  return isSolid ? "hover:bg-dc-muted/70" : "hover:bg-black/[0.06] dark:hover:bg-white/[0.06]";
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
      return "sourceMatch";
    case "badge":
      return "source";
    default:
      return "number";
  }
}

/**
 * Strip leading/trailing brackets from text.
 * Handles cases where LLM output includes brackets in sourceMatch.
 */
function stripBrackets(text: string): string {
  return safeReplace(safeReplace(text, /^\[[\s[]*/, ""), /[\s\]]*\]$/, "");
}

/**
 * Get display text based on content type and citation data.
 * Returns "1" as fallback if no citation number is available.
 */
export function getTriggerText(
  citation: BaseCitationProps["citation"],
  content: CitationContent,
  fallbackText?: string | null,
  claimText?: string,
): string {
  if (content === "indicator") {
    return "";
  }

  if (content === "sourceMatch") {
    if (claimText) {
      return claimText;
    }
    const raw = citation.sourceMatch?.toString() || citation.citationNumber?.toString() || fallbackText || "1";
    return stripBrackets(raw);
  }

  if (content === "source") {
    // Source content: show siteName or domain (URL citations only)
    if (isUrlCitation(citation)) {
      return (
        citation.siteName || citation.domain || citation.sourceMatch?.toString() || defaultMessages["drawer.source"]
      );
    }
    return citation.sourceMatch?.toString() || defaultMessages["drawer.source"];
  }

  // content === "number"
  return citation.citationNumber?.toString() || "1";
}
