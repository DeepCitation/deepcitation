import type { CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getCitationStatus } from "./citationStatus.js";

/**
 * Computes a composite status from a parent verification and its children.
 * Uses worst-child-wins: if ANY child (or parent) is miss/pending/partial,
 * the composite reflects the worst status.
 *
 * Priority: isMiss > isPending > isPartialMatch > isVerified.
 *
 * Note: when `isPartialMatch` is true, `isVerified` is also true — partial match
 * is a sub-state of verified ("found, but only source text matched, not context").
 * These two flags are not mutually exclusive.
 */
export function computeCompositeStatus(
  parentVerification: Verification | null | undefined,
  childVerifications: (Verification | null | undefined)[],
): CitationStatus {
  const allStatuses = [getCitationStatus(parentVerification), ...childVerifications.map(v => getCitationStatus(v))];

  const hasMiss = allStatuses.some(s => s.isMiss);
  const hasPending = allStatuses.some(s => s.isPending);
  const hasPartial = allStatuses.some(s => s.isPartialMatch);
  const allVerified = allStatuses.every(s => s.isVerified && !s.isPartialMatch);

  if (hasMiss) return { isVerified: false, isMiss: true, isPartialMatch: false, isPending: false };
  if (hasPending) return { isVerified: false, isMiss: false, isPartialMatch: false, isPending: true };
  if (hasPartial) return { isVerified: true, isMiss: false, isPartialMatch: true, isPending: false };
  if (allVerified) return { isVerified: true, isMiss: false, isPartialMatch: false, isPending: false };

  return { isVerified: false, isMiss: false, isPartialMatch: false, isPending: false };
}
