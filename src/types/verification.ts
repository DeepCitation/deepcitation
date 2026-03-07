import type { DeepTextItem, ScreenBox } from "./boxes.js";
import type { Citation } from "./citation.js";
import type { SearchAttempt, SearchStatus } from "./search.js";

// ==========================================================================
// Shared utility types
// ==========================================================================

// ==========================================================================
// File / download artifact types
// ==========================================================================

/**
 * Download link for an artifact file.
 */
export interface DownloadLink {
  url: string;
  /** Optional expiration timestamp for signed links */
  expiresAt?: (string & {}) | "never";
}

/**
 * A downloadable file artifact (original upload or converted version).
 * Replaces the previous nested VerificationDocumentAssets / OriginalFileAsset / VerificationPdfAsset hierarchy.
 *
 * - `originalDownload`: the file as received (PDF, DOCX, MP4, …)
 * - `convertedDownload`: a processing artifact (PDF rendition, AV transcript, …)
 */
export interface FileDownload {
  filename?: string;
  mimeType?: string;
  /** Signed download link */
  link: DownloadLink;
}

// ==========================================================================
// Evidence / page image types
// ==========================================================================

/**
 * Status of page image generation for an attachment.
 * - `"pending"`: Page images are queued or being generated
 * - `"generating"`: Actively rendering page images (long documents)
 * - `"completed"`: All page images are available
 * - `"failed"`: Page image generation encountered an error
 */
export type PageImagesStatus = "pending" | "generating" | "completed" | "failed";

/**
 * Evidence image artifact — keyhole crop of the verified region.
 * Carries its own `textItems` scoped to the crop region for overlay rendering.
 */
export interface EvidenceImage {
  src: string;
  dimensions?: { width: number; height: number };
  /** DeepTextItems for the highlighted crop region */
  textItems?: DeepTextItem[];
}

/**
 * Content match status for URL/web content verification.
 * Used when verifying that a URL contains what the AI claimed.
 */
export type ContentMatchStatus = "exact" | "partial" | "mismatch" | "not_found" | "not_checked" | "inconclusive";

/**
 * URL access status for web content verification.
 */
export type UrlAccessStatus =
  | "accessible"
  | "redirected"
  | "redirected_same_domain"
  | "not_found"
  | "forbidden"
  | "server_error"
  | "timeout"
  | "blocked"
  | "network_error"
  | "pending"
  | "unknown";

// ==========================================================================
// Sub-interfaces for type-specific verification results
// ==========================================================================

/**
 * Document-specific verification results.
 * Contains page-level match data for PDF/document citations.
 *
 * @example
 * ```typescript
 * if (verification.document) {
 *   const pageNumber = verification.document.verifiedPageNumber;
 *   const image = verification.evidence?.src;
 *   console.log(`Verified on page ${pageNumber}`);
 * }
 * ```
 */
export interface DocumentVerificationResult {
  verifiedPageNumber?: number;
  verifiedLineIds?: number[];
  /**
   * MIME type of the source attachment (e.g. "application/pdf", "image/jpeg").
   * When set and starting with "image/", page references like "p.1" are
   * replaced with "Image" in the citation popover UI.
   */
  mimeType?: string;
  totalLinesOnPage?: number;
  hitIndexWithinPage?: number;
  phraseMatchDeepItem?: DeepTextItem;
  anchorTextMatchDeepItems?: DeepTextItem[];
  /** OCR text items for the verified page */
  textItems?: DeepTextItem[];
  /** Highlighted region on the verified page (image pixel coordinates) */
  highlightBox?: ScreenBox;
  /** Scale factors from PDF coordinate units to page image pixels */
  renderScale?: { x: number; y: number };
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
 *   console.log(`URL verified: ${title} (${status})`);
 * }
 * ```
 */
export interface UrlVerificationResult {
  verifiedUrl?: string;
  resolvedUrl?: string;
  httpStatus?: number;
  urlAccessStatus?: UrlAccessStatus;
  contentMatchStatus?: ContentMatchStatus;
  contentSimilarity?: number;
  verifiedTitle?: string;
  actualContentSnippet?: string;
  /** ISO 8601 timestamp when the URL was crawled. */
  crawledAt?: string;
  urlVerificationError?: string;
  verifiedDomain?: string;
  verifiedDescription?: string;
  verifiedFaviconUrl?: string;
  verifiedSiteName?: string;
  verifiedAuthor?: string;
  /** ISO 8601 timestamp when the content was published. */
  verifiedPublishedAt?: string;
  verifiedImageUrl?: string;
  contentType?: string;
}

/**
 * A page render returned from verification for user inspection.
 */
export interface PageImage {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Page dimensions in pixels or PDF units */
  dimensions: {
    width: number;
    height: number;
  };
  /** Source URL for the page image/render */
  imageUrl: string;
  /** Optional base64-encoded thumbnail image (e.g., avif) for quick preview */
  thumbnailUrl?: string;
  /** Optional expiration date for the page data (ISO 8601 string or "never" for enterprise). */
  expiresAt?: string;
  /** Whether this page contains the verified citation match */
  isMatchPage?: boolean;
  /** Highlighted region on this page (if match found) */
  highlightBox?: ScreenBox;
  /** Scale factors from PDF coordinate units to page image pixels.
   *  Use to convert DeepTextItem coords: imageX = item.x * renderScale.x */
  renderScale?: { x: number; y: number };
  /** OCR text items on this page (forward-compatible: text selection, annotations) */
  textItems?: DeepTextItem[];
}

// ==========================================================================
// Main Verification interface
// ==========================================================================

export interface Verification {
  // ========== Identity ==========
  /** Attachment ID. Null for URL citations without a backing attachment. */
  attachmentId?: string | null;

  /** Display label for the attachment (e.g., "Invoice") */
  label?: string;

  /** The original citation being verified */
  citation?: Citation;

  // ========== Search ==========
  /** Verification status. Every verification has a status. */
  status?: SearchStatus;

  /** Ordered list of search attempts made during verification */
  searchAttempts?: SearchAttempt[];

  /** Custom highlight color override */
  highlightColor?: string;

  // ========== Shared verified text results ==========
  verifiedTimestamps?: { startTime?: string; endTime?: string };

  verifiedFullPhrase?: string;

  verifiedAnchorText?: string;

  verifiedMatchSnippet?: string;

  /** ISO 8601 timestamp when verification completed */
  verifiedAt?: string;

  // ========== Type-specific results ==========
  /** Document-specific verification results */
  document?: DocumentVerificationResult;

  /** URL-specific verification results */
  url?: UrlVerificationResult;

  /** Evidence image (keyhole crop + crop-region DeepTextItems) */
  evidence?: EvidenceImage;

  // ========== Timing ==========
  /** Wall-clock ms the system took to verify this citation.
   *  Computed client-side: (evidence ready timestamp) − (citation first rendered timestamp). */
  timeToCertaintyMs?: number;

  // ========== Standalone attachment assets ==========
  /** Page renders for full-page viewer (mirrors UploadFileResponse.pageImages). */
  pageImages?: PageImage[];
  /** Original file download. Present when the verification attachment was a file upload. */
  originalDownload?: FileDownload;
  /** Converted artifact download (PDF rendition, transcript, …). Present for URL/Office inputs. */
  convertedDownload?: FileDownload;

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
  };
}
