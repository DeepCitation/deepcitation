export interface ReviewUrlOptions {
  /** The URL to review. Must start with https://. */
  url: string;
  /**
   * Skip the URL cache check. When false (default), the response includes
   * isCached: true if the URL has already been fully processed today.
   */
  skipCache?: boolean;
  /** Developer's end-user identifier for usage attribution. Overrides the instance-level endUserId if set. */
  endUserId?: string;
}

/**
 * Result of a lightweight URL pre-flight review.
 * All fields are populated on success. Errors throw typed DeepCitationErrors.
 */
export interface ReviewUrlResponse {
  /** Original URL as provided. */
  url: string;
  /** Normalized URL (https-forced, trailing slash removed, port stripped). */
  normalizedUrl: string;
  /** Extracted domain (e.g. "arxiv.org"). */
  domain: string;
  /** HTTP status returned by the origin server. */
  httpStatus: number;
  /** MIME type from Content-Type header (e.g. "application/pdf"). */
  contentType?: string;
  /** File size in bytes from Content-Length header. Absent if server omits it. */
  contentLength?: number;
  /** Filename from Content-Disposition header, if present. */
  suggestedFilename?: string;
  /**
   * What the backend pipeline will treat this URL as.
   * - "pdf": Direct PDF download — fastest processing.
   * - "html": Web page — will be rendered to PDF via Chromium (~10-30s).
   * - "office": Word/Excel/PowerPoint — will be converted to PDF via LibreOffice.
   * - "image": Image file — text extracted via OCR.
   */
  classifiedAs: "pdf" | "html" | "office" | "image";
  /**
   * True if this URL has already been fully processed today and
   * prepareUrl() will return a cached result instantly.
   */
  isCached: boolean;
  /** ISO 8601 timestamp of when the cache entry expires (end of UTC day). */
  cacheExpiresAt?: string;
  /** Wall-clock time for the review request in milliseconds. */
  processingTimeMs: number;
}
