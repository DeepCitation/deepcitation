import type { Verification } from "@deepcitation/deepcitation-js";

/**
 * Sample LLM output with <cite> tags for rendering demos.
 */
export const SAMPLE_LLM_OUTPUT = `According to the financial report, <cite attachment_id="abc123" start_page_key="page_number_5_index_0" full_phrase="Revenue increased by 15% in Q4 2024." anchor_text="revenue increased by 15%" line_ids="12,13" /> compared to the previous quarter.

The report also notes that <cite attachment_id="abc123" start_page_key="page_number_7_index_0" full_phrase="Operating costs decreased by 8%." anchor_text="operating costs decreased by 8%" line_ids="25" /> which contributed to improved profit margins.

However, analysts note that <cite attachment_id="abc123" start_page_key="page_number_12_index_0" full_phrase="Market share expected to grow." anchor_text="market share is expected to grow" line_ids="5" /> in the coming fiscal year.`;

/**
 * Sample verifications matching the citations in SAMPLE_LLM_OUTPUT.
 * These are keyed by the citationKey hash that each renderer will generate internally.
 */
export const SAMPLE_VERIFICATIONS: Record<string, Verification> = {};

export const PROOF_BASE_URL = "https://proof.deepcitation.com";

export const SLACK_VARIANTS = ["brackets", "inline", "number"] as const;
export const GITHUB_VARIANTS = ["brackets", "superscript", "inline", "footnote"] as const;
export const HTML_VARIANTS = ["linter", "brackets", "chip", "superscript"] as const;
export const TERMINAL_VARIANTS = ["brackets", "inline", "minimal"] as const;
