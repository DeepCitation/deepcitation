/**
 * Type definitions for DeepCitation
 *
 * @packageDocumentation
 */

// Box/geometry types
export type { DeepTextItem, ScreenBox } from "./boxes.js";
// Citation core types
export type {
  AudioVideoCitation,
  Citation,
  CitationRecord,
  CitationStatus,
  CitationType,
  DocumentCitation,
  ImageFormat,
  SourceType,
  UrlCitation,
  VerificationRecord,
  VerifyCitationRequest,
  VerifyCitationResponse,
} from "./citation.js";
export { DEFAULT_OUTPUT_IMAGE_FORMAT, isAudioVideoCitation, isDocumentCitation, isUrlCitation } from "./citation.js";
// Search status types
export type {
  MatchedVariation,
  SearchAttempt,
  SearchMethod,
  SearchStatus,
  VariationType,
} from "./search.js";
// Timing types
export type {
  CitationTimingEvent,
  TimingMetrics,
} from "./timing.js";
// Verification types
export type {
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
} from "./verification.js";
