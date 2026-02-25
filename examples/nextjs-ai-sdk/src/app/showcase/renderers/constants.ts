import type { Citation, Verification } from "deepcitation";
import { generateCitationKey } from "deepcitation/react";

/**
 * Sample LLM output with <cite> tags for rendering demos.
 */
export const SAMPLE_LLM_OUTPUT = `According to the financial report, <cite attachment_id="abc123" start_page_key="page_number_5_index_0" full_phrase="Revenue increased by 15% in Q4 2024." anchor_text="revenue increased by 15%" line_ids="12,13" /> compared to the previous quarter.

The report also notes that <cite attachment_id="abc123" start_page_key="page_number_7_index_0" full_phrase="Operating costs decreased by 8%." anchor_text="operating costs decreased by 8%" line_ids="25" /> which contributed to improved profit margins.

However, analysts note that <cite attachment_id="abc123" start_page_key="page_number_12_index_0" full_phrase="Market share expected to grow." anchor_text="market share is expected to grow" line_ids="5" /> in the coming fiscal year.`;

/**
 * Sample citations matching the <cite> tags above.
 * Used to generate citationKeys for the sample verifications.
 */
const CITATION_1: Citation = {
  type: "document",
  attachmentId: "abc123",
  pageNumber: 5,
  lineIds: [12, 13],
  fullPhrase: "Revenue increased by 15% in Q4 2024.",
  anchorText: "revenue increased by 15%",
  citationNumber: 1,
};

const CITATION_2: Citation = {
  type: "document",
  attachmentId: "abc123",
  pageNumber: 7,
  lineIds: [25],
  fullPhrase: "Operating costs decreased by 8%.",
  anchorText: "operating costs decreased by 8%",
  citationNumber: 2,
};

// anchorText intentionally mismatches fullPhrase ("is" inserted) to demonstrate not-found verification status
const CITATION_3: Citation = {
  type: "document",
  attachmentId: "abc123",
  pageNumber: 12,
  lineIds: [5],
  fullPhrase: "Market share expected to grow.",
  anchorText: "market share is expected to grow",
  citationNumber: 3,
};

/**
 * Sample verifications keyed by citationKey hash.
 * Demonstrates verified, partial, and not-found statuses.
 */
export const SAMPLE_VERIFICATIONS: Record<string, Verification> = {
  [generateCitationKey(CITATION_1)]: {
    status: "found",
    verifiedPageNumber: 5,
    verifiedLineIds: [12, 13],
    verifiedMatchSnippet: "Revenue increased by 15% in Q4 2024.",
    label: "Q4 Financial Report",
  },
  [generateCitationKey(CITATION_2)]: {
    status: "found_on_other_page",
    verifiedPageNumber: 9,
    verifiedLineIds: [30],
    label: "Q4 Financial Report",
  },
  [generateCitationKey(CITATION_3)]: {
    status: "not_found",
    verifiedPageNumber: -1,
  },
};

export const PROOF_BASE_URL = "https://proof.deepcitation.com";

export const SLACK_VARIANTS = ["brackets", "inline", "number"] as const;
export const GITHUB_VARIANTS = ["brackets", "superscript", "inline", "footnote"] as const;
export const HTML_VARIANTS = ["linter", "brackets", "chip", "superscript"] as const;
export const TERMINAL_VARIANTS = ["brackets", "inline", "minimal"] as const;
