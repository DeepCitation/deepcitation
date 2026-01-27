/**
 * DeepCitation - Citation parsing, verification, and rendering library
 * @packageDocumentation
 */

// Client
export { DeepCitation } from "./client/index.js";
export type {
  DeepCitationConfig,
  UploadFileResponse,
  UploadFileOptions,
  VerifyCitationsResponse,
  VerifyCitationsOptions,
  CitationInput,
  FileInput,
  FileDataPart,
  PrepareFilesResult,
  verifyAll,
} from "./client/index.js";

// Parsing
export {
  parseCitation,
  getCitationStatus,
  getAllCitationsFromLlmOutput,
  groupCitationsByAttachmentId,
  groupCitationsByAttachmentIdObject,
} from "./parsing/parseCitation.js";

// Citation Parsing (deferred JSON pattern)
export {
  parseDeferredCitationResponse,
  getAllCitationsFromDeferredResponse,
  deferredCitationToCitation,
  hasDeferredCitations,
  extractVisibleText,
  replaceDeferredMarkers,
  getCitationMarkerIds,
} from "./parsing/citationParser.js";
export {
  normalizeCitations,
  getCitationPageNumber,
} from "./parsing/normalizeCitation.js";
export {
  isGeminiGarbage,
  cleanRepeatingLastSentence,
} from "./parsing/parseWorkAround.js";

// Types
export type {
  Citation,
  CitationType,
  CitationStatus,
  VerifyCitationRequest,
  VerifyCitationResponse,
  OutputImageFormat,
  // Source types for categorization
  SourceType,
  SourceMeta,
} from "./types/citation.js";

export { DEFAULT_OUTPUT_IMAGE_FORMAT } from "./types/citation.js";

export type {
  Verification,
  ContentMatchStatus,
  UrlAccessStatus,
} from "./types/verification.js";

export {
  NOT_FOUND_VERIFICATION_INDEX,
  PENDING_VERIFICATION_INDEX,
  BLANK_VERIFICATION,
} from "./types/verification.js";

export type {
  SearchStatus,
  SearchMethod,
  SearchAttempt,
} from "./types/search.js";

export type { ScreenBox, DeepTextItem, IVertex } from "./types/boxes.js";

// Utilities
export { sha1Hash } from "./utils/sha.js";
export {
  generateCitationKey,
  generateVerificationKey,
  generateCitationInstanceId,
} from "./react/utils.js";
export { CITATION_X_PADDING, CITATION_Y_PADDING } from "./react/utils.js";

export {
  CITATION_PROMPT,
  AV_CITATION_PROMPT,
  CITATION_REMINDER,
  CITATION_AV_REMINDER,
  CITATION_JSON_OUTPUT_FORMAT,
  CITATION_AV_JSON_OUTPUT_FORMAT,
  CITATION_DATA_START_DELIMITER,
  CITATION_DATA_END_DELIMITER,
  wrapSystemCitationPrompt,
  wrapCitationPrompt,
} from "./prompts/citationPrompts.js";

export type {
  WrapSystemPromptOptions,
  WrapCitationPromptOptions,
  WrapCitationPromptResult,
  CitationData,
  ParsedCitationResponse,
} from "./prompts/citationPrompts.js";

export {
  removeLineIdMetadata,
  removePageNumberMetadata,
  removeCitations,
  replaceCitations,
  getVerificationTextIndicator,
} from "./parsing/normalizeCitation.js";

export type { ReplaceCitationsOptions } from "./parsing/normalizeCitation.js";

export {
  compressPromptIds,
  decompressPromptIds,
} from "./prompts/promptCompression.js";

export type { CompressedResult } from "./prompts/types.js";
