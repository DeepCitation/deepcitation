import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation";
import { generateCitationKey } from "../react/utils";
import type { Citation } from "../types/index";
import type {
  CitationInput,
  ConvertFileInput,
  ConvertFileResponse,
  DeepCitationConfig,
  FileDataPart,
  FileInput,
  PrepareConvertedFileOptions,
  PrepareFilesResult,
  UploadFileOptions,
  UploadFileResponse,
  VerifyCitationsFromLlmOutputInput,
  VerifyCitationsOptions,
  VerifyCitationsResponse,
} from "./types";

const DEFAULT_API_URL = "https://api.deepcitation.com";

/**
 * DeepCitation client for file upload and citation verification.
 *
 * @example
 * ```typescript
 * import { DeepCitation } from '@deepcitation/deepcitation-js';
 *
 * const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });
 *
 * // Upload a file
 * const { fileId, promptContent } = await dc.uploadFile(file);
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
 * const verified = await dc.verifyCitations(fileId, citations);
 * ```
 */
export class DeepCitation {
  private readonly apiKey: string;
  private readonly apiUrl: string;

  /**
   * Stores mapping of user-provided fileId to internal attachmentId
   * This allows users to reference files by their own IDs
   */
  private fileIdMap: Map<string, { attachmentId: string }> = new Map();

  /**
   * Create a new DeepCitation client instance.
   *
   * @param config - Configuration options
   * @throws Error if apiKey is not provided
   */
  constructor(config: DeepCitationConfig) {
    if (!config.apiKey) {
      throw new Error(
        "DeepCitation API key is required. Get one at https://deepcitation.com/dashboard"
      );
    }
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl?.replace(/\/$/, "") || DEFAULT_API_URL;
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
   * @returns Upload response with fileId and extracted text
   *
   * @example
   * ```typescript
   * // Browser with File object
   * const file = document.querySelector('input[type="file"]').files[0];
   * const result = await dc.uploadFile(file);
   *
   * // Node.js with Buffer
   * const buffer = fs.readFileSync('document.pdf');
   * const result = await dc.uploadFile(buffer, { filename: 'document.pdf' });
   * ```
   */
  async uploadFile(
    file: File | Blob | Buffer,
    options?: UploadFileOptions
  ): Promise<UploadFileResponse> {
    const formData = new FormData();

    // Handle different input types
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
      // Node.js Buffer - copy to a new ArrayBuffer for Blob compatibility
      const filename = options?.filename || "document";
      // Use Uint8Array.from to create a copy that's definitely backed by ArrayBuffer (not SharedArrayBuffer)
      const uint8 = Uint8Array.from(file);
      const blob = new Blob([uint8]);
      formData.append("file", blob, filename);
    } else if (file instanceof Blob) {
      // File or Blob
      const filename =
        options?.filename || (file instanceof File ? file.name : "document");
      formData.append("file", file, filename);
    } else {
      throw new Error("Invalid file type. Expected File, Blob, or Buffer.");
    }

    // Add optional fields
    if (options?.fileId) {
      formData.append("fileId", options.fileId);
    }
    if (options?.filename) {
      formData.append("filename", options.filename);
    }

    const response = await fetch(`${this.apiUrl}/prepareFile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error?.error?.message || `Upload failed with status ${response.status}`
      );
    }

    // Internal response includes attachmentId which we need for verification
    const apiResponse = (await response.json()) as UploadFileResponse & {
      attachmentId: string;
    };

    // Store the mapping for later verification calls
    this.fileIdMap.set(apiResponse.fileId, {
      attachmentId: apiResponse.attachmentId,
    });

    // Return public response without internal fields
    const { attachmentId: _attachmentId, ...publicResponse } = apiResponse;
    return publicResponse;
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
   * const result = await dc.convertToPdf({ url: "https://example.com/article" });
   *
   * // Convert an Office document
   * const result = await dc.convertToPdf({
   *   file: docxBuffer,
   *   filename: "report.docx"
   * });
   *
   * // Then prepare the file for verification
   * const { deepTextPromptPortion, fileId } = await dc.prepareConvertedFile({
   *   fileId: result.fileId
   * });
   * ```
   */
  async convertToPdf(
    input: ConvertFileInput | string
  ): Promise<ConvertFileResponse> {
    // Handle string URL shorthand
    const inputObj: ConvertFileInput =
      typeof input === "string" ? { url: input } : input;
    const { url, file, filename, fileId, singlePage } = inputObj;

    if (!url && !file) {
      throw new Error("Either url or file must be provided");
    }

    let response: Response;

    if (url) {
      // URL conversion - send as JSON
      response = await fetch(`${this.apiUrl}/convertFile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          filename,
          fileId,
          singlePage,
        }),
      });
    } else if (file) {
      // Office file conversion - send as multipart
      const formData = new FormData();

      if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
        const fname = filename || "document";
        const uint8 = Uint8Array.from(file);
        const blob = new Blob([uint8]);
        formData.append("file", blob, fname);
      } else if (file instanceof Blob) {
        const fname =
          filename || (file instanceof File ? file.name : "document");
        formData.append("file", file, fname);
      } else {
        throw new Error("Invalid file type. Expected File, Blob, or Buffer.");
      }

      if (fileId) {
        formData.append("fileId", fileId);
      }
      if (filename) {
        formData.append("filename", filename);
      }

      response = await fetch(`${this.apiUrl}/convertFile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });
    } else {
      throw new Error("Either url or file must be provided");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error?.error?.message ||
          `Conversion failed with status ${response.status}`
      );
    }

    // Internal response includes attachmentId which we need for the two-step flow
    const apiResponse = (await response.json()) as ConvertFileResponse & {
      attachmentId: string;
    };

    // Store the mapping for later verification and prepareConvertedFile calls
    this.fileIdMap.set(apiResponse.fileId, {
      attachmentId: apiResponse.attachmentId,
    });

    // Return public response without internal fields
    const { attachmentId: _attachmentId, ...publicResponse } = apiResponse;
    return publicResponse;
  }

