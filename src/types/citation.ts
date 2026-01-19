import { type ScreenBox } from "./boxes.js";
import { type Verification } from "./verification.js";

export type OutputImageFormat = "jpeg" | "png" | "avif" | undefined | null;

export const DEFAULT_OUTPUT_IMAGE_FORMAT = "avif" as const;
export interface VerifyCitationResponse {
  verifications: { [key: string]: Verification };
}

export interface VerifyCitationRequest {
  attachmentId: string;
  citations: { [key: string]: Citation };
  outputImageFormat?: OutputImageFormat;
  apiKey?: string; // Optional API key for authentication
}

/**
 * Citation type discriminator.
 * - `"document"`: PDF or uploaded document citation (uses attachmentId, pageNumber, lineIds)
 * - `"url"`: URL/web citation (uses url, domain, title, etc.)
 */
export type CitationType = "document" | "url";

/**
 * Source/platform type for categorization and display.
 * Used for icon selection and grouping in sources lists.
 */
export type SourceType =
  | "web" // Generic web page
  | "pdf" // PDF document
  | "document" // Uploaded document
  | "social" // Social media (X/Twitter, Facebook, etc.)
  | "video" // Video platforms (YouTube, Twitch, etc.)
  | "news" // News articles
  | "academic" // Academic papers/journals
  | "code" // Code repositories (GitHub, etc.)
  | "forum" // Forums/discussion boards (Reddit, etc.)
  | "commerce" // E-commerce sites
  | "reference" // Reference sites (Wikipedia, etc.)
  | "unknown"; // Unknown/other

/**
 * Unified citation interface for both document and URL-based citations.
 *
 * Use `type` to discriminate:
 * - `type: "document"` - Uses attachmentId, pageNumber, lineIds for document citations
 * - `type: "url"` - Uses url, domain, title, etc. for web citations
 *
 * Common fields (used by both types):
 * - `fullPhrase`: The full context/excerpt containing the cited information
 * - `keySpan`: The specific key phrase being cited (must be substring of fullPhrase)
 * - `citationNumber`: Citation number for display (e.g., [1], [2])
 *
 * @example Document citation
 * ```typescript
 * const docCitation: Citation = {
 *   type: "document",
 *   attachmentId: "abc123",
 *   pageNumber: 5,
 *   lineIds: [12, 13],
 *   fullPhrase: "Revenue increased by 15% in Q4.",
 *   keySpan: "increased by 15%",
 *   citationNumber: 1,
 * };
 * ```
 *
 * @example URL citation
 * ```typescript
 * const urlCitation: Citation = {
 *   type: "url",
 *   url: "https://example.com/article",
 *   domain: "example.com",
 *   title: "Q4 Financial Report",
 *   fullPhrase: "The TGU transitions require control, not brute strength.",
 *   keySpan: "require control, not brute strength",
 *   citationNumber: 1,
 * };
 * ```
 */
export interface Citation {
  /**
   * Citation type discriminator.
   * - `"document"`: PDF/uploaded document (default if not specified)
   * - `"url"`: Web URL citation
   */
  type?: CitationType;

  // ==========================================================================
  // Common fields (used by both document and URL citations)
  // ==========================================================================

  /** The full context/excerpt containing the cited information */
  fullPhrase?: string | null;

  /** The specific key phrase being cited (should be substring of fullPhrase) */
  keySpan?: string | null;

  /** Citation number for display (e.g., [1], [2], [3]) */
  citationNumber?: number;

  /** Reasoning for why this citation was included */
  reasoning?: string | null;

  /** Text that appears before the citation marker */
  beforeCite?: string;

  // ==========================================================================
  // Document citation fields (type: "document")
  // ==========================================================================

  /** Attachment ID for document citations */
  attachmentId?: string;

  /** Page number in the document */
  pageNumber?: number | null;

  /** Line IDs within the page */
  lineIds?: number[] | null;

  /** Start page key for multi-page citations */
  startPageKey?: string | null;

  /** Selection box coordinates in the document */
  selection?: ScreenBox | null;

  // ==========================================================================
  // URL citation fields (type: "url")
  // ==========================================================================

  /** The source URL */
  url?: string;

  /** Display domain (e.g., "example.com", "fitandwell.com") */
  domain?: string;

  /** Page/article title */
  title?: string;

  /** Brief description or snippet from the page */
  description?: string;

  /** Favicon URL for the source */
  faviconUrl?: string;

  /** Platform/source type for categorization (e.g., "video", "news", "social") */
  sourceType?: SourceType;

  /** Platform name (e.g., "Twitch", "YouTube", "Reddit") */
  platform?: string;

  /** Site name (e.g., "Fit&Well", "Garage Gym Reviews") */
  siteName?: string;

  /** Author name if available */
  author?: string;

  /** Publication date */
  publishedAt?: Date | string;

  /** Open Graph or social media image URL */
  imageUrl?: string;

  /** When the source was accessed/verified */
  accessedAt?: Date | string;

  // ==========================================================================
  // Audio/Video citation fields (can be used with both types)
  // ==========================================================================

  /** Timestamps for audio/video citations */
  timestamps?: {
    startTime?: string;
    endTime?: string;
  };

  // ==========================================================================
  // Deprecated fields (kept for backwards compatibility)
  // ==========================================================================

  /**
   * @deprecated Use top-level URL fields (url, domain, title, etc.) with type: "url" instead.
   * Will be removed in a future version.
   */
  webSource?: WebSource;
}

export interface CitationStatus {
  isVerified: boolean;
  isMiss: boolean;
  isPartialMatch: boolean;
  isPending: boolean;
}

/**
 * Web source metadata interface.
 * @deprecated Use Citation with type: "url" instead. URL fields are now on Citation directly.
 */
export interface WebSource {
  /** The full URL of the source */
  url: string;
  /** Display domain (e.g., "example.com", "fitandwell.com") */
  domain?: string;
  /** Page/article title */
  title?: string;
  /** Brief description or snippet from the page */
  description?: string;
  /** Favicon URL for the source */
  faviconUrl?: string;
  /** Platform name (e.g., "Twitch", "YouTube", "Reddit") */
  platform?: string;
  /** Author name if available */
  author?: string;
  /** Publication date */
  publishedAt?: Date | string;
  /** Open Graph or social media image URL */
  imageUrl?: string;
  /** Site name (e.g., "Fit&Well", "Garage Gym Reviews") */
  siteName?: string;
}

/**
 * @deprecated Use Citation with type: "url" instead. All fields are now on Citation directly.
 */
export type SourceCitation = Citation;

/**
 * Metadata for a source in an aggregated sources list.
 * Used by SourcesListComponent to display collected citations.
 */
export interface SourceMeta {
  /** Unique identifier for this source */
  id: string;
  /** The source URL */
  url: string;
  /** Page/document title */
  title: string;
  /** Display domain without www prefix */
  domain: string;
  /** Platform/source type */
  sourceType?: SourceType;
  /** Favicon URL */
  faviconUrl?: string;
  /** Citation numbers that reference this source */
  citationNumbers?: number[];
  /** Number of times this source is cited */
  citationCount?: number;
  /** Relevant excerpts/quotes from this source */
  excerpts?: string[];
  /** Verification status if verified */
  verificationStatus?: "verified" | "partial" | "pending" | "failed" | "unknown";
  /** When the source was accessed */
  accessedAt?: Date | string;
}
