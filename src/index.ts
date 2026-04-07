/**
 * DeepCitation - Citation parsing, verification, and rendering library
 *
 * Exports are organized by use case. See INTEGRATION.md "Quick Reference"
 * for recipe-based guidance on which functions to use.
 *
 * - Core API: DeepCitation client, getAllCitationsFromLlmOutput, stripCitations, getCitationKey
 * - Display Helpers: replaceCitationMarkers, extractVisibleText, parseCitationResponse
 * - Prompts: wrapCitationPrompt, wrapSystemCitationPrompt, format constants
 * - Advanced: groupCitationsBy*, field normalization, LLM workarounds
 *
 * @packageDocumentation
 */

// Client & Errors
export { DeepCitation, SDK_VERSION } from "./client/DeepCitation.js";
export {
  AuthenticationError,
  DeepCitationError,
  NetworkError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "./client/errors.js";
export type {
  AttachmentResponse,
  CitationInput,
  ConvertedPdfDownloadPolicy,
  DeepCitationConfig,
  DeepCitationLogger,
  DeleteAttachmentResponse,
  ExtendExpirationDuration,
  ExtendExpirationOptions,
  ExtendExpirationResponse,
  FileInput,
  GetAttachmentOptions,
  PrepareAttachmentsResult,
  PreparedAttachment,
  UploadFileOptions,
  UploadFileResponse,
  UrlCacheInfo,
  UrlSource,
  VerifyBatchOptions,
  VerifyCitationsOptions,
  VerifyCitationsResponse,
  VerifyInput,
} from "./client/index.js";

// Formatting utilities
export type {
  CitationWithStatus,
  IndicatorSet,
  IndicatorStyle,
  LinePosition,
  MarkdownVariant,
} from "./formatting/index.js";
export {
  getIndicator,
  humanizeLinePosition,
  INDICATOR_SETS,
  SUPERSCRIPT_DIGITS,
  toSuperscript,
} from "./formatting/index.js";

// Citation parsing — core API + display helpers
export {
  citationDataToCitation,
  extractCitationsFromMarkers,
  extractVisibleText,
  getCitationMarkerIds,
  hasCitationData,
  parseCitationData,
  replaceCitationMarkers,
  stripCitations,
} from "./parsing/citationParser.js";

export {
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  groupCitationsByAttachmentId,
  groupCitationsByAttachmentIdObject,
  normalizeCitationType,
} from "./parsing/parseCitation.js";
export type { ParsedCitationResult } from "./parsing/parseCitationResponse.js";
export { parseCitationResponse } from "./parsing/parseCitationResponse.js";

export {
  cleanRepeatingLastSentence,
  isGeminiGarbage,
} from "./parsing/parseWorkAround.js";

// Prompts
export type {
  CitationData,
  ParsedCitationResponse,
  WrapCitationPromptOptions,
  WrapCitationPromptResult,
  WrapSystemPromptOptions,
} from "./prompts/citationPrompts.js";
export {
  AV_CITATION_PROMPT,
  CITATION_AV_JSON_OUTPUT_FORMAT,
  CITATION_AV_REMINDER,
  CITATION_DATA_END_DELIMITER,
  CITATION_DATA_START_DELIMITER,
  CITATION_JSON_OUTPUT_FORMAT,
  CITATION_PROMPT,
  CITATION_REMINDER,
  COMPACT_CITATION_JSON_OUTPUT_FORMAT,
  COMPACT_CITATION_PROMPT,
  COMPACT_CITATION_SCENARIO2_PROMPT,
  wrapCitationPrompt,
  wrapSystemCitationPrompt,
} from "./prompts/citationPrompts.js";
export {
  type CompressedResult,
  compressPromptIds,
  decompressPromptIds,
} from "./prompts/promptCompression.js";

// React utilities
export {
  CITATION_X_PADDING,
  CITATION_Y_PADDING,
  generateCitationInstanceId,
} from "./react/utils.js";
// Rendering port (prepare-once, render-many pattern)
export {
  type CitationAdapter,
  type CitationIR,
  type PrepareCitationsOptions,
  prepareCitations,
  type ResolvedCitation,
} from "./rendering/prepareCitations.js";

// Types
export type { DeepTextItem, ScreenBox } from "./types/boxes.js";
export type {
  AudioVideoCitation,
  BatchVerifyCitationRequest,
  Citation,
  // Record types (object dictionaries, NOT arrays)
  CitationRecord,
  CitationStatus,
  CitationType,
  DocumentCitation,
  ImageFormat,
  // Source types for categorization
  SourceType,
  UrlCitation,
  VerificationRecord,
  VerifyCitationRequest,
  VerifyCitationResponse,
} from "./types/citation.js";
export {
  DEFAULT_OUTPUT_IMAGE_FORMAT,
  isAudioVideoCitation,
  isDocumentCitation,
  isUrlCitation,
} from "./types/citation.js";
export type {
  SearchAttempt,
  SearchMethod,
  SearchStatus,
} from "./types/search.js";
export type {
  CitationTimingEvent,
  TimingMetrics,
} from "./types/timing.js";
export type {
  AttachmentAssets,
  ContentMatchStatus,
  DocumentVerificationResult,
  DownloadLink,
  EvidenceImage,
  FileDownload,
  PageImage,
  PageImagesStatus,
  RenderScale,
  UrlAccessStatus,
  UrlVerificationResult,
  Verification,
} from "./types/verification.js";

// Utilities
export { getCitationKey, getVerificationKey } from "./utils/citationKey.js";
export {
  getFieldAliases,
  normalizeCitationFields,
  resolveField,
  resolveFieldName,
} from "./utils/fieldAliases.js";
export {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_FILE_SIZE,
  validateFileMagicBytes,
  validateUploadFile,
} from "./utils/fileSafety.js";
export {
  createLogEntry,
  sanitizeForLog,
  sanitizeJsonForLog,
} from "./utils/logSafety.js";
export {
  createSafeObject,
  isSafeKey,
  safeAssign,
  safeAssignBulk,
  safeMerge,
  setObjectSafetyWarning,
} from "./utils/objectSafety.js";
export {
  MAX_REGEX_INPUT_LENGTH,
  safeExec,
  safeMatch,
  safeReplace,
  safeReplaceAll,
  safeSearch,
  safeSplit,
  safeTest,
  validateRegexInput,
} from "./utils/regexSafety.js";
export { sha1Hash } from "./utils/sha.js";
export {
  getCitationPageNumber,
  removeLineIdMetadata,
  removePageNumberMetadata,
} from "./utils/textCleanup.js";
export {
  detectSourceType,
  extractDomain,
  isApprovedDomain,
  isDomainMatch,
  isSafeDomain,
} from "./utils/urlSafety.js";
export { getVerificationTextIndicator } from "./utils/verificationIndicator.js";
