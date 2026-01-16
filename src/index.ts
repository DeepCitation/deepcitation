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
  VerifyCitationsFromLlmOutput,
} from "./client/index.js";

// Parsing
export {
  parseCitation,
  getCitationStatus,
  getAllCitationsFromLlmOutput,
  groupCitationsByAttachmentId,
  groupCitationsByAttachmentIdObject,
} from "./parsing/parseCitation.js";
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
  CitationStatus,
  VerifyCitationRequest,
  VerifyCitationResponse,
  OutputImageFormat,
} from "./types/citation.js";

// Icons
export { DeepCitationIcon } from "./react/icons.js";

export { DEFAULT_OUTPUT_IMAGE_FORMAT } from "./types/citation.js";

export type { Verification } from "./types/verification.js";

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

export type { ScreenBox, PdfSpaceItem, IVertex } from "./types/boxes.js";

// Utilities
export { sha1Hash } from "./utils/sha.js";
export {
  generateCitationKey,
  generateVerificationKey,
  generateCitationInstanceId,
} from "./react/utils.js";
export { CITATION_X_PADDING, CITATION_Y_PADDING } from "./react/utils.js";

// Prompts
export {
  CITATION_JSON_OUTPUT_FORMAT,
  CITATION_MARKDOWN_SYNTAX_PROMPT,
  AV_CITATION_MARKDOWN_SYNTAX_PROMPT,
  CITATION_AV_BASED_JSON_OUTPUT_FORMAT,
  wrapSystemCitationPrompt,
  wrapCitationPrompt,
} from "./prompts/citationPrompts.js";

export type {
  WrapSystemPromptOptions,
  WrapCitationPromptOptions,
  WrapCitationPromptResult,
} from "./prompts/citationPrompts.js";

export {
  removeLineIdMetadata,
  removePageNumberMetadata,
  removeCitations,
} from "./parsing/normalizeCitation.js";

export {
  compressPromptIds,
  decompressPromptIds,
} from "./prompts/promptCompression.js";

export type { CompressedResult } from "./prompts/types.js";
