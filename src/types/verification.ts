import type { DeepTextItem, Page, ScreenBox } from "./boxes.js";
import type { Citation } from "./citation.js";
import type { SearchAttempt, SearchStatus } from "./search.js";

export const NOT_FOUND_VERIFICATION_INDEX = -1;
export const PENDING_VERIFICATION_INDEX = -2;

export const BLANK_VERIFICATION: Verification = {
  attachmentId: null,
  verifiedPageNumber: NOT_FOUND_VERIFICATION_INDEX,
  verifiedMatchSnippet: null,
  citation: {
    pageNumber: NOT_FOUND_VERIFICATION_INDEX,
  },
  status: "not_found",
};

/**
 * Content match status for URL/web content verification.
 * Used when verifying that a URL contains what the AI claimed.
 */
export type ContentMatchStatus =
  | "exact" // Content exactly matches AI's claim
  | "partial" // Content partially matches (paraphrase, summary)
  | "mismatch" // URL exists but content doesn't match claim
  | "not_found" // Claimed content not found on page
  | "not_checked" // Content not yet verified (URL inaccessible or pending)
  | "inconclusive"; // Could not determine match (e.g., dynamic content)

/**
 * URL access status for web content verification.
 */
export type UrlAccessStatus =
  | "accessible" // URL returned 200 OK
  | "redirected" // URL redirected to different domain
  | "redirected_same_domain" // URL redirected within same domain
  | "not_found" // 404 error
  | "forbidden" // 403 error
  | "server_error" // 5xx error
  | "timeout" // Request timed out
  | "blocked" // Blocked by paywall/login/antibot
  | "network_error" // DNS/connection error
  | "pending" // Not yet checked
  | "unknown"; // Unknown status

// ==========================================================================
// Sub-interfaces for type-specific verification results
// ==========================================================================

/** Document-specific verification results */
export interface DocumentVerificationResult {
  verifiedPageNumber?: number | null;
  verifiedLineIds?: number[] | null;
  totalLinesOnPage?: number | null;
  hitIndexWithinPage?: number | null;
  phraseMatchDeepItem?: DeepTextItem;
  anchorTextMatchDeepItems?: DeepTextItem[];
  verificationImageBase64?: string | null;
  verificationImageDimensions?: { width: number; height: number } | null;
}

/** URL-specific verification results */
export interface UrlVerificationResult {
  verifiedUrl?: string | null;
  resolvedUrl?: string | null;
  httpStatus?: number | null;
  urlAccessStatus?: UrlAccessStatus | null;
  contentMatchStatus?: ContentMatchStatus | null;
  contentSimilarity?: number | null;
  verifiedTitle?: string | null;
  actualContentSnippet?: string | null;
  webPageScreenshotBase64?: string | null;
  crawledAt?: Date | string | null;
  urlVerificationError?: string | null;
  verifiedDomain?: string | null;
  verifiedDescription?: string | null;
  verifiedFaviconUrl?: string | null;
  verifiedSiteName?: string | null;
  verifiedAuthor?: string | null;
  verifiedPublishedAt?: Date | string | null;
  verifiedImageUrl?: string | null;
  contentType?: string | null;
}

/** Proof hosting fields (populated when generateProofUrls is true) */
export interface VerificationProof {
  proofId?: string;
  proofUrl?: string;
  proofImageUrl?: string;
}

/**
 * A page returned from verification for user inspection.
 * Extends the existing Page type with verification-specific metadata.
 */
export interface CitationPage extends Page {
  /** Whether this page contains the verified citation match */
  isMatchPage?: boolean;
  /** Highlighted region on this page (if match found) */
  highlightBox?: ScreenBox;
}

export interface Verification {
  // ========== Identity ==========
  attachmentId?: string | null;

  label?: string | null; //e.g. "Invoice"

  citation?: Citation;

  // ========== Search ==========
  status?: SearchStatus | null;

  searchAttempts?: SearchAttempt[];

  highlightColor?: string | null;

  // ========== Shared verified text results ==========
  verifiedTimestamps?: { startTime?: string; endTime?: string } | null;

  verifiedFullPhrase?: string | null;

