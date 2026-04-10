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
  sourceContext: "Revenue increased by 15% in Q4 2024.",
  sourceMatch: "increased by 15%",
  citationNumber: 1,
};

export const DOC_CITATION_2: Citation = {
  type: "document",
  attachmentId: "abc123",
  pageNumber: 7,
  lineIds: [25],
  sourceContext: "Operating costs decreased by 8%.",
  sourceMatch: "costs decreased",
  citationNumber: 2,
};

export const DOC_CITATION_3: Citation = {
  type: "document",
  attachmentId: "abc123",
  pageNumber: 12,
  lineIds: [5],
  sourceContext: "Market share expected to grow.",
  sourceMatch: "Market share",
  citationNumber: 3,
};

export const URL_CITATION: Citation = {
  type: "url",
  url: "https://docs.example.com/api",
  domain: "docs.example.com",
  title: "API Reference",
  sourceContext: "The API supports REST endpoints.",
  sourceMatch: "REST endpoints",
  citationNumber: 4,
};

// =============================================================================
// VERIFICATIONS
// =============================================================================

export const VERIFIED_VERIFICATION: Verification = {
  status: "found",
  document: {
    verifiedPageNumber: 5,
    verifiedLineIds: [12, 13],
  },
  sourceSnippet: "Revenue increased by 15% in Q4 2024.",
  label: "Q4 Financial Report",
};

export const PARTIAL_VERIFICATION: Verification = {
  status: "found_on_other_page",
  document: {
    verifiedPageNumber: 9,
    verifiedLineIds: [30],
  },
  label: "Q4 Financial Report",
};

export const NOT_FOUND_VERIFICATION: Verification = {
  status: "not_found",
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

export const TERMINAL_VARIANTS = ["brackets", "inline", "minimal"] as const;
