import type { IndicatorStyle } from "../markdown/types.js";
import type { Citation, CitationStatus, VerificationRecord } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

/**
 * Base render options shared across all text-based render targets.
 * Each target extends this with target-specific options.
 */
export interface RenderOptions {
  /** Verification results keyed by citationKey */
  verifications?: VerificationRecord;

  /** Indicator style (uses IndicatorStyle from markdown/types.ts) */
  indicatorStyle?: IndicatorStyle;

  /** Base URL for proof pages (e.g., "https://proof.deepcitation.com") */
  proofBaseUrl?: string;

  /** Include sources/references section */
  includeSources?: boolean;

  /** Custom source labels by attachmentId */
  sourceLabels?: Record<string, string>;
}

/**
 * Citation paired with status, key, and display info for render output.
 * Re-uses the same shape as markdown's CitationWithStatus.
 */
export interface RenderCitationWithStatus {
  /** The original citation */
  citation: Citation;

  /** Citation key (hash) for matching with verifications */
  citationKey: string;

  /** Verification result (may be null if not verified) */
  verification: Verification | null;

  /** Computed verification status */
  status: CitationStatus;

  /** Citation number for reference */
  citationNumber: number;
}

/**
 * Base rendered output shared across all text-based render targets.
 * Each target extends this with target-specific fields.
 */
export interface RenderedOutput {
  /** The rendered inline content */
  content: string;

  /** The sources/references section (if requested) */
  sources?: string;

  /** Combined content + sources */
  full: string;

  /** Citation metadata */
  citations: RenderCitationWithStatus[];

  /** Proof URLs by citationKey (if proofBaseUrl provided) */
  proofUrls?: Record<string, string>;
}
