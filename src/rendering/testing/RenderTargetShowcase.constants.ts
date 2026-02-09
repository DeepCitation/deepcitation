import type { Citation } from "../../types/citation.js";
import type { Verification } from "../../types/verification.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

export const DOC_CITATION_1: Citation = {
  type: "document",
  attachmentId: "abc123",
  pageNumber: 5,
  lineIds: [12, 13],
  fullPhrase: "Revenue increased by 15% in Q4 2024.",
  anchorText: "increased by 15%",
  citationNumber: 1,
};

export const DOC_CITATION_2: Citation = {
  type: "document",
  attachmentId: "abc123",
  pageNumber: 7,
  lineIds: [25],
  fullPhrase: "Operating costs decreased by 8%.",
  anchorText: "costs decreased",
  citationNumber: 2,
};

export const DOC_CITATION_3: Citation = {
  type: "document",
  attachmentId: "abc123",
  pageNumber: 12,
  lineIds: [5],
  fullPhrase: "Market share expected to grow.",
  anchorText: "Market share",
  citationNumber: 3,
};

export const URL_CITATION: Citation = {
  type: "url",
  url: "https://docs.example.com/api",
  domain: "docs.example.com",
  title: "API Reference",
  fullPhrase: "The API supports REST endpoints.",
  anchorText: "REST endpoints",
  citationNumber: 4,
};

// =============================================================================
// VERIFICATIONS
// =============================================================================

export const VERIFIED_VERIFICATION: Verification = {
  status: "found",
  verifiedPageNumber: 5,
  verifiedLineIds: [12, 13],
  verifiedMatchSnippet: "Revenue increased by 15% in Q4 2024.",
  label: "Q4 Financial Report",
};

export const PARTIAL_VERIFICATION: Verification = {
  status: "found_on_other_page",
  verifiedPageNumber: 9,
  verifiedLineIds: [30],
  label: "Q4 Financial Report",
};

export const NOT_FOUND_VERIFICATION: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
};

export const PENDING_VERIFICATION: Verification = {
  status: "pending",
};

// =============================================================================
// STATUS TYPES
// =============================================================================

export const RENDER_STATUS_TYPES = [
  { name: "Verified", verification: VERIFIED_VERIFICATION, citation: DOC_CITATION_1 },
  { name: "Partial", verification: PARTIAL_VERIFICATION, citation: DOC_CITATION_2 },
  { name: "Not Found", verification: NOT_FOUND_VERIFICATION, citation: DOC_CITATION_3 },
  { name: "Pending", verification: PENDING_VERIFICATION, citation: DOC_CITATION_1 },
] as const;

// =============================================================================
// VARIANT DEFINITIONS
// =============================================================================

export const SLACK_VARIANTS = ["brackets", "inline", "number"] as const;
export const GITHUB_VARIANTS = ["brackets", "superscript", "inline", "footnote"] as const;
export const HTML_VARIANTS = ["linter", "brackets", "chip", "superscript"] as const;
export const TERMINAL_VARIANTS = ["brackets", "inline", "minimal"] as const;

export const PROOF_BASE_URL = "https://proof.deepcitation.com";
