import type { Citation } from "./citation.js";
import type { Verification } from "./verification.js";

/** What changed in the citation between two verification passes */
export interface LlmAmendment {
  field: "fullPhrase" | "anchorText" | "pageNumber" | "lineIds" | "reasoning";
  previousValue: string | number | number[] | undefined;
  newValue: string | number | number[] | undefined;
}

/** Record of one verification pass */
export interface LlmSearchAttempt {
  submittedCitation: Citation;
  verification: Verification;
  /** What changed vs previous pass (absent for first) */
  amendments?: LlmAmendment[];
  amendmentReason?: string;
  partialRejectedAsFalsePositive?: boolean;
  durationMs?: number;
}
