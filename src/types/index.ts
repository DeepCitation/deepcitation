/**
 * Type definitions for DeepCitation
 *
 * @packageDocumentation
 */

// Box/geometry types
export type { CitationPage, DeepTextItem, IVertex, ScreenBox } from "./boxes.js";
// Citation core types
export type {
  Citation,
  CitationBase,
  CitationStatus,
  DocumentCitation,
  OutputImageFormat,
  UrlCitation,
  VerifyCitationRequest,
  VerifyCitationResponse,
} from "./citation.js";
export { DEFAULT_OUTPUT_IMAGE_FORMAT } from "./citation.js";
// Search status types
export type {
  MatchedVariation,
  SearchAttempt,
  SearchMethod,
  SearchStatus,
} from "./search.js";
// Found highlight types
export type {
  DocumentVerificationResult,
  UrlVerificationResult,
  Verification,
  VerificationPage,
  VerificationProof,
} from "./verification.js";
export {
  BLANK_VERIFICATION,
  NOT_FOUND_VERIFICATION_INDEX,
  PENDING_VERIFICATION_INDEX,
} from "./verification.js";
