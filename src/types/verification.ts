import type { DeepTextItem, ScreenBox, SourcePage } from "./boxes.js";
import type { Citation } from "./citation.js";
import type { SearchAttempt, SearchStatus } from "./search.js";

export const NOT_FOUND_VERIFICATION_INDEX = -1;
export const PENDING_VERIFICATION_INDEX = -2;

export const BLANK_VERIFICATION: Verification = {
  attachmentId: null,
  verifiedMatchSnippet: null,
  citation: undefined,
  status: "not_found",
  document: {
    verifiedPageNumber: NOT_FOUND_VERIFICATION_INDEX,
  },
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

/**
 * Document-specific verification results.
 * Contains page-level match data and proof images for PDF/document citations.
 *
 * @example
 * ```typescript
 * if (verification.document) {
 *   const pageNumber = verification.document.verifiedPageNumber;
 *   const image = verification.document.verificationImageSrc;
 *   console.log(`Verified on page ${pageNumber}`);
 * }
 * ```
 */
export interface DocumentVerificationResult {
  verifiedPageNumber?: number | null;
  verifiedLineIds?: number[] | null;
  totalLinesOnPage?: number | null;
  hitIndexWithinPage?: number | null;
  phraseMatchDeepItem?: DeepTextItem;
  anchorTextMatchDeepItems?: DeepTextItem[];
  /**
   * Image source for the verification snippet. Can be a base64 data URI, a URL, or a local path.
   */
  verificationImageSrc?: string | null;
  verificationImageDimensions?: { width: number; height: number } | null;
}

/**
 * URL-specific verification results.
 * Contains web crawl data, content matching, and metadata for URL citations.
 *
 * @example
 * ```typescript
 * if (verification.url) {
 *   const title = verification.url.verifiedTitle;
 *   const status = verification.url.urlAccessStatus;
 *   const crawled = verification.url.crawledAt;
 *   console.log(`URL verified: ${title} (${status})`);
 * }
 * ```
 */
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

/**
 * Proof hosting fields (populated when generateProofUrls is true).
 * Contains URLs/IDs for externally hosted verification proof artifacts.
 *
 * @example
 * ```typescript
 * if (verification.proof) {
 *   const proofLink = verification.proof.proofUrl;
 *   const image = verification.proof.proofImageUrl;
 *   console.log(`Proof available at: ${proofLink}`);
 * }
 * ```
 */
export interface ProofHosting {
  proofId?: string;
  /** Interactive proof page URL (HTML) */
  proofUrl?: string;
  /** Direct image URL (CDN-hosted page render) */
  proofImageUrl?: string;
}

/**
 * @deprecated Use `ProofHosting` instead. Renamed to avoid collision with the URL-citation concept.
 */
export type ProofUrl = ProofHosting;

/**
 * A page returned from verification for user inspection.
 * Extends SourcePage from boxes.ts with verification-specific metadata.
 */
export interface VerificationPage extends SourcePage {
  /** Whether this page contains the verified citation match */
  isMatchPage?: boolean;
  /** Highlighted region on this page (if match found) */
  highlightBox?: ScreenBox;
  /** OCR text items on this page (forward-compatible: text selection, annotations) */
  textItems?: DeepTextItem[];
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
  proof?: ProofHosting;

  // ========== Pages for user inspection ==========
  /** Pages returned from verification for user inspection */
  pages?: VerificationPage[];

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
}
