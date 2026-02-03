import type { Citation, Verification } from "../types/index.js";

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
}

/**
 * Response from uploading a file for citation verification
 */
export interface UploadFileResponse {
  /** The attachment ID assigned by DeepCitation (custom or auto-generated) */
  attachmentId: string;
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
  /** Optional expiration date for the attachment (ISO 8601 string). If "never", the attachment does not expire (enterprise). */
  expiresAt?: string | "never";
}

/**
 * Options for file upload
 */
export interface UploadFileOptions {
  /** Optional custom attachment ID to use instead of auto-generated one */
  attachmentId?: string;
  /** Optional custom filename (uses File.name if not provided) */
  filename?: string;
}

/**
 * Options for preparing a URL for citation verification.
 * URLs and Office files take ~30s to process vs. <1s for images/PDFs.
 */
export interface PrepareUrlOptions {
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
  /** Optional custom attachment ID */
  attachmentId?: string;
}

/**
 * File reference returned from prepareFiles
 */
export interface FileDataPart {
  /** The attachment ID assigned by DeepCitation */
  attachmentId: string;
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
}

/**
 * Input for verify method
 */
export interface VerifyInput {
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
export interface PrepareConvertedFileOptions {
  /** The attachment ID from a previous convertFile call */
  attachmentId: string;
}

/**
 * Expiration value for attachments and pages.
 * - ISO 8601 date string (e.g., "2025-12-31T23:59:59Z"): expires at this date
 * - "never": does not expire (enterprise feature)
 */
export type ExpirationValue = string | "never";

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
  /** The new expiration date (ISO 8601 string), or "never" for enterprise attachments that don't expire */
  expiresAt: string | "never";
  /** The previous expiration date (ISO 8601 string), "never", or undefined if not previously set */
  previousExpiresAt?: string | "never";
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
