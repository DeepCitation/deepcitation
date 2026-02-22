/**
 * Citation status derivation — single source of truth.
 *
 * Consolidates all status classification logic that was previously duplicated
 * across CitationComponent.tsx and CitationDrawer.utils.tsx. Every function
 * that needs to know "is this a partial match?" or "what trust level?" should
 * import from here.
 *
 * @packageDocumentation
 */

import type { CitationStatus } from "../types/citation.js";
import type { MatchedVariation, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";

// =============================================================================
// PARTIAL STATUS SET
// =============================================================================

/**
 * The exhaustive set of SearchStatus values that constitute a partial match.
 * Any check for "is this partial?" MUST use this set (or `isPartialSearchStatus()`).
 *
 * Note: `found_anchor_text_only` was previously missing from CitationDrawer.utils.tsx
 * — adding it here fixes that inconsistency.
 */
const PARTIAL_STATUSES: ReadonlySet<SearchStatus> = new Set<SearchStatus>([
  "found_anchor_text_only",
  "found_on_other_page",
  "found_on_other_line",
  "partial_text_found",
  "first_word_found",
]);

/**
 * Single source of truth for whether a SearchStatus is a partial match.
 * Replaces the ad-hoc `isPartial` checks that were duplicated in 4+ locations.
 */
export function isPartialSearchStatus(status: SearchStatus | null | undefined): boolean {
  if (!status) return false;
  return PARTIAL_STATUSES.has(status);
}

// =============================================================================
// TRUST LEVEL HELPERS
// =============================================================================

/**
 * Get the trust level from a MatchedVariation.
 * Trust levels determine indicator colors:
 * - high: Green checkmark (exact or normalized full phrase)
 * - medium: Green checkmark (anchorText matches)
 * - low: Amber checkmark (partial matches)
 */
export function getTrustLevel(matchedVariation?: MatchedVariation): "high" | "medium" | "low" {
  if (!matchedVariation) return "medium";
  switch (matchedVariation) {
    case "exact_full_phrase":
    case "normalized_full_phrase":
      return "high";
    case "exact_anchor_text":
    case "normalized_anchor_text":
      return "medium";
    case "partial_full_phrase":
    case "partial_anchor_text":
    case "first_word_only":
      return "low";
    default:
      return "medium";
  }
}

/**
 * Check if a match has low trust (should show amber indicator).
 */
export function isLowTrustMatch(matchedVariation?: MatchedVariation): boolean {
  return getTrustLevel(matchedVariation) === "low";
}

// =============================================================================
// STATUS DERIVATION
// =============================================================================

/**
 * Derive citation status from a Verification object.
 * The status comes from verification.status.
 *
 * Status classification:
 * - GREEN (isVerified only): Full phrase found at expected location
 *   - "found": Exact match
 *   - "found_phrase_missed_anchor_text": Full phrase found, anchor text highlighting failed
 *
 * - AMBER (isVerified + isPartialMatch): Something found but not ideal
 *   - "found_anchor_text_only": Only anchor text found, full phrase not matched
 *   - "found_on_other_page": Found but on different page than expected
 *   - "found_on_other_line": Found but on different line than expected
 *   - "partial_text_found": Only part of the text was found
 *   - "first_word_found": Only the first word matched (lowest confidence)
 *   - Low-trust matches from matchedVariation also show amber
 *
 * - RED (isMiss): Not found
 *   - "not_found": Text not found in document
 *
 * Note: isPending is only true when status is explicitly "pending" or "loading".
 * Use the isLoading prop to show spinner when verification is in-flight.
 */
export function getStatusFromVerification(verification: Verification | null | undefined): CitationStatus {
  const status = verification?.status;

  // No verification or no status = no status flags set
  // (use isLoading prop to explicitly show loading state)
  if (!verification || !status) {
    return {
      isVerified: false,
      isMiss: false,
      isPartialMatch: false,
      isPending: false,
    };
  }

  const isMiss = status === "not_found";
  const isPending = status === "pending" || status === "loading";

  // Check if any successful search attempt has low trust
  const hasLowTrustMatch =
    verification.searchAttempts?.some(a => a.success && isLowTrustMatch(a.matchedVariation)) ?? false;

  // Partial matches show amber indicator - something found but not ideal
  const isPartialMatch = isPartialSearchStatus(status) || hasLowTrustMatch;

  // Verified = we found something (either exact or partial)
  const isVerified =
    status === "found" ||
    status === "found_phrase_missed_anchor_text" || // Full phrase found, just missed anchor text highlight
    isPartialMatch;

  return { isVerified, isMiss, isPartialMatch, isPending };
}

// =============================================================================
// STATUS LABEL
// =============================================================================

/**
 * Get a human-readable label for a CitationStatus.
 */
export function getStatusLabel(status: CitationStatus): string {
  if (status.isVerified && !status.isPartialMatch) return "Verified";
  if (status.isPartialMatch) return "Partial Match";
  if (status.isMiss) return "Not Found";
  if (status.isPending) return "Verifying...";
  return "";
}
