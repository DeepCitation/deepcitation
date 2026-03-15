/**
 * Citation status derivation — single source of truth.
 *
 * Consolidates all status classification logic that was previously duplicated
 * across Citation.tsx and CitationDrawer.utils.tsx. Every function
 * that needs to know "is this a partial match?" or "what trust level?" should
 * import from here.
 *
 * @packageDocumentation
 */

import type { CitationStatus } from "../types/citation.js";
import type { MatchedVariation, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { defaultTranslator, type TranslateFunction } from "./i18n.js";

const PARTIAL_STATUSES: ReadonlySet<SearchStatus> = new Set<SearchStatus>([
  "found_anchor_text_only",
  "found_on_other_page",
  "found_on_other_line",
  "partial_text_found",
  "first_word_found",
]);

const LOW_TRUST_VARIATIONS: ReadonlySet<MatchedVariation> = new Set<MatchedVariation>([
  "partial_full_phrase",
  "partial_anchor_text",
  "first_word_only",
]);

export function isPartialSearchStatus(status: SearchStatus | null | undefined): boolean {
  if (!status) return false;
  return PARTIAL_STATUSES.has(status);
}

/**
 * Derive citation status from a Verification object.
 *
 * Status classification:
 * - GREEN (isVerified only): "found", "found_phrase_missed_anchor_text"
 * - AMBER (isVerified + isPartialMatch): partial statuses or low-trust matchedVariation
 * - RED (isMiss): "not_found"
 *
 * Note: isPending is only true when status is explicitly "pending" or "loading".
 * Use the isLoading prop to show spinner when verification is in-flight.
 */
export function getStatusFromVerification(verification: Verification | null | undefined): CitationStatus {
  const status = verification?.status;

  if (!verification || !status) {
    return { isVerified: false, isMiss: false, isPartialMatch: false, isPending: false };
  }

  const isMiss = status === "not_found";
  const isPending = status === "pending" || status === "loading";

  const hasLowTrustMatch =
    verification.searchAttempts?.some(
      a => a.success && a.matchedVariation && LOW_TRUST_VARIATIONS.has(a.matchedVariation),
    ) ?? false;

  const isPartialMatch = isPartialSearchStatus(status) || hasLowTrustMatch;

  const isVerified = status === "found" || status === "found_phrase_missed_anchor_text" || isPartialMatch;

  return { isVerified, isMiss, isPartialMatch, isPending };
}

export function getStatusLabel(status: CitationStatus, t: TranslateFunction = defaultTranslator): string {
  if (status.isVerified && !status.isPartialMatch) return t("status.verified");
  if (status.isPartialMatch) return t("status.partialMatch");
  if (status.isMiss) return t("status.notFound");
  if (status.isPending) return t("status.verifying");
  return "";
}
