import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";
import { generateCitationKey } from "../react/utils.js";
import type { Citation } from "../types/index.js";
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
  VerifyCitationsFromLlmOutput,
  VerifyCitationsOptions,
  VerifyCitationsResponse,
} from "./types.js";

const DEFAULT_API_URL = "https://api.deepcitation.com";

/** Convert File/Blob/Buffer to a Blob suitable for FormData */
function toBlob(
  file: File | Blob | Buffer,
  filename?: string
): { blob: Blob; name: string } {
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
  throw new Error("Invalid file type. Expected File, Blob, or Buffer.");
}

/** Extract error message from API response */
async function extractErrorMessage(
  response: Response,
  fallbackAction: string
): Promise<string> {
  const error = await response.json().catch(() => ({}));
  return (
    error?.error?.message ||
    `${fallbackAction} failed with status ${response.status}`
  );
}

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
    const { blob, name } = toBlob(file, options?.filename);
    const formData = new FormData();
    formData.append("file", blob, name);

    if (options?.fileId) formData.append("fileId", options.fileId);
    if (options?.filename) formData.append("filename", options.filename);

    const response = await fetch(`${this.apiUrl}/prepareFile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Upload"));
    }

    return (await response.json()) as UploadFileResponse;
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
    const inputObj: ConvertFileInput =
      typeof input === "string" ? { url: input } : input;
    const { url, file, filename, fileId } = inputObj;

    if (!url && !file) {
      throw new Error("Either url or file must be provided");
    }

    let response: Response;

    if (url) {
      response = await fetch(`${this.apiUrl}/convertFile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, filename, fileId }),
      });
    } else {
      const { blob, name } = toBlob(file!, filename);
      const formData = new FormData();
      formData.append("file", blob, name);
      if (fileId) formData.append("fileId", fileId);
      if (filename) formData.append("filename", filename);

      response = await fetch(`${this.apiUrl}/convertFile`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
      });
    }

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Conversion"));
    }

    return (await response.json()) as ConvertFileResponse;
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
    const response = await fetch(`${this.apiUrl}/prepareFile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileId: options.fileId,
      }),
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Prepare"));
    }

    return (await response.json()) as UploadFileResponse;
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
      this.uploadFile(file, { filename, fileId }).then((result) => ({
        result,
        filename,
      }))
    );

    const uploadResults = await Promise.all(uploadPromises);

    // Extract file data parts with deepTextPromptPortion included (single source of truth)
    const fileDataParts: FileDataPart[] = uploadResults.map(
      ({ result, filename }) => ({
        fileId: result.fileId,
        deepTextPromptPortion: result.deepTextPromptPortion,
        filename: filename || result.metadata?.filename,
      })
    );

    // Also return separate array for backwards compatibility (deprecated)
    const deepTextPromptPortion: string[] = fileDataParts.map(
      (part) => part.deepTextPromptPortion
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
   * for (const [key, result] of Object.entries(verified.verifications)) {
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

    const requestUrl = `${this.apiUrl}/verifyCitations`;
    const requestBody = {
      data: {
        fileId,
        citations: citationMap,
        outputImageFormat: options?.outputImageFormat || "avif",
      },
    };

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "Verification"));
    }

    const result = (await response.json()) as VerifyCitationsResponse;
    return result;
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
   * for (const [key, result] of Object.entries(result.verifications)) {
   *   console.log(key, result.searchState?.status);
   * }
   * ```
   */
  async verifyCitationsFromLlmOutput(
    input: VerifyCitationsFromLlmOutput,
    citations?: { [key: string]: Citation }
  ): Promise<VerifyCitationsResponse> {
    const { llmOutput, outputImageFormat = "avif" } = input;

    // Parse citations from LLM output
    if (!citations) citations = getAllCitationsFromLlmOutput(llmOutput);

    // If no citations found, return empty result
    if (Object.keys(citations).length === 0) {
      return { verifications: {} };
    }

    // Group citations by fileId
    const citationsByFile = new Map<string, Record<string, Citation>>();
    for (const [key, citation] of Object.entries(citations)) {
      const fileId = citation.fileId || "";
      if (!citationsByFile.has(fileId)) {
        citationsByFile.set(fileId, {});
      }
      citationsByFile.get(fileId)![key] = citation;
    }

    // Verify all files in parallel
    const verificationPromises: Promise<VerifyCitationsResponse>[] = [];
    for (const [fileId, fileCitations] of citationsByFile) {
      if (fileId) {
        verificationPromises.push(
          this.verifyCitations(fileId, fileCitations, { outputImageFormat })
        );
      }
    }

    const results = await Promise.all(verificationPromises);
    const allHighlights: VerifyCitationsResponse["verifications"] = {};
    for (const result of results) {
      Object.assign(allHighlights, result.verifications);
    }

    return { verifications: allHighlights };
  }
}
