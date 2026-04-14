import type {
  AttachmentAssets,
  Citation,
  DeepTextItem,
  FileDownload,
  ImageFormat,
  PageImage,
  PageImagesStatus,
  Verification,
  VerifyCitationResponse,
} from "../types/index.js";
import type { LlmSearchAttempt } from "../types/llmAttempt.js";

/**
 * Policy for exposing a download URL to the converted verification PDF.
 * - "url_only": expose for URL conversions only (default)
 * - "always": expose for URL + Office conversions
 * - "never": never expose converted PDF download URLs
 */
export type ConvertedPdfDownloadPolicy = "url_only" | "always" | "never";

/**
 * Logger interface for DeepCitation client observability.
 * All methods are optional -- only implement the levels you need.
 * Default: no logging (no-op).
 */
export interface DeepCitationLogger {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

// ==========================================================================
// Shared option bases
// ==========================================================================

/**
 * Per-request billing and policy overrides.
 * These override the corresponding instance-level defaults on DeepCitationConfig.
 */
export interface FileRequestOptions {
  /** Developer's end-user identifier for usage attribution. Overrides the instance-level endUserId if set. */
  endUserId?: string;
  /** Developer's file identifier for billing attribution. Overrides the instance-level endFileId if set. */
  endFileId?: string;
  /** Per-request override for converted verification PDF download policy. */
  convertedPdfDownloadPolicy?: ConvertedPdfDownloadPolicy;
}

// ==========================================================================
// Client configuration
// ==========================================================================

/**
 * Configuration options for the DeepCitation client
 */
export interface DeepCitationConfig {
  /** Your DeepCitation API key (starts with sk-dc-) */
  apiKey: string;
  /** Optional custom API base URL. Defaults to https://api.deepcitation.com */
  apiUrl?: string;
  /**
   * Maximum number of concurrent file uploads.
   * Prevents overwhelming the network/server with too many simultaneous requests.
   * @default 5
   */
  maxUploadConcurrency?: number;
  /**
   * Optional logger for observability. Receives structured log messages
   * about uploads, verifications, cache operations, and errors.
   *
   * @example
   * ```typescript
   * const dc = new DeepCitation({
   *   apiKey: '...',
   *   logger: {
   *     info: (msg, meta) => console.log(`[DC] ${msg}`, meta),
   *     error: (msg, meta) => console.error(`[DC] ${msg}`, meta),
   *   },
   * });
   * ```
   */
  logger?: DeepCitationLogger;
  /**
   * Developer's end-user identifier for usage attribution.
   * Applied to all API calls unless overridden per-request.
   * Max 128 characters. Must not contain control characters.
   */
  endUserId?: string;
  /**
   * Developer's file identifier for billing attribution.
   * Applied to all file-related API calls unless overridden per-request.
   * Max 128 characters. Must not contain control characters.
   */
  endFileId?: string;
  /**
   * Default policy for exposing converted verification PDF download links.
   * @default "url_only"
   */
  convertedPdfDownloadPolicy?: ConvertedPdfDownloadPolicy;
  /**
   * Optional callback invoked when the API responds with a latest SDK version header.
   * Useful for detecting when a newer SDK version is available.
   */
  onLatestVersion?: (latestVersion: string) => void;
  /**
   * Optional callback invoked after each successful API response when usage-limit headers are present.
   * Use this to warn users as they approach their monthly spend limit.
   * @param remaining - Remaining spend budget in dollars for the current billing period
   * @param limit - Total monthly spend limit in dollars
   */
  onUsageUpdate?: (remaining: number, limit: number) => void;
  /** Tag identifying request origin (e.g. "playground"). Sent as X-Request-Source header. */
  requestSource?: string;
  /**
   * Maximum number of retries for transient network failures (when the connection
   * drops before a response is received). Uses exponential backoff with jitter:
   * delay = 2^attempt * 100ms ± 10%, capped at 16s.
   *
   * Does NOT retry HTTP error responses (4xx/5xx) — only low-level network throws.
   * @default 3
   */
  maxRetries?: number;
  /**
   * Custom `fetch` implementation. Use this to route requests through a proxy,
   * add custom TLS settings, or swap in a different HTTP library.
   *
   * When not provided, the global `fetch` is used. Node.js's built-in fetch
   * does NOT respect HTTP_PROXY / HTTPS_PROXY environment variables — pass a
   * proxy-aware fetch here if you need proxy support.
   *
   * @example
   * ```typescript
   * import { ProxyAgent } from 'undici';
   *
   * const agent = new ProxyAgent('http://my-proxy:3128');
   * const dc = new DeepCitation({
   *   apiKey: 'sk-dc-...',
   *   fetch: (url, init) => fetch(url, { ...init, dispatcher: agent }),
   * });
   * ```
   */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

// ==========================================================================
// Upload / prepare responses
// ==========================================================================

/**
 * Response from uploading a file for citation verification
 */
export interface UploadFileResponse {
  /** The attachment ID assigned by DeepCitation (custom or auto-generated) */
  attachmentId: string;
  /** Raw per-page text content. Use this with wrapCitationPrompt() or your own deterministic formatter. */
  deepTextPages: string[];
  /** Metadata about the processed file */
  metadata: {
    filename: string;
    mimeType: string;
    pageCount: number;
    textByteSize: number;
  };
  /** Processing status */
  status: "ready" | "error";
  /** Time taken to process the file in milliseconds */
  processingTimeMs?: number;
  /** Error message if status is "error" */
  error?: string;
  /** Optional expiration date for the attachment. */
  expiresAt?: (string & {}) | "never";
  /** Original file as received (PDF, DOCX, MP4, …). Absent for URL inputs. */
  originalDownload?: FileDownload;
  /** Converted artifact: PDF rendition for docs/URLs, transcript for audio/video. Absent for plain PDF uploads. */
  convertedDownload?: FileDownload;
  /**
   * Pre-assigned page structure with dimensions and storage paths.
   * For PDFs, images are generated asynchronously after upload (check pageImagesStatus).
   * For images, contains a single completed page entry.
   */
  pageImages?: PageImage[];
  /** Status of page image generation. */
  pageImagesStatus?: PageImagesStatus;
  /**
   * Cache information for URL-based requests.
   * Only present when the request was for a URL (not file upload).
   */
  urlCache?: UrlCacheInfo;
  /**
   * Source URL information when the attachment originated from a URL.
   * Use this to populate Citation.url and Citation.domain when creating citations.
   */
  urlSource?: UrlSource;
}

// ==========================================================================
// Request option interfaces
// ==========================================================================

/**
 * Options for file upload
 */
export interface UploadFileOptions extends FileRequestOptions {
  /** Optional custom attachment ID to use instead of auto-generated one */
  attachmentId?: string;
  /** Optional custom filename (uses File.name if not provided) */
  filename?: string;
}

/**
 * Options for preparing a URL for citation verification.
 * URLs and Office files take ~30s to process vs. <1s for images/PDFs.
 */
export interface PrepareUrlOptions extends FileRequestOptions {
  /** The URL to convert and prepare for citation verification */
  url: string;
  /** Optional custom attachment ID to use instead of auto-generated one */
  attachmentId?: string;
  /** Optional custom filename for the converted document */
  filename?: string;
  /**
   * UNSAFE: Skip PDF conversion and extract text directly from HTML.
   *
   * This is much faster (<1s vs ~30s) but VULNERABLE to:
   * - Hidden text (CSS display:none, tiny fonts, etc.)
   * - Fine print that users can't see
   * - Prompt injection attacks embedded in the page
   *
   * Only use this for trusted URLs where you control the content.
   * Default: false (uses safe PDF conversion)
   */
  unsafeFastUrlOutput?: boolean;
  /**
   * Set to true to skip the URL cache and force a fresh page-to-PDF conversion.
   * Default is false (use cache if available).
   */
  skipCache?: boolean;
}

/**
 * Cache metadata for URL-based requests.
 * Returned when a URL was processed (either cached or fresh).
 */
export interface UrlCacheInfo {
  /** Whether this response was served from cache */
  cached: boolean;
  /** ISO timestamp when the cache entry expires (end of the UTC day it was created) */
  cacheExpiresAt: string;
  /** The cache key used (SHA1 hash of userId + normalized URL + date) */
  cacheKey: string;
}

/**
 * Source URL information included when the attachment originated from a URL.
 * This information should be used to populate Citation.url and Citation.domain
 * when creating citations for verification.
 */
export interface UrlSource {
  /** The original URL that was converted */
  url: string;
  /** The domain extracted from the URL (e.g., "example.com") */
  domain: string;
}

/**
 * Response from verifying citations.
 * Alias for `VerifyCitationResponse` — kept for naming consistency
 * with the plural `verifyCitations` method.
 */
export type VerifyCitationsResponse = VerifyCitationResponse;

/**
 * Options for citation verification.
 */
export interface VerifyCitationsOptions {
  /** Output image format for verification screenshots */
  outputImageFormat?: ImageFormat;
  /** Developer's end-user identifier for usage attribution. Overrides the instance-level endUserId if set. */
  endUserId?: string;
}

/**
 * Options for batch citation verification across multiple attachments.
 * Structurally identical to VerifyCitationsOptions — aliased to prevent silent drift.
 */
export type VerifyBatchOptions = VerifyCitationsOptions;

/**
 * Options for iterative citation verification with LLM retry loop.
 * The SDK calls verifyAttachment, then invokes onAttemptComplete so the
 * consumer can amend the citation and retry.
 */
export interface IterativeVerifyOptions extends VerifyCitationsOptions {
  /** Maximum verification passes per citation. @default 3 */
  maxAttempts?: number;
  /**
   * Called after each non-terminal attempt. Return an amended citation to
   * retry, or null/undefined to stop.  To flag the previous attempt as a
   * false-positive rejection, return an object with `isFalsePositiveRejection`.
   */
  onAttemptComplete: (
    attempt: LlmSearchAttempt,
    history: LlmSearchAttempt[],
    citationKey: string,
  ) => Promise<Citation | { citation: Citation; isFalsePositiveRejection?: boolean } | null | undefined>;
}

/**
 * Simplified citation input for verification
 */
export type CitationInput = Citation | Record<string, Citation>;

/**
 * Input for file upload in prepareAttachments
 */
export interface FileInput extends FileRequestOptions {
  /** The file content (File, Blob, or Buffer) */
  file: File | Blob | Buffer;
  /** Optional filename */
  filename?: string;
  /** Optional custom attachment ID */
  attachmentId?: string;
}

/**
 * Per-attachment assets returned from prepareAttachments
 */
export interface PreparedAttachment extends AttachmentAssets {
  /** The attachment ID assigned by DeepCitation */
  attachmentId: string;
  /** Raw per-page text for this attachment. */
  deepTextPages?: string[];
  /** Source URL information when the attachment originated from a URL. Absent for document inputs. */
  urlSource?: UrlSource;
}

/**
 * Result from prepareAttachments
 */
export interface PrepareAttachmentsResult {
  /** Array of file references for verification */
  fileDataParts: Array<{ attachmentId: string; filename?: string }>;
  /** Raw per-page text keyed by attachmentId. */
  deepTextPagesByAttachmentId: Record<string, string[]>;
  /** Per-attachment assets for downloads and page images */
  attachments: PreparedAttachment[];
}

/**
 * Input for verify method.
 */
export interface VerifyInput {
  /** The LLM response containing citations */
  llmOutput: string;
  /** Optional file references (required for Zero Data Retention or after storage expires) */
  fileDataParts?: Array<{ attachmentId: string; filename?: string }>;
  /** Output image format for verification screenshots */
  outputImageFormat?: ImageFormat;
  /** Developer's end-user identifier for usage attribution. Overrides the instance-level endUserId if set. */
  endUserId?: string;
}

/**
 * Input for convertFile - convert URL or Office file to PDF.
 * Provide either `url` or `file`, not both.
 */
export type ConvertFileInput = ConvertFileUrlInput | ConvertFileUploadInput;

/** Convert a URL to PDF */
interface ConvertFileUrlInput extends FileRequestOptions {
  /** URL to convert to PDF (for web pages or direct PDF links) */
  url: string;
  /** Not applicable for URL conversion */
  file?: never;
  /** Optional custom filename for the converted PDF */
  filename?: string;
  /** Optional custom attachment ID */
  attachmentId?: string;
}

/** Convert an uploaded Office file to PDF */
interface ConvertFileUploadInput extends FileRequestOptions {
  /** Not applicable for file upload conversion */
  url?: never;
  /** Office file to convert (doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp) */
  file: File | Blob | Buffer;
  /** Optional custom filename for the converted PDF */
  filename?: string;
  /** Optional custom attachment ID */
  attachmentId?: string;
}

/**
 * Response from convertFile
 */
export interface ConvertFileResponse {
  /** The attachment ID assigned by DeepCitation. Pass this to prepareConvertedFile(). */
  attachmentId: string;
  /** Metadata about the conversion */
  metadata: {
    /** Original filename before conversion */
    originalFilename: string;
    /** Original MIME type before conversion */
    originalMimeType: string;
    /** MIME type after conversion (always application/pdf) */
    convertedMimeType: string;
    /** Time taken for conversion in milliseconds */
    conversionTimeMs: number;
  };
  /** Conversion status */
  status: "converted" | "error";
  /** Error message if status is "error" */
  error?: string;
}

/**
 * Options for processing a converted file
 */
export interface PrepareConvertedFileOptions extends FileRequestOptions {
  /** The attachment ID from a previous convertFile call */
  attachmentId: string;
}

/**
 * Duration to extend the expiration by
 */
export type ExtendExpirationDuration = "month" | "year";

/**
 * Options for extending an attachment's expiration
 */
export interface ExtendExpirationOptions {
  /** The attachment ID to extend */
  attachmentId: string;
  /** Duration to extend by: "month" (30 days) or "year" (365 days) */
  duration: ExtendExpirationDuration;
}

/**
 * Response from extending an attachment's expiration
 */
export interface ExtendExpirationResponse {
  /** The attachment ID that was extended */
  attachmentId: string;
  /** The new expiration date */
  expiresAt: (string & {}) | "never";
  /** The previous expiration date, or undefined if not previously set */
  previousExpiresAt?: (string & {}) | "never";
}

/**
 * Response from deleting an attachment
 */
export interface DeleteAttachmentResponse {
  /** The attachment ID that was deleted */
  attachmentId: string;
  /** Whether the deletion was successful */
  deleted: boolean;
}

/**
 * Options for retrieving an attachment by ID
 */
export interface GetAttachmentOptions {
  /** Developer's end-user identifier for usage attribution. Overrides the instance-level endUserId if set. */
  endUserId?: string;
}

/**
 * Response from querying an attachment by ID.
 * Returns full attachment metadata including page renders, verifications, and optional deep text items.
 *
 * Note: Response size can be substantial for large documents with many page renders or verifications.
 */
export interface AttachmentResponse {
  /** The attachment ID (returned as `id` by the API, unlike other response types which use `attachmentId`) */
  id: string;
  /** Current processing status */
  status: "ready" | "error" | "processing";
  /** Source identifier (e.g., filename or URL) */
  source: string;
  /** Original filename of the uploaded file */
  originalFilename: string;
  /** MIME type of the uploaded file */
  mimeType: string;
  /** File size in bytes (may not be available for URL-based attachments) */
  fileSize?: number;
  /** Number of pages in the document */
  pageCount: number;
  /** Total text content size in bytes */
  textByteSize?: number;
  /** Extracted page data with text and geometry */
  pageImages: PageImage[];
  /** Status of page image generation */
  pageImagesStatus?: PageImagesStatus;
  /** Verification results keyed by citation key */
  verifications: Record<string, Verification>;
  /** Deep text items by page index (Phase 1: from verification results) */
  deepTextItems?: Record<number, DeepTextItem[]>;
  /** ISO 8601 timestamp when the attachment was uploaded */
  uploadedAt?: string;
  /** ISO 8601 timestamp when processing completed */
  processedAt?: string;
  /** Source URL information when the attachment originated from a URL */
  urlSource?: UrlSource;
  /** Expiration date */
  expiresAt?: (string & {}) | "never";
  /** Developer-provided end-user identifier for per-customer usage attribution */
  endUserId?: string;
  /** Original file as received (PDF, DOCX, MP4, …). Absent for URL inputs. */
  originalDownload?: FileDownload;
  /** Converted artifact: PDF rendition for docs/URLs, transcript for audio/video. */
  convertedDownload?: FileDownload;
  /** Raw per-page text array extracted from the document. */
  deepTextPages?: string[];
  /** Raw per-page text array extracted from the document. */
  pageTexts?: string[];
}

// ==========================================================================
// Verification reports (hosted publish)
// ==========================================================================

/**
 * Visibility level for a hosted verification report.
 * - `private`: owner-only; only the authenticated publisher can fetch
 * - `unlisted`: no auth required, but the random ID acts as the secret
 * - `public`: no auth required and surfaced in listings
 */
export type VerificationReportVisibility = "private" | "unlisted" | "public";

/**
 * Options when publishing a verification report via
 * `DeepCitation.publishVerificationReport`.
 */
export interface PublishVerificationReportOptions {
  /** Visibility of the hosted report. Defaults to `"unlisted"` server-side. */
  visibility?: VerificationReportVisibility;
  /** Optional human-readable title to surface in lists and metadata. */
  title?: string;
  /** Optional link back to the source attachment. */
  attachmentId?: string;
}

/**
 * Server response when publishing or fetching a hosted verification report.
 * HTML and JSON are stored as independent blobs so the HTML can be re-rendered
 * from the JSON and third-party verifiers can pull the JSON on its own.
 */
export interface VerificationReport {
  /** Opaque, URL-safe identifier (random 16-char base32). */
  id: string;
  /** Canonical share URL (HTML view, serves under the reports subdomain). */
  shareUrl: string;
  /** Direct URL to the stored HTML blob. */
  htmlUrl: string;
  /** Direct URL to the stored `verify-response.json` blob. */
  jsonUrl: string;
  visibility: VerificationReportVisibility;
  title?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 optional auto-expiry timestamp. */
  expiresAt?: string;
  /** Total citations encoded in the published verify-response.json. */
  citationCount?: number;
  /** Citations whose verification status was `found`. */
  verifiedCount?: number;
  /** Citations whose verification status was `partial`. */
  partialCount?: number;
  /** Citations whose verification status was `not_found`. */
  notFoundCount?: number;
}
