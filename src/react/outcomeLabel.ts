/**
 * Outcome label derivation — single source of truth.
 *
 * Replaces the copy-pasted label logic that appeared in both
 * EvidenceTrayFooter and InlineExpandedImage inside Citation.tsx.
 *
 * @packageDocumentation
 */

import type { SearchAttempt, SearchStatus } from "../types/search.js";
import { defaultTranslator, tPlural, type TranslateFunction } from "./i18n.js";

/**
 * Derive a human-readable outcome label from verification status and search attempts.
 *
 * Examples:
 * - miss: "Scan complete · 4 searches"
 * - exact_full_phrase: "Exact match"
 * - normalized_full_phrase: "Normalized match"
 * - exact/normalized anchor_text: "Anchor text match"
 * - other success: "Match found"
 */
export function deriveOutcomeLabel(
  status: SearchStatus | null | undefined,
  searchAttempts?: SearchAttempt[],
  t: TranslateFunction = defaultTranslator,
): string {
  if (status === "not_found") {
    const count = searchAttempts?.length ?? 0;
    return tPlural(t, "outcome.scanComplete", count, { count });
  }

  const successfulAttempt = searchAttempts?.find(a => a.success);
  if (successfulAttempt?.matchedVariation === "exact_full_phrase") {
    return t("outcome.exactMatch");
  }
  if (successfulAttempt?.matchedVariation === "normalized_full_phrase") {
    return t("outcome.normalizedMatch");
  }
  if (
    successfulAttempt?.matchedVariation === "exact_anchor_text" ||
    successfulAttempt?.matchedVariation === "normalized_anchor_text"
  ) {
    return t("outcome.anchorTextMatch");
  }
  return t("outcome.matchFound");
}
