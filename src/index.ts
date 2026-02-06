/**
 * DeepCitation - Citation parsing, verification, and rendering library
 * @packageDocumentation
 */

export type {
  CitationInput,
  DeepCitationConfig,
  DeleteAttachmentResponse,
  ExpirationValue,
  ExtendExpirationDuration,
  ExtendExpirationOptions,
  ExtendExpirationResponse,
  FileDataPart,
  FileInput,
  PrepareFilesResult,
  UploadFileOptions,
  UploadFileResponse,
  UrlCacheInfo,
  UrlSourceInfo,
  VerifyCitationsOptions,
  VerifyCitationsResponse,
} from "./client/index.js";
// Client
export { DeepCitation } from "./client/index.js";
export type {
  CitationWithStatus,
  IndicatorSet,
  IndicatorStyle,
  LinePosition,
  MarkdownOutput,
  MarkdownVariant,
  RenderMarkdownOptions,
} from "./markdown/index.js";
// =============================================================================
// Markdown Output
// Static markdown rendering for citations (TUI, exported documents, etc.)
// Phase 2 will add hosted verification viewer with shareable links
// =============================================================================
export {
  getIndicator,
  getVerificationIndicator,
  humanizeLinePosition,
  INDICATOR_SETS,
  renderCitationsAsMarkdown,
  renderReferencesSection,
  SUPERSCRIPT_DIGITS,
  toMarkdown,
  toSuperscript,
} from "./markdown/index.js";
// Citation Parsing (deferred JSON pattern)
export {
  deferredCitationToCitation,
  extractVisibleText,
  getAllCitationsFromDeferredResponse,
  getCitationMarkerIds,
  hasDeferredCitations,
  parseDeferredCitationResponse,
  replaceDeferredMarkers,
} from "./parsing/citationParser.js";
export type { ReplaceCitationsOptions } from "./parsing/normalizeCitation.js";
export {
  getCitationPageNumber,
  getVerificationTextIndicator,
  normalizeCitations,
  removeLineIdMetadata,
  removePageNumberMetadata,
  replaceCitations,
} from "./parsing/normalizeCitation.js";
// Parsing
export {
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  groupCitationsByAttachmentId,
  groupCitationsByAttachmentIdObject,
  parseCitation,
} from "./parsing/parseCitation.js";
export {
  cleanRepeatingLastSentence,
  isGeminiGarbage,
} from "./parsing/parseWorkAround.js";
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
  wrapCitationPrompt,
  wrapSystemCitationPrompt,
} from "./prompts/citationPrompts.js";
export {
  compressPromptIds,
  decompressPromptIds,
} from "./prompts/promptCompression.js";
export type { CompressedResult } from "./prompts/types.js";
export {
  CITATION_X_PADDING,
  CITATION_Y_PADDING,
  generateCitationInstanceId,
  generateCitationKey,
  generateVerificationKey,
} from "./react/utils.js";
export type { DeepTextItem, IVertex, Page, ScreenBox } from "./types/boxes.js";
// Types
export type {
  Citation,
  // Record types (object dictionaries, NOT arrays)
  CitationRecord,
  CitationStatus,
  CitationType,
  OutputImageFormat,
  SourceMeta,
  // Source types for categorization
  SourceType,
  VerificationRecord,
  VerifyCitationRequest,
  VerifyCitationResponse,
} from "./types/citation.js";
export { DEFAULT_OUTPUT_IMAGE_FORMAT } from "./types/citation.js";
export type {
  SearchAttempt,
  SearchMethod,
  SearchStatus,
} from "./types/search.js";
export type {
  ContentMatchStatus,
  UrlAccessStatus,
  Verification,
} from "./types/verification.js";
export {
  BLANK_VERIFICATION,
  NOT_FOUND_VERIFICATION_INDEX,
  PENDING_VERIFICATION_INDEX,
} from "./types/verification.js";
// Utilities
export { sha1Hash } from "./utils/sha.js";
