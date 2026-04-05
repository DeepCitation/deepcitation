import type { AttachmentAssets, Verification } from "./verification.js";

/**
 * Image format for proof images, verification screenshots, and output.
 */
export type ImageFormat = "jpeg" | "png" | "avif" | "webp";

/** Citations keyed by citationKey (a 16-char hash from `getCitationKey()`). */
export type CitationRecord = Record<string, Citation>;

/** Verifications keyed by citationKey, matching keys from CitationRecord. */
export type VerificationRecord = Record<string, Verification>;

export const DEFAULT_OUTPUT_IMAGE_FORMAT = "avif" as const;

export interface VerifyCitationResponse {
  verifications: VerificationRecord;
  /** Attachment-level assets keyed by attachmentId. Hoisted from individual verifications to avoid duplication. */
  attachments?: Record<string, AttachmentAssets>;
}

export interface VerifyCitationRequest {
  /** Attachment ID from prepareAttachments. Required unless sha256 is provided. */
  attachmentId?: string;
  /** SHA256 hash of the original file. Can be used to look up the attachment instead of attachmentId. */
  sha256?: string;
  citations: CitationRecord;
  outputImageFormat?: ImageFormat;
  apiKey?: string;
  /** Developer's end-user identifier for usage attribution */
  endUserId?: string;
}

/**
 * Batch verification request — citations span multiple attachments.
 * Each citation carries its own `attachmentId`.
 */
export interface BatchVerifyCitationRequest {
  /** Must be "batch" to enable batch mode. */
  mode: "batch";
  /** Citations keyed by citationKey. Each citation must include an `attachmentId` field. */
  citations: CitationRecord;
  outputImageFormat?: ImageFormat;
  /** Developer's end-user identifier for usage attribution */
  endUserId?: string;
}

/**
 * Citation type discriminator.
 * - `"document"`: PDF or uploaded document citation (uses attachmentId, pageNumber, lineIds)
 * - `"url"`: URL/web citation (uses url, domain, title, etc.)
 * - `"audio"`: Audio file citation (uses attachmentId, timestamps)
 * - `"video"`: Video file citation (uses attachmentId, timestamps)
 */
export type CitationType = "document" | "url" | "audio" | "video";

/**
 * Source/platform type for categorization and display.
 * Used for icon selection and grouping in sources lists.
 */
export type SourceType =
  | "web"
  | "pdf"
  | "document"
  | "social"
  | "video"
  | "news"
  | "academic"
  | "code"
  | "forum"
  | "commerce"
  | "reference"
  | "unknown";

/**
 * Common fields shared by all citation types.
 * Page-location fields (attachmentId, pageNumber, lineIds, startPageId) exist on the
 * base because URL citations are converted to PDFs for verification.
 */
interface CitationBase {
  attachmentId?: string;
  pageNumber?: number;
  lineIds?: number[];
  /** Canonical page identifier (e.g. "page_number_3_index_0"). */
  startPageId?: string;
  fullPhrase?: string;
  anchorText?: string;
  citationNumber?: number;
  reasoning?: string;
}

/** Document citation — PDF or uploaded document. */
export interface DocumentCitation extends CitationBase {
  type: "document";
}

/** Audio/video citation with timestamp-based verification. */
export interface AudioVideoCitation extends CitationBase {
  type: "audio" | "video";
  timestamps?: {
    startTime?: string;
    endTime?: string;
  };
}

/** URL citation — web page or online resource. */
export interface UrlCitation extends CitationBase {
  type: "url";
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  faviconUrl?: string;
  sourceType?: SourceType;
  platform?: string;
  siteName?: string;
  author?: string;
  /** ISO 8601 string */
  publishedAt?: string;
  imageUrl?: string;
  /** ISO 8601 string */
  accessedAt?: string;
}

/** Discriminated union for all citation types. Narrow via `citation.type`. */
export type Citation = DocumentCitation | UrlCitation | AudioVideoCitation;

export function isUrlCitation(citation: Citation): citation is UrlCitation {
  return citation.type === "url";
}

export function isDocumentCitation(citation: Citation): citation is DocumentCitation {
  return citation.type === "document";
}

export function isAudioVideoCitation(citation: Citation): citation is AudioVideoCitation {
  return citation.type === "audio" || citation.type === "video";
}

export interface CitationStatus {
  isVerified: boolean;
  isMiss: boolean;
  isPartialMatch: boolean;
  isPending: boolean;
}
