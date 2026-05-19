/**
 * Citation verification status derivation.
 *
 * Operates on Verification objects (not raw LLM output) — this is a
 * verification-layer concern, not a parsing concern.
 */

import type { CitationStatus } from "../types/citation.js";
import type { MatchedVariation, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";

/**
 * Module-level status sets for O(1) lookups — avoids per-call array allocations.
 */
export const PARTIAL_STATUSES: ReadonlySet<SearchStatus> = new Set<SearchStatus>([
  "found_source_match_only",
  "partial_text_found",
  "found_on_other_page",
  "found_on_other_line",
  "first_word_found",
]);

const LOW_TRUST_VARIATIONS: ReadonlySet<MatchedVariation> = new Set<MatchedVariation>([
  "partial_source_context",
  "partial_source_match",
  "first_word_only",
]);

/** The fields of a citation needed to detect an approximate (`≈`) match. */
export interface ApproximateMatchInput {
  /** Text the model displayed inline when it differs from the verbatim sourceMatch. */
  claimText?: string | null;
  /** The verbatim span the verifier located in the source. */
  sourceMatch?: string | null;
}

/**
 * A citation is an *approximate* match when the text the model displayed inline
 * (`claimText`) is not verbatim what was located in the source (`sourceMatch`)
 * — the case the popover marks with a `≈`. Such a citation must never read as
 * fully Verified: the product's promise is that Verified means verified. See
 * tracker issue 18.
 */
function isApproximateMatch(citation: ApproximateMatchInput | null | undefined): boolean {
  if (!citation) return false;
  const { claimText, sourceMatch } = citation;
  return !!claimText && !!sourceMatch && claimText !== sourceMatch;
}

/**
 * A verification is *ambiguous* when the verifier detected a cross-document
 * collision and recorded a low-confidence `ambiguity` block — many distinct
 * occurrences of the text resolved to the same passage. The matched text is
 * genuinely present, but the verifier itself is not confident the located
 * occurrence is the intended one. Such a citation must never read as fully
 * Verified: the product's promise is that Verified means verified. See tracker
 * issue 58 (UI-surfacing follow-on to the issue-36 verifier-side detection).
 */
function isLowConfidenceAmbiguous(verification: Verification): boolean {
  return verification.ambiguity?.confidence === "low";
}

/**
 * Calculates the verification status of a citation based on the found highlight and search state.
 *
 * Checks both the top-level SearchStatus and individual searchAttempts for
 * low-trust matchedVariation values (partial_source_context, partial_source_match,
 * first_word_only). A successful attempt with a low-trust variation is classified
 * as a partial match (amber) rather than fully verified (green).
 *
 * When `citation` is supplied and its `claimText` differs from its
 * `sourceMatch` (an approximate `≈` match), the result is downgraded to a
 * partial match — an approximate anchor is never fully Verified (issue 18).
 *
 * When the verification carries a low-confidence `ambiguity` block (a detected
 * cross-document collision), the result is likewise downgraded to a partial
 * match — an ambiguous collision is never fully Verified (issue 58).
 *
 * @param verification - The found highlight location, or null/undefined if not found
 * @param citation - Optional citation fields used to detect an approximate match
 * @returns An object containing boolean flags for verification status
 */
export function getCitationStatus(
  verification: Verification | null | undefined,
  citation?: ApproximateMatchInput | null,
): CitationStatus {
  const approximate = isApproximateMatch(citation);

  if (!verification) {
    return { isVerified: false, isMiss: false, isPartialMatch: false, isPending: false };
  }

  const ambiguous = isLowConfidenceAmbiguous(verification);

  const status = verification.status;

  // Check searchAttempts regardless of status — a null status verification may
  // still carry low-trust match data from completed search attempts.
  const hasLowTrustMatch =
    verification.searchAttempts?.some(
      a => a.success && a.matchedVariation && LOW_TRUST_VARIATIONS.has(a.matchedVariation),
    ) ?? false;

  if (!status) {
    // Verification exists but server hasn't set a status yet — treat as partial
    // if low-trust matches were found, otherwise unknown (all-false).
    const partial = hasLowTrustMatch || approximate || ambiguous;
    return { isVerified: partial, isMiss: false, isPartialMatch: partial, isPending: false };
  }

  const isMiss = status === "not_found";
  const isPending = status === "pending" || status === "loading";
  // An approximate match (claimText ≠ sourceMatch) downgrades to partial — it
  // is never fully Verified, even when the verifier reports `found` (issue 18).
  // A low-confidence ambiguity collision likewise downgrades to partial — the
  // verifier itself flagged the located occurrence as not confidently the
  // intended one, so it is never fully Verified (issue 58).
  const isPartialMatch = PARTIAL_STATUSES.has(status) || hasLowTrustMatch || approximate || ambiguous;
  const isVerified = status === "found" || status === "found_context_missed_source_match" || isPartialMatch;

  return { isVerified, isMiss, isPartialMatch, isPending };
}
