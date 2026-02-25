import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";
import { generateCitationKey } from "../react/utils.js";
import type { Citation } from "../types/index.js";
import { sha1Hash } from "../utils/sha.js";
import { AuthenticationError, type DeepCitationError, RateLimitError, ServerError, ValidationError } from "./errors.js";
import type {
  AttachmentResponse,
  CitationInput,
  ConvertFileInput,
  ConvertFileResponse,
  DeepCitationConfig,
  DeepCitationLogger,
  DeleteAttachmentResponse,
  ExtendExpirationOptions,
  ExtendExpirationResponse,
  FileDataPart,
  FileInput,
  PrepareConvertedFileOptions,
  PrepareFilesResult,
  PrepareUrlOptions,
  UploadFileOptions,
  UploadFileResponse,
  VerifyCitationsOptions,
  VerifyCitationsResponse,
  VerifyInput,
} from "./types.js";

const DEFAULT_API_URL = "https://api.deepcitation.com";

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
  const message = await extractErrorMessage(response, fallbackAction);
  const status = response.status;
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
      throw new AuthenticationError("DeepCitation API key is required. Get one at https://deepcitation.com/dashboard");
    }
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl?.replace(/\/$/, "") || DEFAULT_API_URL;
    this.uploadLimiter = createConcurrencyLimiter(config.maxUploadConcurrency ?? DEFAULT_UPLOAD_CONCURRENCY);
    this.logger = config.logger ?? {};
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

    const response = await fetch(`${this.apiUrl}/prepareAttachment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

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
   * const { deepTextPromptPortion, attachmentId } = await deepcitation.prepareConvertedFile({
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

    this.logger.info?.("Converting to PDF", { url, filename, attachmentId });
    let response: Response;

    if (url) {
      response = await fetch(`${this.apiUrl}/convertFile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, filename, attachmentId }),
      });
    } else if (file) {
      const { blob, name } = toBlob(file, filename);
      const formData = new FormData();
      formData.append("file", blob, name);
      if (attachmentId) formData.append("attachmentId", attachmentId);
      if (filename) formData.append("filename", filename);

      response = await fetch(`${this.apiUrl}/convertFile`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
      });
    } else {
      throw new ValidationError("Either url or file must be provided");
    }

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
   * Use this after calling convertToPdf() to extract text and get deepTextPromptPortion.
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
   * const { deepTextPromptPortion, attachmentId } = await deepcitation.prepareConvertedFile({
   *   attachmentId: converted.attachmentId
   * });
   *
   * // Use deepTextPromptPortion in your LLM prompt...
   * ```
   */
  async prepareConvertedFile(options: PrepareConvertedFileOptions): Promise<UploadFileResponse> {
    this.logger.info?.("Preparing converted file", { attachmentId: options.attachmentId });

    const response = await fetch(`${this.apiUrl}/prepareAttachment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        attachmentId: options.attachmentId,
      }),
    });

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
   * const { attachmentId, deepTextPromptPortion } = await deepcitation.prepareUrl({
   *   url: "https://example.com/article"
   * });
   *
   * // Use deepTextPromptPortion in your LLM prompt
   * const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
   *   systemPrompt,
   *   userPrompt: question,
   *   deepTextPromptPortion,
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

    const response = await fetch(`${this.apiUrl}/prepareAttachment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: options.url,
        attachmentId: options.attachmentId,
        filename: options.filename,
        unsafeFastUrlOutput: options.unsafeFastUrlOutput,
        skipCache: options.skipCache,
      }),
    });

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
   * @returns Object containing fileDataParts for verification and deepTextPromptPortion for LLM
   *
   * @example
   * ```typescript
   * const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
   *   { file: pdfBuffer, filename: "report.pdf" },
   *   { file: invoiceBuffer, filename: "invoice.pdf" },
   * ]);
   *
   * // Use deepTextPromptPortion in wrapCitationPrompt
   * const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
   *   systemPrompt,
   *   userPrompt,
   *   deepTextPromptPortion
   * });
   *
   * // Use fileDataParts later for verification
   * const result = await deepcitation.verify({ llmOutput, fileDataParts });
   * ```
   */
  async prepareFiles(files: FileInput[]): Promise<PrepareFilesResult> {
    if (files.length === 0) {
      return { fileDataParts: [] };
    }

    this.logger.info?.("Preparing files", { count: files.length });

    // Upload files with concurrency limit to prevent overwhelming network/server
    // Performance fix: limits concurrent uploads to DEFAULT_UPLOAD_CONCURRENCY
    const uploadPromises = files.map(({ file, filename, attachmentId }) =>
      this.uploadLimiter(() =>
        this.uploadFile(file, { filename, attachmentId }).then(result => ({
          result,
          filename,
        })),
      ),
    );

    const uploadResults = await Promise.all(uploadPromises);

    // Extract file data parts with deepTextPromptPortion included (single source of truth)
    const fileDataParts: FileDataPart[] = uploadResults.map(({ result, filename }) => ({
      attachmentId: result.attachmentId,
      deepTextPromptPortion: result.deepTextPromptPortion,
      filename: filename || result.metadata?.filename,
    }));

    this.logger.info?.("Prepare files complete", { count: fileDataParts.length });
    return { fileDataParts };
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
   * @returns Verification results with status and proof images
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
    // Normalize citations to a map with citation keys
    const citationMap: Record<string, Citation> = {};

    if (Array.isArray(citations)) {
      // Array of citations - generate keys
      for (const citation of citations) {
        const key = generateCitationKey(citation);
        citationMap[key] = citation;
      }
    } else if (typeof citations === "object" && citations !== null) {
      // Check if it's a single citation or a map
      if ("fullPhrase" in citations || "value" in citations) {
        // Single citation
        const key = generateCitationKey(citations as Citation);
        citationMap[key] = citations as Citation;
      } else {
        // Already a map
        Object.assign(citationMap, citations);
      }
    } else {
      throw new ValidationError("Invalid citations format");
    }

    // If no citations to verify, return empty result
    const citationCount = Object.keys(citationMap).length;
    if (citationCount === 0) {
      return { verifications: {} };
    }

    // Performance fix: request deduplication
    // Use generateCitationKey for each citation to create a deterministic cache key
    // Sorting ensures consistent ordering for equivalent content
    // Selection is appended separately since generateCitationKey doesn't include it
    // Final key is hashed to prevent collisions from delimiter characters in user data
    // Note: We use Object.values, not Object.entries, because the map key (citation number)
    // is just a display identifier - verification results depend only on citation content
    const citationKeys = Object.values(citationMap)
      .map(citation => {
        const baseKey = generateCitationKey(citation);
        const selectionKey = citation.type !== "url" && citation.selection ? JSON.stringify(citation.selection) : "";
        return `${baseKey}:${selectionKey}`;
      })
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

    if (options?.proofConfig && !options?.generateProofUrls) {
      console.warn("DeepCitation: proofConfig is ignored when generateProofUrls is not true");
    }

    this.logger.info?.("Verifying citations", { attachmentId, citationCount });
    const requestUrl = `${this.apiUrl}/verifyCitations`;
    const requestBody = {
      data: {
        attachmentId,
        citations: citationMap,
        outputImageFormat: options?.outputImageFormat || "avif",
        generateProofUrls: options?.generateProofUrls,
        proofConfig: options?.generateProofUrls ? options?.proofConfig : undefined,
      },
    };

    // Create the fetch promise and cache it
    const fetchPromise = (async (): Promise<VerifyCitationsResponse> => {
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

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
   * Parse and verify all citations from LLM output.
   *
   * This is the recommended method for citation verification. It automatically:
   * 1. Parses citations from LLM output (no raw content sent to our servers)
   * 2. Groups citations by attachment ID
   * 3. Verifies each attachment in parallel
   *
   * For privacy-conscious users: we only receive the parsed citation metadata,
   * not your raw LLM output. This method is a convenience wrapper that parses
   * locally and makes per-attachment verification calls.
   *
   * @param input - Object containing llmOutput and optional outputImageFormat
   * @param citations - Optional pre-parsed citations (skips parsing if provided)
   * @returns Verification results with status and proof images
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
    const { llmOutput, outputImageFormat = "avif", generateProofUrls, proofConfig } = input;

    // Parse citations from LLM output
    if (!citations) citations = getAllCitationsFromLlmOutput(llmOutput);

    const totalCount = Object.keys(citations).length;
    // If no citations found, return empty result
    if (totalCount === 0) {
      this.logger.debug?.("No citations found in LLM output");
      return { verifications: {} };
    }

    this.logger.info?.("Verifying LLM output", { citationCount: totalCount });

    // Group citations by attachmentId
    const citationsByAttachment = new Map<string, Record<string, Citation>>();
    for (const [key, citation] of Object.entries(citations)) {
      const attachmentId = (citation.type !== "url" ? citation.attachmentId : undefined) || "";
      if (!citationsByAttachment.has(attachmentId)) {
        citationsByAttachment.set(attachmentId, {});
      }
      const attachmentCitations = citationsByAttachment.get(attachmentId);
      if (attachmentCitations) {
        attachmentCitations[key] = citation;
      }
    }

    const verificationPromises: Promise<VerifyCitationsResponse>[] = [];
    const skippedCitations: Record<string, Citation> = {};

    for (const [attachmentId, fileCitations] of citationsByAttachment) {
      if (attachmentId) {
        verificationPromises.push(
          this.verifyAttachment(attachmentId, fileCitations, {
            outputImageFormat,
            generateProofUrls,
            proofConfig,
          }),
        );
      } else {
        Object.assign(skippedCitations, fileCitations);
        const skippedCount = Object.keys(fileCitations).length;
        this.logger.warn?.(`${skippedCount} citation(s) skipped: missing attachmentId`, { skippedCount });
      }
    }

    const results = await Promise.all(verificationPromises);
    const allVerifications: VerifyCitationsResponse["verifications"] = {};
    for (const result of results) {
      Object.assign(allVerifications, result.verifications);
    }

    for (const key of Object.keys(skippedCitations)) {
      allVerifications[key] = { status: "skipped" };
    }

    return { verifications: allVerifications };
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

    const response = await fetch(`${this.apiUrl}/attachments/${options.attachmentId}/extend`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        duration: options.duration,
      }),
    });

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

    const response = await fetch(`${this.apiUrl}/attachments/${attachmentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

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
  async getAttachment(attachmentId: string): Promise<AttachmentResponse> {
    if (!attachmentId) {
      throw new ValidationError("attachmentId is required");
    }

    this.logger.info?.("Getting attachment", { attachmentId });

    const response = await fetch(`${this.apiUrl}/getAttachment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attachmentId }),
    });

    if (!response.ok) {
      this.logger.error?.("Get attachment failed", { attachmentId, status: response.status });
      throw await createApiError(response, "Get attachment");
    }

    const result = (await response.json()) as AttachmentResponse;
    this.logger.info?.("Get attachment complete", { attachmentId: result.id, status: result.status });
    return result;
  }
}
