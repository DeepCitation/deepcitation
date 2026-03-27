import type { IndicatorStyle } from "../markdown/types.js";
import type { Citation, CitationStatus, VerificationRecord } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

/** Base render options shared across all text-based render targets. */
export interface RenderOptions {
  verifications?: VerificationRecord;
  indicatorStyle?: IndicatorStyle;
  includeSources?: boolean;
  sourceLabels?: Record<string, string>;
}

/** Citation paired with status and key for render output. */
export interface RenderCitationWithStatus {
  citation: Citation;
  citationKey: string;
  verification: Verification | null;
  status: CitationStatus;
  citationNumber: number;
}

/** Base rendered output shared across all text-based render targets. */
export interface RenderedOutput {
  content: string;
  sources?: string;
  full: string;
  citations: RenderCitationWithStatus[];
}
