/**
 * Type definitions for DeepCitation
 *
 * @packageDocumentation
 */

// Citation core types
export type {
  Citation,
  CitationStatus,
  VerifyCitationRequest,
  VerifyCitationResponse,
  OutputImageFormat,
} from "./citation.js";

export { DEFAULT_OUTPUT_IMAGE_FORMAT } from "./citation.js";

// Found highlight types
export type { Verification } from "./verification.js";

export {
  NOT_FOUND_VERIFICATION_INDEX,
  PENDING_VERIFICATION_INDEX,
  BLANK_VERIFICATION,
  deterministicIdFromVerification,
} from "./verification.js";

// Search state types
export type { SearchState, SearchStatus } from "./search.js";

// Box/geometry types
export type { ScreenBox, PdfSpaceItem, IVertex } from "./boxes.js";
