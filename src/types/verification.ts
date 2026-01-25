import { sha1Hash } from "../utils/sha.js";
import { type Citation } from "./citation.js";
import { type SearchStatus, type SearchAttempt } from "./search.js";
import { type DeepTextItem } from "./boxes.js";

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

export interface Verification {
  attachmentId?: string | null;

  label?: string | null; //e.g. "Invoice"

  citation?: Citation;

  // Search status
  status?: SearchStatus | null;

  // Search attempts
  searchAttempts?: SearchAttempt[];

  highlightColor?: string | null;

  // Verified results (actual values found - expected values are in citation)
  verifiedPageNumber?: number | null;

  verifiedLineIds?: number[] | null;

  verifiedTimestamps?: { startTime?: string; endTime?: string } | null;

  verifiedFullPhrase?: string | null;

  verifiedAnchorText?: string | null;

  verifiedMatchSnippet?: string | null;

  hitIndexWithinPage?: number | null;

  phraseMatchDeepItem?: DeepTextItem;

  /** Multiple boxes for anchorText highlighting when the anchorText spans multiple PDF items/words */
  anchorTextMatchDeepItems?: DeepTextItem[];

  verificationImageBase64?: string | null;

  /** Dimensions of the verification image (for coordinate mapping) */
  verificationImageDimensions?: { width: number; height: number } | null;

  verifiedAt?: Date;

  // ==========================================================================
  // URL/Web Content Verification Fields
  // Used when verifying AI-generated URL claims (e.g., "According to example.com...")
  // ==========================================================================

  /** The URL that was verified (from Citation.url when type: "url") */
  verifiedUrl?: string | null;

  /** The actual URL after following redirects */
  resolvedUrl?: string | null;

  /** HTTP status code returned */
  httpStatus?: number | null;

  /** URL accessibility status */
  urlAccessStatus?: UrlAccessStatus | null;

  /** Whether the page content matches what the AI claimed */
  contentMatchStatus?: ContentMatchStatus | null;

  /** Similarity score between expected and actual content (0-1) */
  contentSimilarity?: number | null;

  /** The page title found at the URL */
  verifiedTitle?: string | null;

  /** Snippet of actual content found on the page */
  actualContentSnippet?: string | null;

  /** Screenshot of the web page as verification proof */
  webPageScreenshotBase64?: string | null;

  /** When the URL was crawled/fetched */
  crawledAt?: Date | string | null;

  /** Error message if URL verification failed */
  urlVerificationError?: string | null;

  // ==========================================================================
  // Verified URL metadata (fetched from the actual page)
  // ==========================================================================

  /** Verified domain from the URL */
  verifiedDomain?: string | null;

  /** Verified description/meta description from the page */
  verifiedDescription?: string | null;

  /** Verified favicon URL */
  verifiedFaviconUrl?: string | null;

  /** Verified site name (from og:site_name or similar) */
  verifiedSiteName?: string | null;

  /** Verified author (from meta tags) */
  verifiedAuthor?: string | null;

  /** Verified publication date */
  verifiedPublishedAt?: Date | string | null;

  /** Verified OG image URL */
  verifiedImageUrl?: string | null;

  /** Content type of the fetched URL (e.g., "text/html", "application/pdf") */
  contentType?: string | null;
}