  /**
   * Prepare a previously converted file for citation verification.
   * Use this after calling convertToPdf() to extract text and get deepTextPromptPortion.
   *
   * @param options - Options with fileId from convertFile
   * @returns Upload response with fileId and extracted text
   *
   * @example
   * ```typescript
   * // First convert the file
   * const converted = await dc.convertToPdf({ url: "https://example.com/article" });
   *
   * // Then prepare it for verification
   * const { deepTextPromptPortion, fileId } = await dc.prepareConvertedFile({
   *   fileId: converted.fileId
   * });
   *
   * // Use deepTextPromptPortion in your LLM prompt...
   * ```
   */
  async prepareConvertedFile(
    options: PrepareConvertedFileOptions
  ): Promise<UploadFileResponse> {
    // Look up the internal attachmentId from the fileId
    const fileInfo = this.fileIdMap.get(options.fileId);
    if (!fileInfo) {
      throw new Error(
        `File ID "${options.fileId}" not found. Make sure to call convertToPdf() first.`
      );
    }

    const response = await fetch(`${this.apiUrl}/prepareFile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        attachmentId: fileInfo.attachmentId,
        fileId: options.fileId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error?.error?.message || `Prepare failed with status ${response.status}`
      );
    }

    // Internal response includes attachmentId
    const apiResponse = (await response.json()) as UploadFileResponse & {
      attachmentId: string;
    };

    // Update the mapping (attachmentId should remain the same)
    this.fileIdMap.set(apiResponse.fileId, {
      attachmentId: apiResponse.attachmentId,
    });

    // Return public response without internal fields
    const { attachmentId: _attachmentId, ...publicResponse } = apiResponse;
    return publicResponse;
  }

  /**
   * Upload multiple files for citation verification and get structured content.
   * This is the recommended way to prepare files for LLM prompts.
   *
   * @param files - Array of files to upload with optional filenames and fileIds
   * @returns Object containing fileDataParts for verification and deepTextPromptPortion for LLM
   *
   * @example
   * ```typescript
   * const { fileDataParts, deepTextPromptPortion } = await dc.prepareFiles([
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
   * const result = await dc.verifyCitationsFromLlmOutput({ llmOutput, fileDataParts });
   * ```
   */
  async prepareFiles(files: FileInput[]): Promise<PrepareFilesResult> {
    if (files.length === 0) {
      return { fileDataParts: [], deepTextPromptPortion: [] };
    }

    // Upload all files in parallel
    const uploadPromises = files.map(({ file, filename, fileId }) =>
      this.uploadFile(file, { filename, fileId })
    );

    const results = await Promise.all(uploadPromises);

    // Extract file data parts and file deep texts
    const fileDataParts: FileDataPart[] = results.map((result) => ({
      fileId: result.fileId,
    }));

    const deepTextPromptPortion: string[] = results.map(
      (result) => result.deepTextPromptPortion
    );

    return { fileDataParts, deepTextPromptPortion };
  }

  /**
   * Verify citations against a previously uploaded file.
   *
   * @param fileId - The file ID returned from uploadFile
   * @param citations - Citations to verify (from getAllCitationsFromLlmOutput)
   * @param options - Optional verification options
   * @returns Verification results with status and proof images
   *
   * @example
   * ```typescript
   * import { getAllCitationsFromLlmOutput } from '@deepcitation/deepcitation-js';
   *
   * const citations = getAllCitationsFromLlmOutput(llmResponse);
   * const verified = await dc.verifyCitations(fileId, citations);
   *
   * for (const [key, result] of Object.entries(verified.foundHighlights)) {
   *   console.log(key, result.searchState?.status);
   *   // "found", "partial_text_found", "not_found", etc.
   * }
   * ```
   */
  async verifyCitations(
    fileId: string,
    citations: CitationInput,
    options?: VerifyCitationsOptions
  ): Promise<VerifyCitationsResponse> {
    // Look up the internal IDs from our map
    const fileInfo = this.fileIdMap.get(fileId);

    if (!fileInfo) {
      throw new Error(
        `File ID "${fileId}" not found. Make sure to upload the file first with uploadFile().`
      );
    }

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
      throw new Error("Invalid citations format");
    }

    const response = await fetch(`${this.apiUrl}/verifyCitation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attachmentId: fileInfo.attachmentId,
          citations: citationMap,
          outputImageFormat: options?.outputImageFormat || "avif",
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error?.error?.message ||
          `Verification failed with status ${response.status}`
      );
    }

    return (await response.json()) as VerifyCitationsResponse;
  }

  /**
   * Verify citations from LLM output with automatic parsing.
   * This is the recommended way to verify citations for new integrations.
   *
   * @param input - Object containing llmOutput and optional fileDataParts
   * @returns Verification results with status and proof images
   *
   * @example
   * ```typescript
   * const result = await dc.verifyCitationsFromLlmOutput({
   *   llmOutput: response.content,
   *   fileDataParts, // From prepareFiles()
   * });
   *
   * for (const [key, result] of Object.entries(result.foundHighlights)) {
   *   console.log(key, result.searchState?.status);
   * }
   * ```
   */
  async verifyCitationsFromLlmOutput(
    input: VerifyCitationsFromLlmOutputInput,
    citations?: { [key: string]: Citation }
  ): Promise<VerifyCitationsResponse> {
    const { llmOutput, outputImageFormat = "avif" } = input;

    // Parse citations from LLM output
    if (!citations) citations = getAllCitationsFromLlmOutput(llmOutput);

    // If no citations found, return empty result
    if (Object.keys(citations).length === 0) {
      return { foundHighlights: {} };
    }

    // Note: fileDataParts is now only used to identify which files to verify
    // The mapping from fileId to attachmentId must be registered via uploadFile() or prepareFiles()
    // in the same session. For Zero Data Retention scenarios, use verifyCitations() directly.

    // Group citations by fileId and verify each group
    const citationsByFile = new Map<string, Record<string, Citation>>();

    for (const [key, citation] of Object.entries(citations)) {
      const fileId = citation.fileId || "";
      if (!citationsByFile.has(fileId)) {
        citationsByFile.set(fileId, {});
      }
      citationsByFile.get(fileId)![key] = citation;
    }

    // Verify citations for each file
    const allHighlights: VerifyCitationsResponse["foundHighlights"] = {};

    for (const [fileId, fileCitations] of citationsByFile) {
      // Check if we have the file registered
      const fileInfo = this.fileIdMap.get(fileId);
      if (!fileInfo) {
        // Skip citations for unregistered files
        continue;
      }

      const response = await fetch(`${this.apiUrl}/verifyCitation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            attachmentId: fileInfo.attachmentId,
            citations: fileCitations,
            outputImageFormat,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          error?.error?.message ||
            `Verification failed with status ${response.status}`
        );
      }

      const result = (await response.json()) as VerifyCitationsResponse;
      Object.assign(allHighlights, result.foundHighlights);
    }

    return { foundHighlights: allHighlights };
  }

  /**
   * Register a file that was uploaded separately (e.g., via direct API call).
   * This allows you to use verifyCitations with files not uploaded via uploadFile().
   *
   * @param fileId - Your file ID
   * @param attachmentId - The internal attachment ID
   */
  registerFile(fileId: string, attachmentId: string): void {
    this.fileIdMap.set(fileId, { attachmentId });
  }

  /**
   * Clear the internal file ID mapping.
   * Useful for cleanup or when working with many files.
   */
  clearFileMap(): void {
    this.fileIdMap.clear();
  }
}
