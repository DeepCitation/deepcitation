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
export type { FoundHighlightLocation } from "./foundHighlight.js";

export {
  NOT_FOUND_HIGHLIGHT_INDEX,
  PENDING_HIGHLIGHT_INDEX,
  BLANK_HIGHLIGHT_LOCATION,
  deterministicIdFromHighlightLocation,
} from "./foundHighlight.js";

// Search state types
export type { SearchState, SearchStatus } from "./search.js";

// Box/geometry types
export type { ScreenBox, PdfSpaceItem, IVertex } from "./boxes.js";
