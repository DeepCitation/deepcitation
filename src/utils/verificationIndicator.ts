import { getCitationStatus } from "../parsing/parseCitation.js";
import type { Verification } from "../types/verification.js";

/**
 * Get verification status indicator character for plain text/terminal output.
 * Returns: ☑️ (fully verified), ✅ (partial match), ❌ (not found), ⌛ (pending/null), ◌ (unknown)
 *
 * For web UI, use the React CitationComponent instead which provides
 * proper styled indicators with colors and accessibility.
 */
export const getVerificationTextIndicator = (verification: Verification | null | undefined): string => {
  const status = getCitationStatus(verification);

  if (status.isMiss) return "❌";
  // Check for fully verified (not partial) first
  if (status.isVerified && !status.isPartialMatch) return "☑️";
  // Then check for partial match
  if (status.isPartialMatch) return "✅";

  if (status.isPending) return "⌛";

  return "◌";
};
