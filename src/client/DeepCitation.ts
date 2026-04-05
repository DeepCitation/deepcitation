import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";
import type { Citation, Verification } from "../types/index.js";
import type { LlmSearchAttempt } from "../types/llmAttempt.js";
import { computeAmendments } from "../utils/amendments.js";
import { getCitationKey } from "../utils/citationKey.js";
import { sha1Hash } from "../utils/sha.js";
import {
  AuthenticationError,
  type DeepCitationError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "./errors.js";
import type {
  AttachmentResponse,
  CitationInput,
  ConvertedPdfDownloadPolicy,
  ConvertFileInput,
  ConvertFileResponse,
  DeepCitationConfig,
  DeepCitationLogger,
  DeleteAttachmentResponse,
  ExtendExpirationOptions,
  ExtendExpirationResponse,
  FileInput,
  GetAttachmentOptions,
  IterativeVerifyOptions,
  PrepareAttachmentsResult,
  PrepareConvertedFileOptions,
  PrepareUrlOptions,
  UploadFileOptions,
  UploadFileResponse,
  VerifyBatchOptions,
  VerifyCitationsOptions,
  VerifyCitationsResponse,
  VerifyInput,
} from "./types.js";

const DEFAULT_API_URL = "https://api.deepcitation.com";

/** Current SDK version — must be kept in sync with package.json. */
export const SDK_VERSION = "0.2.3";

const DEFAULT_MAX_RETRIES = 3;

/** Statuses that indicate a successful verification — no further retries needed. */
const TERMINAL_VERIFY_STATUSES: ReadonlySet<string> = new Set(["found", "found_anchor_text_only"]);

/**
 * Fetch with exponential backoff retry for transient network failures.
 *
 * Retries ONLY when `fetch` itself throws (connection dropped, DNS failure, etc.).
 * HTTP error responses (4xx/5xx) are returned as-is — those are intentional server
 * responses and should not be blindly retried.
 *
 * Backoff schedule: 2^(attempt-1) * 100ms ± 10% jitter, capped at 16 000ms.
 * Example delays for maxRetries=3: ~100ms, ~200ms, ~400ms.
 *
 * If `options.signal` is provided, it is respected during backoff delays: the delay
 * is cancelled immediately and an AbortError is thrown when the signal fires.
 *
 * @internal Exported for unit testing only; not part of the public package API.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  logger?: { warn?: (msg: string, meta?: Record<string, unknown>) => void },
  fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<Response> {
  const doFetch = fetchFn ?? globalThis.fetch;
  const signal = options.signal instanceof AbortSignal ? options.signal : null;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const base = 2 ** (attempt - 1) * 100;
      const jitter = base * 0.1 * (Math.random() * 2 - 1);
      const delay = Math.min(base + jitter, 16_000);
      logger?.warn?.("Retrying request after network error", { attempt, delayMs: Math.round(delay) });
      await new Promise<void>((resolve, reject) => {
        const id = setTimeout(resolve, delay);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(id);
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    }
    try {
      return await doFetch(url, options);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Default concurrency limit for parallel file uploads.
 * Prevents overwhelming the network/server with too many simultaneous requests.
 */
const DEFAULT_UPLOAD_CONCURRENCY = 5;

/**
 * Simple promise-based concurrency limiter.
 * Ensures only N promises run concurrently.
 *
 * The counter is managed as follows:
 * - Incremented when a task starts running (either immediately or from queue)
 * - Decremented when a task completes (in the finally block)
 * - next() does NOT increment - it just dequeues and runs (run() handles the counter)
 *
 * Uses try-catch to safely handle synchronous throws from fn(), ensuring the
 * running counter is always properly decremented without extra microtask overhead.
 */
function createConcurrencyLimiter(limit: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (queue.length > 0 && running < limit) {
      // Don't increment running here - the queued function's run() will handle it
      const fn = queue.shift();
      if (fn) {
        fn();
      }
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = () => {
        running++;
        let promise: Promise<T>;
        try {
          promise = fn();
        } catch (err) {
          // Handle synchronous throws
          running--;
          next();
          reject(err);
          return;
        }
        // Handle async resolution/rejection
        promise
          .then(resolve)
          .catch(reject)
          .finally(() => {
            running--;
            next();
          });
      };

      if (running < limit) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

/** Convert File/Blob/Buffer to a Blob suitable for FormData */
function toBlob(file: File | Blob | Buffer, filename?: string): { blob: Blob; name: string } {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
    const uint8 = Uint8Array.from(file);
    return { blob: new Blob([uint8]), name: filename || "document" };
  }
  if (file instanceof Blob) {
    return {
      blob: file,
      name: filename || (file instanceof File ? file.name : "document"),
    };
  }
  throw new ValidationError("Invalid file type. Expected File, Blob, or Buffer.");
}

/** Extract error message from API response */
async function extractErrorMessage(response: Response, fallbackAction: string): Promise<string> {
  const error = await response.json().catch(() => ({}));
  return error?.error?.message || `${fallbackAction} failed with status ${response.status}`;
}

/** Map HTTP response to a structured DeepCitation error */
async function createApiError(response: Response, fallbackAction: string): Promise<DeepCitationError> {
  const status = response.status;
  if (status === 402) {
    const body = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    const billingCode = body?.error?.code ?? "payment-required";
    const msg = body?.error?.message ?? "Payment required. Please add a payment method to continue.";
    return new PaymentRequiredError(msg, billingCode);
  }
  const message = await extractErrorMessage(response, fallbackAction);
  if (status === 401 || status === 403) return new AuthenticationError(message);
  if (status === 429) return new RateLimitError(message);
  if (status >= 400 && status < 500) return new ValidationError(message, status);
  return new ServerError(message, status);
}

/**
 * DeepCitation client for file upload and citation verification.
 *
 * @example
 * ```typescript
 * import { DeepCitation } from 'deepcitation';
 *
 * const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });
 *
 * // Upload a file
 * const { attachmentId, promptContent } = await deepcitation.uploadFile(file);
 *
 * // Include promptContent in your LLM messages
 * const response = await llm.chat({
 *   messages: [
 *     { role: "system", content: wrapSystemCitationPrompt({ systemPrompt }) },
 *     { role: "user", content: userMessage + "\n\n" + promptContent },
 *   ]
 * });
 *
 * // Verify citations in the LLM output
 * const citations = getAllCitationsFromLlmOutput(response);
 * const verified = await deepcitation.verifyCitations(attachmentId, citations);
 * ```
 */
export class DeepCitation {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly logger: DeepCitationLogger;
  private readonly endUserId?: string;
  private readonly endFileId?: string;
  private readonly convertedPdfDownloadPolicy: ConvertedPdfDownloadPolicy;
  private readonly onLatestVersion?: (latestVersion: string) => void;
  private readonly onUsageUpdate?: (remaining: number, limit: number) => void;
  private readonly requestSource?: string;
  private readonly maxRetries: number;
  private readonly fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  /**
   * Request deduplication cache for verify calls.
   * Prevents duplicate API calls when same verification is requested multiple times.
   * Cache entries expire after 5 minutes, and the cache is limited to 100 entries
   * to prevent memory leaks in long-running sessions.
   */
  private readonly verifyCache = new Map<string, { promise: Promise<VerifyCitationsResponse>; timestamp: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly CACHE_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
  private readonly MAX_CACHE_SIZE = 100; // Maximum cached entries to prevent memory leaks
  private lastCacheCleanup = 0;

  /**
   * Concurrency limiter for file uploads.
   */
  private readonly uploadLimiter: ReturnType<typeof createConcurrencyLimiter>;

  /**
   * Create a new DeepCitation client instance.
   *
   * @param config - Configuration options
   * @throws Error if apiKey is not provided
   *
   * @example
   * ```typescript
   * // With default settings
   * const dc = new DeepCitation({ apiKey: 'sk-dc-...' });
   *
   * // With custom concurrency limit
   * const dc = new DeepCitation({
   *   apiKey: 'sk-dc-...',
   *   maxUploadConcurrency: 10, // Allow more concurrent uploads
   * });
   * ```
   */
  constructor(config: DeepCitationConfig) {
    if (!config.apiKey) {
      throw new AuthenticationError("DeepCitation API key is required. Get one at https://deepcitation.com");
    }
    if (!config.apiKey.startsWith("sk-dc-") || config.apiKey.length < 20) {
      throw new AuthenticationError(
        `Invalid API key format — keys must start with "sk-dc-" and be at least 20 characters. Check your key at https://deepcitation.com/keys`,
      );
    }
    const apiUrl = config.apiUrl?.replace(/\/$/, "") || DEFAULT_API_URL;
    if (!/^https:\/\//i.test(apiUrl) && !apiUrl.startsWith("http://localhost")) {
      throw new ValidationError("apiUrl must use HTTPS to protect your API key in transit");
    }
    this.apiKey = config.apiKey;
    this.apiUrl = apiUrl;
    this.uploadLimiter = createConcurrencyLimiter(config.maxUploadConcurrency ?? DEFAULT_UPLOAD_CONCURRENCY);
    this.logger = config.logger ?? {};
    this.endUserId = config.endUserId;
    this.endFileId = config.endFileId;
    this.convertedPdfDownloadPolicy = config.convertedPdfDownloadPolicy ?? "url_only";
    this.onLatestVersion = config.onLatestVersion;
    this.onUsageUpdate = config.onUsageUpdate;
    if (config.requestSource && /[\r\n]/.test(config.requestSource)) {
      throw new ValidationError("requestSource must not contain newline characters");
    }
    this.requestSource = config.requestSource;
    this.maxRetries = Math.max(0, Math.floor(config.maxRetries ?? DEFAULT_MAX_RETRIES));
    this.fetchFn = config.fetch;
  }

  /** Normalize any supported citation input shape into a keyed map. */
  private normalizeCitationInput(citations: CitationInput): Record<string, Citation> {
    const citationMap: Record<string, Citation> = {};
    if (Array.isArray(citations)) {
      for (const c of citations) citationMap[getCitationKey(c)] = c;
    } else if (typeof citations === "object" && citations !== null) {
      if ("fullPhrase" in citations || "value" in citations) {
        const key = getCitationKey(citations as Citation);
        citationMap[key] = citations as Citation;
      } else {
        Object.assign(citationMap, citations);
      }
    } else {
      throw new ValidationError("Invalid citations format");
    }
    return citationMap;
  }

  /** Resolve endUserId: per-request override wins over instance default. */
  private resolveEndUserId(override?: string): string | undefined {
    return override ?? this.endUserId;
  }

  /** Resolve endFileId: per-request override wins over instance default. */
  private resolveEndFileId(override?: string): string | undefined {
    return override ?? this.endFileId;
  }

  /** Resolve converted PDF download policy: per-request override wins over instance default. */
  private resolveConvertedPdfDownloadPolicy(override?: ConvertedPdfDownloadPolicy): ConvertedPdfDownloadPolicy {
    return override ?? this.convertedPdfDownloadPolicy;
  }

  /** Common headers included in every API request. */
  private baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "X-SDK-Version": SDK_VERSION,
    };
    if (this.requestSource) {
      headers["X-Request-Source"] = this.requestSource;
    }
    return headers;
  }

  /** Fetch with retry, forwarding instance-level maxRetries, logger, and custom fetch. */
  private _fetch(url: string, options: RequestInit): Promise<Response> {
    return fetchWithRetry(url, options, this.maxRetries, this.logger, this.fetchFn);
  }

  /** If the response contains a latest SDK version header, notify the callback. */
  private checkLatestVersion(response: Response): void {
    if (!this.onLatestVersion) return;
    const latest = response.headers.get("X-Latest-SDK-Version");
    if (latest) this.onLatestVersion(latest);
  }

  /** If the response is successful and contains usage-limit headers, fire the onUsageUpdate callback. */
  private checkUsageWarning(response: Response): void {
    if (!this.onUsageUpdate || !response.ok) return;
    const remaining = parseFloat(response.headers.get("X-DeepCitation-Remaining") ?? "");
    const limit = parseFloat(response.headers.get("X-DeepCitation-Limit") ?? "");
    if (!Number.isNaN(remaining) && !Number.isNaN(limit)) this.onUsageUpdate(remaining, limit);
  }

  /**
   * Clean expired entries from the verify cache.
   * Only runs periodically to avoid performance overhead on every call.
   * Also enforces max cache size with LRU eviction to prevent memory leaks.
   */
  private cleanExpiredCache(): void {
    try {
      const now = Date.now();

      // Only clean up periodically, not on every call
      if (now - this.lastCacheCleanup < this.CACHE_CLEANUP_INTERVAL_MS) {
        return;
      }
      this.lastCacheCleanup = now;

      // Remove expired entries
      for (const [key, entry] of this.verifyCache.entries()) {
        if (now - entry.timestamp > this.CACHE_TTL_MS) {
          this.verifyCache.delete(key);
        }
      }

      // LRU eviction: if still too large, remove oldest entries
      if (this.verifyCache.size > this.MAX_CACHE_SIZE) {
        const entries = Array.from(this.verifyCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, this.verifyCache.size - this.MAX_CACHE_SIZE);
        for (const [key] of toRemove) {
          this.verifyCache.delete(key);
        }
      }
    } catch (err) {
      // Silently fail - do not break the main verification flow
      // Serialize error to avoid passing non-serializable objects to logger
      this.logger.warn?.("Cache cleanup failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Upload a file for citation verification.
   *
   * Supported file types:
   * - PDF documents
   * - Images (PNG, JPEG, WebP, AVIF, HEIC)
   * - Coming soon: DOCX, XLSX, plain text
   *
   * @param file - The file to upload (File, Blob, or Buffer)
   * @param options - Optional upload options
   * @returns Upload response with attachmentId and extracted text
   *
   * @example
   * ```typescript
   * // Browser with File object
   * const file = document.querySelector('input[type="file"]').files[0];
   * const result = await deepcitation.uploadFile(file);
   *
   * // Node.js with Buffer
   * const buffer = fs.readFileSync('document.pdf');
   * const result = await deepcitation.uploadFile(buffer, { filename: 'document.pdf' });
   * ```
   */
  async uploadFile(file: File | Blob | Buffer, options?: UploadFileOptions): Promise<UploadFileResponse> {
    const { blob, name } = toBlob(file, options?.filename);
    this.logger.info?.("Uploading file", { filename: name, size: blob.size });

    const formData = new FormData();
    formData.append("file", blob, name);

    if (options?.attachmentId) formData.append("attachmentId", options.attachmentId);
    if (options?.filename) formData.append("filename", options.filename);
    const resolvedEndUserId = this.resolveEndUserId(options?.endUserId);
    const resolvedEndFileId = this.resolveEndFileId(options?.endFileId);
    const convertedPdfDownloadPolicy = this.resolveConvertedPdfDownloadPolicy(options?.convertedPdfDownloadPolicy);
    if (resolvedEndUserId) formData.append("endUserId", resolvedEndUserId);
    if (resolvedEndFileId) formData.append("endFileId", resolvedEndFileId);
    formData.append("convertedPdfDownloadPolicy", convertedPdfDownloadPolicy);

    const response = await this._fetch(`${this.apiUrl}/prepareAttachments`, {
      method: "POST",
      headers: { ...this.baseHeaders() },
      body: formData,
    });
    this.checkLatestVersion(response);
    this.checkUsageWarning(response);

    if (!response.ok) {
      this.logger.error?.("Upload failed", { filename: name, status: response.status });
      throw await createApiError(response, "Upload");
    }

    const result = (await response.json()) as UploadFileResponse;
    this.logger.info?.("Upload complete", { filename: name, attachmentId: result.attachmentId });
    return result;
  }

  /**
   * Convert a URL or Office file to PDF for citation verification.
   * The converted file can then be processed with prepareConvertedFile().
   *
   * Supported Office formats:
   * - Microsoft Word (.doc, .docx)
   * - Microsoft Excel (.xls, .xlsx)
   * - Microsoft PowerPoint (.ppt, .pptx)
   * - OpenDocument (.odt, .ods, .odp)
   * - Rich Text Format (.rtf)
   * - CSV (.csv)
   *
   * @param input - URL string or object with URL/file options
   * @returns Conversion result with attachmentId for prepareConvertedFile
   *
   * @example
   * ```typescript
   * // Convert a URL to PDF
   * const result = await deepcitation.convertToPdf({ url: "https://example.com/article" });
   *
   * // Convert an Office document
   * const result = await deepcitation.convertToPdf({
   *   file: docxBuffer,
   *   filename: "report.docx"
   * });
   *
   * // Then prepare the file for verification
   * const { deepTextPages, attachmentId } = await deepcitation.prepareConvertedFile({
   *   attachmentId: result.attachmentId
   * });
   * ```
   */
  async convertToPdf(input: ConvertFileInput | string): Promise<ConvertFileResponse> {
    const inputObj: ConvertFileInput = typeof input === "string" ? { url: input } : input;
    const { url, file, filename, attachmentId } = inputObj;

    if (!url && !file) {
      throw new ValidationError("Either url or file must be provided");
    }

    const resolvedEndUserId = this.resolveEndUserId(inputObj.endUserId);
    const resolvedEndFileId = this.resolveEndFileId(inputObj.endFileId);
    const convertedPdfDownloadPolicy = this.resolveConvertedPdfDownloadPolicy(inputObj.convertedPdfDownloadPolicy);
    this.logger.info?.("Converting to PDF", { url, filename, attachmentId });
    let response: Response;

    if (url) {
      response = await this._fetch(`${this.apiUrl}/convertFile`, {
        method: "POST",
        headers: { ...this.baseHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          filename,
          attachmentId,
          endUserId: resolvedEndUserId,
          endFileId: resolvedEndFileId,
          convertedPdfDownloadPolicy,
        }),
      });
    } else {
      // file is guaranteed truthy: the early guard throws if both url and file are falsy
      const { blob, name } = toBlob(file as File | Blob | Buffer, filename);
      const formData = new FormData();
      formData.append("file", blob, name);
      if (attachmentId) formData.append("attachmentId", attachmentId);
      if (filename) formData.append("filename", filename);
      if (resolvedEndUserId) formData.append("endUserId", resolvedEndUserId);
      if (resolvedEndFileId) formData.append("endFileId", resolvedEndFileId);
      formData.append("convertedPdfDownloadPolicy", convertedPdfDownloadPolicy);

      response = await this._fetch(`${this.apiUrl}/convertFile`, {
        method: "POST",
        headers: { ...this.baseHeaders() },
        body: formData,
      });
    }

    this.checkLatestVersion(response);
    this.checkUsageWarning(response);

    if (!response.ok) {
      this.logger.error?.("Conversion failed", { url, filename, status: response.status });
      throw await createApiError(response, "Conversion");
    }

    const result = (await response.json()) as ConvertFileResponse;
    this.logger.info?.("Conversion complete", { attachmentId: result.attachmentId });
    return result;
  }

  /**
   * Prepare a previously converted file for citation verification.
   * Use this after calling convertToPdf() to extract text and get deepTextPages.
   *
   * @param options - Options with attachmentId from convertFile
   * @returns Upload response with attachmentId and extracted text
   *
   * @example
   * ```typescript
   * // First convert the file
   * const converted = await deepcitation.convertToPdf({ url: "https://example.com/article" });
   *
   * // Then prepare it for verification
   * const { deepTextPages, attachmentId } = await deepcitation.prepareConvertedFile({
   *   attachmentId: converted.attachmentId
   * });
   *
   * // Use deepTextPages with wrapCitationPrompt() or your own deterministic renderer...
   * ```
   */
  async prepareConvertedFile(options: PrepareConvertedFileOptions): Promise<UploadFileResponse> {
    this.logger.info?.("Preparing converted file", { attachmentId: options.attachmentId });
    const resolvedEndUserId = this.resolveEndUserId(options.endUserId);
    const resolvedEndFileId = this.resolveEndFileId(options.endFileId);
    const convertedPdfDownloadPolicy = this.resolveConvertedPdfDownloadPolicy(options.convertedPdfDownloadPolicy);

    const response = await this._fetch(`${this.apiUrl}/prepareAttachments`, {
      method: "POST",
      headers: { ...this.baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        attachmentId: options.attachmentId,
        endUserId: resolvedEndUserId,
        endFileId: resolvedEndFileId,
        convertedPdfDownloadPolicy,
      }),
    });
    this.checkLatestVersion(response);
    this.checkUsageWarning(response);

    if (!response.ok) {
      this.logger.error?.("Prepare converted file failed", {
        attachmentId: options.attachmentId,
        status: response.status,
      });
      throw await createApiError(response, "Prepare");
    }

    const result = (await response.json()) as UploadFileResponse;
    this.logger.info?.("Prepare converted file complete", { attachmentId: result.attachmentId });
    return result;
  }

  /**
   * Prepare a URL for citation verification.
   *
   * This is a convenience method that handles URL conversion and text extraction
   * in a single call. The API will convert the URL to PDF and extract text content
   * for citation verification.
   *
   * Note: URLs and Office files take ~30s to process vs. <1s for images/PDFs.
   *
   * @param options - URL and optional settings
   * @returns Upload response with attachmentId and extracted text for LLM prompts
   *
   * @example
   * ```typescript
   * // Prepare a URL for citation verification
   * const { attachmentId, deepTextPages } = await deepcitation.prepareUrl({
   *   url: "https://example.com/article"
   * });
   *
   * // Use deepTextPages in your LLM prompt
   * const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
   *   systemPrompt,
   *   userPrompt: question,
   *   deepTextPages,
   * });
   *
   * // Verify citations
   * const verified = await deepcitation.verifyAttachment(attachmentId, citations);
   * ```
   */
  async prepareUrl(options: PrepareUrlOptions): Promise<UploadFileResponse> {
    this.logger.info?.("Preparing URL", {
      url: options.url,
      unsafeFast: options.unsafeFastUrlOutput,
      skipCache: options.skipCache,
    });

    const resolvedEndUserId = this.resolveEndUserId(options.endUserId);
    const resolvedEndFileId = this.resolveEndFileId(options.endFileId);
    const convertedPdfDownloadPolicy = this.resolveConvertedPdfDownloadPolicy(options.convertedPdfDownloadPolicy);
    const response = await this._fetch(`${this.apiUrl}/prepareAttachments`, {
      method: "POST",
      headers: { ...this.baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        url: options.url,
        attachmentId: options.attachmentId,
        filename: options.filename,
        unsafeFastUrlOutput: options.unsafeFastUrlOutput,
        skipCache: options.skipCache,
        endUserId: resolvedEndUserId,
        endFileId: resolvedEndFileId,
        convertedPdfDownloadPolicy,
      }),
    });
    this.checkLatestVersion(response);
    this.checkUsageWarning(response);

    if (!response.ok) {
      this.logger.error?.("Prepare URL failed", { url: options.url, status: response.status });
      throw await createApiError(response, "Prepare URL");
    }

    const result = (await response.json()) as UploadFileResponse;
    this.logger.info?.("Prepare URL complete", {
      url: options.url,
      attachmentId: result.attachmentId,
      cached: result.urlCache?.cached,
    });
    return result;
  }

  /**
   * Upload multiple files for citation verification and get structured content.
   * This is the recommended way to prepare attachments for LLM prompts.
   *
   * @param files - Array of files to upload with optional filenames and attachmentIds
   * @returns Object containing fileDataParts for verification plus per-file deepTextPages keyed by attachmentId
   *
   * @example
   * ```typescript
   * const { fileDataParts, deepTextPagesByAttachmentId, attachments } = await deepcitation.prepareAttachments([
   *   { file: pdfBuffer, filename: "report.pdf" },
   *   { file: invoiceBuffer, filename: "invoice.pdf" },
   * ]);
   *
   * // deepTextPagesByAttachmentId preserves attachment identity without relying on order
   * const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
   *   systemPrompt,
   *   userPrompt,
   *   deepTextPagesByAttachmentId,
   * });
   *
   * // Use fileDataParts later for verification
   * const result = await deepcitation.verify({ llmOutput, fileDataParts });
   * ```
   */
  async prepareAttachments(files: FileInput[]): Promise<PrepareAttachmentsResult> {
    if (files.length === 0) {
      return { fileDataParts: [], deepTextPagesByAttachmentId: {}, attachments: [] };
    }

    this.logger.info?.("Preparing files", { count: files.length });

    // Upload files with concurrency limit to prevent overwhelming network/server
    // Performance fix: limits concurrent uploads to DEFAULT_UPLOAD_CONCURRENCY
    const uploadPromises = files.map(
      ({ file, filename, attachmentId, endUserId, endFileId, convertedPdfDownloadPolicy }) =>
        this.uploadLimiter(() =>
          this.uploadFile(file, { filename, attachmentId, endUserId, endFileId, convertedPdfDownloadPolicy }).then(
            result => ({
              result,
              filename,
            }),
          ),
        ),
    );

    const uploadResults = await Promise.all(uploadPromises);

    const fileDataParts: Array<{ attachmentId: string; filename?: string }> = uploadResults.map(
      ({ result, filename }) => ({
        attachmentId: result.attachmentId,
        filename: filename || result.metadata?.filename,
      }),
    );

    const attachments = uploadResults.map(({ result }) => ({
      attachmentId: result.attachmentId,
      deepTextPages: result.deepTextPages,
      urlSource: result.urlSource,
      originalDownload: result.originalDownload,
      convertedDownload: result.convertedDownload,
      pageImages: result.pageImages,
      pageImagesStatus: result.pageImagesStatus,
    }));

    const deepTextPagesByAttachmentId = Object.fromEntries(
      uploadResults.map(({ result }) => [result.attachmentId, result.deepTextPages]),
    );

    this.logger.info?.("Prepare files complete", { count: fileDataParts.length });
    return { fileDataParts, deepTextPagesByAttachmentId, attachments };
  }

  /**
   * Backward-compatible alias that accepts a single file input and delegates to `prepareAttachments`.
   * The return type is `PrepareAttachmentsResult` (plural) — use `result.attachments[0]` to access
   * the single prepared attachment.
   */
  async prepareAttachment(file: FileInput): Promise<PrepareAttachmentsResult> {
    return this.prepareAttachments([file]);
  }

  /**
   * Verify citations against a single attachment/file.
   *
   * For most use cases, prefer `verify()` which automatically parses citations
   * from LLM output and handles multiple attachments. Use this method when you
   * need fine-grained control over per-attachment verification.
   *
   * @param attachmentId - The attachment ID returned from uploadFile
   * @param citations - Citations to verify (from getAllCitationsFromLlmOutput)
   * @param options - Optional verification options
   * @returns Verification results with status and verification artifacts
   *
   * @example
   * ```typescript
   * import { getAllCitationsFromLlmOutput } from 'deepcitation';
   *
   * const citations = getAllCitationsFromLlmOutput(llmResponse);
   * const verified = await deepcitation.verifyAttachment(attachmentId, citations);
   *
   * for (const [key, result] of Object.entries(verified.verifications)) {
   *   console.log(key, result.status);
   *   // "found", "partial_text_found", "not_found", etc.
   * }
   * ```
   */
  async verifyAttachment(
    attachmentId: string,
    citations: CitationInput,
    options?: VerifyCitationsOptions,
  ): Promise<VerifyCitationsResponse> {
    const citationMap = this.normalizeCitationInput(citations);

    // If no citations to verify, return empty result
    const citationCount = Object.keys(citationMap).length;
    if (citationCount === 0) {
      return { verifications: {} };
    }

    // Performance fix: request deduplication
    // Use getCitationKey for each citation to create a deterministic cache key
    // Sorting ensures consistent ordering for equivalent content
    // Selection is appended separately since getCitationKey doesn't include it
    // Final key is hashed to prevent collisions from delimiter characters in user data
    // Note: We use Object.values, not Object.entries, because the map key (citation number)
    // is just a display identifier - verification results depend only on citation content
    const citationKeys = Object.values(citationMap)
      .map(citation => getCitationKey(citation))
      .sort()
      .join("|");
    const rawKey = `${attachmentId}:${citationKeys}:${options?.outputImageFormat || "avif"}`;
    const cacheKey = sha1Hash(rawKey).slice(0, 32); // Use first 32 chars of hash

    // Clean expired cache entries periodically
    this.cleanExpiredCache();

    // Check if we have a cached request
    const cached = this.verifyCache.get(cacheKey);
    if (cached) {
      // Update timestamp on access for true LRU behavior
      cached.timestamp = Date.now();
      this.logger.debug?.("Verification cache hit", { attachmentId, citationCount });
      return cached.promise;
    }

    const resolvedEndUserId = this.resolveEndUserId(options?.endUserId);
    this.logger.info?.("Verifying citations", { attachmentId, citationCount });

    // Create the fetch promise and cache it
    const fetchPromise = (async (): Promise<VerifyCitationsResponse> => {
      const response = await this._fetch(`${this.apiUrl}/verifyCitations`, {
        method: "POST",
        headers: { ...this.baseHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            attachmentId,
            citations: citationMap,
            outputImageFormat: options?.outputImageFormat || "avif",
            endUserId: resolvedEndUserId,
          },
        }),
      });
      this.checkLatestVersion(response);
      this.checkUsageWarning(response);

      if (!response.ok) {
        // Remove from cache on error so retry is possible
        this.verifyCache.delete(cacheKey);
        this.logger.error?.("Verification failed", { attachmentId, status: response.status });
        throw await createApiError(response, "Verification");
      }

      return (await response.json()) as VerifyCitationsResponse;
    })();

    // Force cleanup if cache is at or approaching the limit to prevent memory leaks
    // This ensures we never exceed MAX_CACHE_SIZE even under heavy concurrent load
    if (this.verifyCache.size >= this.MAX_CACHE_SIZE) {
      // Sort by timestamp and remove oldest entries to make room
      const entries = Array.from(this.verifyCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      // Remove at least 10% of entries to avoid thrashing
      const toRemove = Math.max(1, Math.floor(this.MAX_CACHE_SIZE * 0.1));
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.verifyCache.delete(entries[i][0]);
      }
    }

    // Cache the promise
    this.verifyCache.set(cacheKey, {
      promise: fetchPromise,
      timestamp: Date.now(),
    });

    return fetchPromise;
  }

  /**
   * Iteratively verify citations with an LLM retry loop.
   *
   * For each citation: calls verifyAttachment, then invokes onAttemptComplete
   * so the consumer can amend the citation and retry (up to maxAttempts).
   * The callback is where the consumer plugs in their LLM — the SDK is LLM-agnostic.
   *
   * When a citation comes back as "found" or "found_anchor_text_only" it is
   * accepted immediately without calling onAttemptComplete.
   *
   * Note: citations are verified serially (one at a time) so the callback can
   * use results from earlier citations to inform amendments. For parallel
   * first-pass verification, use `verifyAttachment` directly.
   *
   * @param attachmentId - The attachment to verify against
   * @param citations - Citation(s) to verify (same input formats as verifyAttachment)
   * @param options - Iterative verification options including the amendment callback
   * @returns Verification results with llmAttempts populated when retries occurred
   */
  async verifyIterative(
    attachmentId: string,
    citations: CitationInput,
    options: IterativeVerifyOptions,
  ): Promise<VerifyCitationsResponse> {
    const maxAttempts = options.maxAttempts ?? 3;
    const citationMap = this.normalizeCitationInput(citations);
    const finalVerifications: Record<string, Verification> = {};

    for (const [citationKey, initialCitation] of Object.entries(citationMap)) {
      const history: LlmSearchAttempt[] = [];
      let currentCitation = initialCitation;

      for (let i = 0; i < maxAttempts; i++) {
        const start = Date.now();
        const result = await this.verifyAttachment(attachmentId, { [citationKey]: currentCitation }, options);
        const verification = result.verifications[citationKey];
        const durationMs = Date.now() - start;

        // API may not return a verification for this key — the citation key
        // was not recognised or the API filtered it out.  Bail rather than
        // silently dropping the citation from the results.
        if (!verification) {
          this.logger.warn?.("verifyIterative: no verification returned for key", { citationKey });
          break;
        }

        const attempt: LlmSearchAttempt = {
          submittedCitation: currentCitation,
          verification,
          durationMs,
          ...(i > 0 ? { amendments: computeAmendments(history[i - 1].submittedCitation, currentCitation) } : {}),
        };
        history.push(attempt);

        if (verification.status && TERMINAL_VERIFY_STATUSES.has(verification.status)) break;
        if (i >= maxAttempts - 1) break;

        const callbackResult = await options.onAttemptComplete(attempt, history, citationKey);
        if (!callbackResult) break;

        // Normalise callback return — plain Citation or { citation, isFalsePositiveRejection }
        if ("fullPhrase" in callbackResult || "value" in callbackResult) {
          currentCitation = callbackResult as Citation;
        } else {
          currentCitation = (callbackResult as { citation: Citation; isFalsePositiveRejection?: boolean }).citation;
          if ((callbackResult as { isFalsePositiveRejection?: boolean }).isFalsePositiveRejection) {
            attempt.partialRejectedAsFalsePositive = true;
          }
        }
      }

      if (history.length > 0) {
        const last = history[history.length - 1].verification;
        // Single-attempt results (terminal on first try, or consumer stopped early)
        // omit llmAttempts — consumers should check the status field to distinguish
        // terminal from early-stop.  Multi-attempt results always include the full history.
        finalVerifications[citationKey] = history.length > 1 ? { ...last, llmAttempts: history } : last;
      } else {
        // API returned no verification for this key — include a synthetic entry
        // so consumers always see every requested key in the response.
        finalVerifications[citationKey] = {
          status: "not_found",
          citation: currentCitation,
          searchAttempts: [],
        } as Verification;
      }
    }

    return { verifications: finalVerifications };
  }

  /**
   * Verify citations across multiple attachments in a single batch request.
   *
   * Instead of making one API call per attachment, batch mode sends all citations
   * in a single request. The API groups internally, verifies each attachment in
   * parallel, and returns a single merged response.
   *
   * Each citation must include an `attachmentId` field. Citations without an
   * `attachmentId` are returned with `status: "skipped"`.
   *
   * @param citations - Record of citations keyed by citation key, each with its own attachmentId
   * @param options - Optional verification options (image format, endUserId)
   * @returns Verification results with status and verification artifacts
   *
   * @example
   * ```typescript
   * const result = await deepcitation.verifyBatch({
   *   key1: { type: "document", fullPhrase: "HbA1c 5.5%", attachmentId: "abc123", pageNumber: 2 },
   *   key2: { type: "document", fullPhrase: "disc protrusion", attachmentId: "def456", pageNumber: 1 },
   * });
   *
   * for (const [key, verification] of Object.entries(result.verifications)) {
   *   console.log(key, verification.status);
   * }
   * ```
   */
  async verifyBatch(
    citations: Record<string, Citation>,
    options?: VerifyBatchOptions,
  ): Promise<VerifyCitationsResponse> {
    const citationEntries = Object.entries(citations);

    if (citationEntries.length === 0) {
      return { verifications: {} };
    }

    // Separate citations into sendable (have attachmentId) and skipped.
    // URL citations without an attachmentId are intentionally skipped here —
    // they require a separate URL verification flow (prepareUrl → verify).
    const batchCitations: Record<string, Citation> = {};
    const skippedKeys: string[] = [];

    for (const [key, citation] of citationEntries) {
      if (citation.attachmentId) {
        batchCitations[key] = citation;
      } else {
        skippedKeys.push(key);
      }
    }

    // Limits apply to sendable citations only (skipped citations are not sent to the API)
    const sendableCount = Object.keys(batchCitations).length;
    if (sendableCount > 500) {
      throw new ValidationError(`Batch request contains ${sendableCount} citations, max is 500`);
    }

    // Validate max distinct attachments
    const distinctAttachments = new Set(
      Object.values(batchCitations)
        .map(c => c.attachmentId)
        .filter(Boolean),
    );
    if (distinctAttachments.size > 50) {
      throw new ValidationError(`Batch request references ${distinctAttachments.size} distinct attachments, max is 50`);
    }

    if (skippedKeys.length > 0) {
      this.logger.warn?.(`${skippedKeys.length} citation(s) skipped in batch: missing attachmentId`, {
        skippedCount: skippedKeys.length,
      });
    }

    const resolvedEndUserId = this.resolveEndUserId(options?.endUserId);
    const outputImageFormat = options?.outputImageFormat ?? "avif";

    this.logger.info?.("Verifying citations (batch)", {
      citationCount: sendableCount,
      attachmentCount: distinctAttachments.size,
    });

    // Build the result, starting with any skipped citations.
    // Skipped entries only have `status` — no label, evidence, or document fields.
    const allVerifications: VerifyCitationsResponse["verifications"] = {};
    for (const key of skippedKeys) {
      allVerifications[key] = { status: "skipped", skipped: true };
    }

    // If all were skipped, return early
    if (Object.keys(batchCitations).length === 0) {
      return { verifications: allVerifications };
    }

    const response = await this._fetch(`${this.apiUrl}/verifyCitations`, {
      method: "POST",
      headers: { ...this.baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          mode: "batch",
          citations: batchCitations,
          outputImageFormat,
          endUserId: resolvedEndUserId,
        },
      }),
    });
    this.checkLatestVersion(response);
    this.checkUsageWarning(response);

    if (!response.ok) {
      this.logger.error?.("Batch verification failed", { status: response.status });
      throw await createApiError(response, "Batch verification");
    }

    const result = (await response.json()) as VerifyCitationsResponse;
    Object.assign(allVerifications, result.verifications);

    return { verifications: allVerifications };
  }

  /**
   * Parse and verify all citations from LLM output.
   *
   * This is the recommended method for citation verification. It automatically:
   * 1. Parses citations from LLM output (no raw content sent to our servers)
   * 2. Groups citations by attachment ID
   * 3. Sends a single batch verification request for all attachments
   *
   * For privacy-conscious users: we only receive the parsed citation metadata,
   * not your raw LLM output. This method is a convenience wrapper that parses
   * locally and sends one batch request.
   *
   * @param input - Object containing llmOutput and optional outputImageFormat
   * @param citations - Optional pre-parsed citations (skips parsing if provided)
   * @returns Verification results with status and verification artifacts
   *
   * @example
   * ```typescript
   * const result = await deepcitation.verify({
   *   llmOutput: response.content,
   * });
   *
   * for (const [key, verification] of Object.entries(result.verifications)) {
   *   console.log(key, verification.status);
   * }
   * ```
   */
  async verify(input: VerifyInput, citations?: { [key: string]: Citation }): Promise<VerifyCitationsResponse> {
    const { llmOutput, outputImageFormat = "avif", endUserId } = input;

    // Parse citations from LLM output
    if (!citations) citations = getAllCitationsFromLlmOutput(llmOutput);

    const totalCount = Object.keys(citations).length;
    // If no citations found, return empty result
    if (totalCount === 0) {
      this.logger.debug?.("No citations found in LLM output");
      return { verifications: {} };
    }

    this.logger.info?.("Verifying LLM output", { citationCount: totalCount });

    // Use batch mode: send all citations in a single request
    return this.verifyBatch(citations, { outputImageFormat, endUserId });
  }

  /**
   * Extend the expiration date of an attachment.
   *
   * Use this to keep an attachment available for longer. Attachments have
   * an optional expiration date after which they may be deleted.
   *
   * @param options - Options with attachmentId and duration
   * @returns Response with the new expiration date
   *
   * @example
   * ```typescript
   * // Extend by one month (30 days)
   * const result = await deepcitation.extendExpiration({
   *   attachmentId: "abc123",
   *   duration: "month",
   * });
   * console.log(`New expiration: ${result.expiresAt}`);
   *
   * // Extend by one year (365 days)
   * const result = await deepcitation.extendExpiration({
   *   attachmentId: "abc123",
   *   duration: "year",
   * });
   * ```
   */
  async extendExpiration(options: ExtendExpirationOptions): Promise<ExtendExpirationResponse> {
    this.logger.info?.("Extending expiration", { attachmentId: options.attachmentId, duration: options.duration });

    const response = await this._fetch(`${this.apiUrl}/attachments/${options.attachmentId}/extend`, {
      method: "POST",
      headers: { ...this.baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ duration: options.duration }),
    });
    this.checkLatestVersion(response);
    this.checkUsageWarning(response);

    if (!response.ok) {
      this.logger.error?.("Extend expiration failed", { attachmentId: options.attachmentId, status: response.status });
      throw await createApiError(response, "Extend expiration");
    }

    const result = (await response.json()) as ExtendExpirationResponse;
    this.logger.info?.("Expiration extended", { attachmentId: result.attachmentId, expiresAt: result.expiresAt });
    return result;
  }

  /**
   * Delete an attachment immediately.
   *
   * Use this to remove an attachment before its expiration date. This action
   * is irreversible - the attachment and all associated data will be deleted.
   *
   * @param attachmentId - The attachment ID to delete
   * @returns Response confirming the deletion
   *
   * @example
   * ```typescript
   * const result = await deepcitation.deleteAttachment("abc123");
   * if (result.deleted) {
   *   console.log("Attachment deleted successfully");
   * }
   * ```
   */
  async deleteAttachment(attachmentId: string): Promise<DeleteAttachmentResponse> {
    this.logger.info?.("Deleting attachment", { attachmentId });

    const response = await this._fetch(`${this.apiUrl}/attachments/${attachmentId}`, {
      method: "DELETE",
      headers: { ...this.baseHeaders() },
    });
    this.checkLatestVersion(response);
    this.checkUsageWarning(response);

    if (!response.ok) {
      this.logger.error?.("Delete attachment failed", { attachmentId, status: response.status });
      throw await createApiError(response, "Delete attachment");
    }

    const result = (await response.json()) as DeleteAttachmentResponse;
    this.logger.info?.("Attachment deleted", { attachmentId: result.attachmentId });
    return result;
  }

  /**
   * Get full attachment metadata by ID.
   *
   * Returns the attachment's status, pages, verifications, and optional deep text items.
   * Note: responses can be large for documents with many pages or verifications.
   *
   * @param attachmentId - The attachment ID to query
   * @returns Full attachment metadata including pages and verifications
   * @throws {ValidationError} When attachmentId is empty or missing (client-side)
   * @throws {ValidationError} When the API returns a 4xx error (e.g., 404 not found, 400 bad request)
   * @throws {ServerError} When the server encounters an internal error (5xx)
   *
   * @example
   * ```typescript
   * const attachment = await deepcitation.getAttachment("abc123");
   * switch (attachment.status) {
   *   case "ready":
   *     console.log(`${attachment.pageCount} pages, ${Object.keys(attachment.verifications).length} verifications`);
   *     break;
   *   case "processing":
   *     console.log("Attachment is still being processed");
   *     break;
   *   case "error":
   *     console.log("Attachment processing failed");
   *     break;
   * }
   * ```
   */
  async getAttachment(attachmentId: string, options?: GetAttachmentOptions): Promise<AttachmentResponse> {
    if (!attachmentId) {
      throw new ValidationError("attachmentId is required");
    }

    const resolvedEndUserId = this.resolveEndUserId(options?.endUserId);
    this.logger.info?.("Getting attachment", { attachmentId });

    const response = await this._fetch(`${this.apiUrl}/getAttachment`, {
      method: "POST",
      headers: { ...this.baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId, endUserId: resolvedEndUserId }),
    });
    this.checkLatestVersion(response);
    this.checkUsageWarning(response);

    if (!response.ok) {
      this.logger.error?.("Get attachment failed", { attachmentId, status: response.status });
      throw await createApiError(response, "Get attachment");
    }

    const result = (await response.json()) as AttachmentResponse;
    this.logger.info?.("Get attachment complete", { attachmentId: result.id, status: result.status });
    return result;
  }
}
