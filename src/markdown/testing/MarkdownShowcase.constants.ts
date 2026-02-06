import type { Verification } from "../../types/verification.js";
import type { IndicatorStyle, MarkdownVariant } from "../types.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const verifiedVerification: Verification = {
  status: "found",
  verifiedPageNumber: 5,
  verifiedLineIds: [12, 13],
  verifiedMatchSnippet: "Revenue increased by 15% in Q4 2024.",
};

const partialVerification: Verification = {
  status: "found_on_other_page",
  verifiedPageNumber: 7,
  verifiedLineIds: [30],
};

const notFoundVerification: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
};

const pendingVerification: Verification = {
  status: "pending",
};

// All indicator styles
export const INDICATOR_STYLES: IndicatorStyle[] = ["check", "semantic", "circle", "square", "letter", "word", "none"];

// All markdown variants
export const MARKDOWN_VARIANTS: MarkdownVariant[] = ["inline", "brackets", "superscript", "footnote", "academic"];

// Status types for testing
export const STATUS_TYPES = [
  { name: "Verified", verification: verifiedVerification },
  { name: "Partial", verification: partialVerification },
  { name: "Not Found", verification: notFoundVerification },
  { name: "Pending", verification: pendingVerification },
] as const;