  verifiedAnchorText?: string | null;

  verifiedMatchSnippet?: string | null;

  verifiedAt?: Date;

  // ========== Type-specific results (NEW sub-objects) ==========
  /** Document-specific verification results */
  document?: DocumentVerificationResult;

  /** URL-specific verification results */
  url?: UrlVerificationResult;

  /** Proof hosting results */
  proof?: VerificationProof;

  // ========== Pages for user inspection ==========
  /** Pages returned from verification for user inspection */
  pages?: CitationPage[];

  // ========== Ambiguity Detection ==========
  /** Ambiguity information when multiple occurrences of the text exist */
  ambiguity?: {
    /** Total number of occurrences found in the document */
    totalOccurrences: number;
    /** Number of occurrences on the expected page */
    occurrencesOnExpectedPage: number;
    /** Confidence level in the matched occurrence */
    confidence: "high" | "medium" | "low";
    /** Human-readable note about the ambiguity */
    note: string;
  } | null;

  // ==========================================================================
  // DEPRECATED flat fields (kept for backward compat)
  // ==========================================================================

  /** @deprecated Use document?.verifiedPageNumber */
  verifiedPageNumber?: number | null;

  /** @deprecated Use document?.verifiedLineIds */
  verifiedLineIds?: number[] | null;

  /** @deprecated Use document?.totalLinesOnPage */
  totalLinesOnPage?: number | null;

  /** @deprecated Use document?.hitIndexWithinPage */
  hitIndexWithinPage?: number | null;

  /** @deprecated Use document?.phraseMatchDeepItem */
  phraseMatchDeepItem?: DeepTextItem;

  /** @deprecated Use document?.anchorTextMatchDeepItems */
  anchorTextMatchDeepItems?: DeepTextItem[];

  /** @deprecated Use document?.verificationImageBase64 */
  verificationImageBase64?: string | null;

  /** @deprecated Use document?.verificationImageDimensions */
  verificationImageDimensions?: { width: number; height: number } | null;

  /** @deprecated Use url?.verifiedUrl */
  verifiedUrl?: string | null;

  /** @deprecated Use url?.resolvedUrl */
  resolvedUrl?: string | null;

  /** @deprecated Use url?.httpStatus */
  httpStatus?: number | null;

  /** @deprecated Use url?.urlAccessStatus */
  urlAccessStatus?: UrlAccessStatus | null;

  /** @deprecated Use url?.contentMatchStatus */
  contentMatchStatus?: ContentMatchStatus | null;

  /** @deprecated Use url?.contentSimilarity */
  contentSimilarity?: number | null;

  /** @deprecated Use url?.verifiedTitle */
  verifiedTitle?: string | null;

  /** @deprecated Use url?.actualContentSnippet */
  actualContentSnippet?: string | null;

  /** @deprecated Use url?.webPageScreenshotBase64 */
  webPageScreenshotBase64?: string | null;

  /** @deprecated Use url?.crawledAt */
  crawledAt?: Date | string | null;

  /** @deprecated Use url?.urlVerificationError */
  urlVerificationError?: string | null;

  /** @deprecated Use url?.verifiedDomain */
  verifiedDomain?: string | null;

  /** @deprecated Use url?.verifiedDescription */
  verifiedDescription?: string | null;

  /** @deprecated Use url?.verifiedFaviconUrl */
  verifiedFaviconUrl?: string | null;

  /** @deprecated Use url?.verifiedSiteName */
  verifiedSiteName?: string | null;

  /** @deprecated Use url?.verifiedAuthor */
  verifiedAuthor?: string | null;

  /** @deprecated Use url?.verifiedPublishedAt */
  verifiedPublishedAt?: Date | string | null;

  /** @deprecated Use url?.verifiedImageUrl */
  verifiedImageUrl?: string | null;

  /** @deprecated Use url?.contentType */
  contentType?: string | null;

  /** @deprecated Use proof?.proofId */
  proofId?: string;

  /** @deprecated Use proof?.proofUrl */
  proofUrl?: string;

  /** @deprecated Use proof?.proofImageUrl */
  proofImageUrl?: string;
}
