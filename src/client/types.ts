import type { Citation, Verification } from "../types/index.js";

/**
 * Configuration options for the DeepCitation client
 */
export interface DeepCitationConfig {
  /** Your DeepCitation API key (starts with sk-dc-) */
  apiKey: string;
  /** Optional custom API base URL. Defaults to https://api.deepcitation.com */
  apiUrl?: string;
}

/**
 * Response from uploading a file for citation verification
 */
export interface UploadFileResponse {
  /** The file ID assigned by DeepCitation (custom or auto-generated) */
  fileId: string;
  /** The full text content formatted for LLM prompts with page markers and line IDs. Use this in your user prompts. */
  deepTextPromptPortion: string;
  /** Form fields extracted from PDF forms */
  formFields?: Array<{
    name: string;
    value?: string;
    pageIndex?: number;
    type?: string;
  }>;
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
}

/**
 * Options for file upload
 */
export interface UploadFileOptions {
  /** Optional custom file ID to use instead of auto-generated one */
  fileId?: string;
  /** Optional custom filename (uses File.name if not provided) */
  filename?: string;
}

/**
 * Response from verifying citations
 */
export interface VerifyCitationsResponse {
  /** Map of citation keys to their verification results */
  verifications: Record<string, Verification>;
}

/**
 * Options for citation verification
 */
export interface VerifyCitationsOptions {
  /** Output image format for verification screenshots */
  outputImageFormat?: "jpeg" | "png" | "avif";
}

/**
 * Simplified citation input for verification
 */
export type CitationInput = Citation | Record<string, Citation>;

/**
 * Input for file upload in prepareFiles
 */
export interface FileInput {
  /** The file content (File, Blob, or Buffer) */
  file: File | Blob | Buffer;
  /** Optional filename */
  filename?: string;
  /** Optional custom file ID */
  fileId?: string;
}

/**
 * File reference returned from prepareFiles
 */
export interface FileDataPart {
  /** The file ID assigned by DeepCitation */
  fileId: string;
  /** The formatted text content for LLM prompts (with page markers and line IDs) */
  deepTextPromptPortion: string;
  /** Optional filename for display purposes */
  filename?: string;
}

/**
 * Result from prepareFiles
 */
export interface PrepareFilesResult {
  /** Array of file references for verification (includes deepTextPromptPortion for each file) */
  fileDataParts: FileDataPart[];
  /**
   * Array of formatted text content for LLM prompts (with page markers and line IDs).
   * @deprecated Use fileDataParts[].deepTextPromptPortion instead for single source of truth.
   * This is kept for backwards compatibility but will be removed in a future version.
   */
  deepTextPromptPortion: string[];
}

/**
 * Input for verifyCitationsFromLlmOutput
 */
export interface VerifyCitationsFromLlmOutput {
  /** The LLM response containing citations */
  llmOutput: string;
  /** Optional file references (required for Zero Data Retention or after storage expires) */
  fileDataParts?: FileDataPart[];
  /** Output image format for verification screenshots */
  outputImageFormat?: "jpeg" | "png" | "avif";
}

/**
 * Input for convertFile - convert URL or Office file to PDF
 */
export interface ConvertFileInput {
  /** URL to convert to PDF (for web pages or direct PDF links) */
  url?: string;
  /** Office file to convert (doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp) */
  file?: File | Blob | Buffer;
  /** Optional custom filename for the converted PDF */
  filename?: string;
  /** Optional custom file ID */
  fileId?: string;
}

/**
 * Response from convertFile
 */
export interface ConvertFileResponse {
  /** The file ID assigned by DeepCitation. Pass this to prepareConvertedFile(). */
  fileId: string;
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
export interface PrepareConvertedFileOptions {
  /** The file ID from a previous convertFile call */
  fileId: string;
}
