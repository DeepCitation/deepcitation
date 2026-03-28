/**
 * Shared citation indicator and formatting utilities.
 *
 * @packageDocumentation
 */

// Variant and indicator utilities
export {
  formatPageLocation,
  getIndicator,
  humanizeLinePosition,
  toSuperscript,
} from "./indicators.js";

// Types
export type {
  CitationWithStatus,
  IndicatorSet,
  IndicatorStyle,
  LinePosition,
  MarkdownVariant,
  RenderMarkdownOptions,
} from "./types.js";

// Constants
export { INDICATOR_SETS, SUPERSCRIPT_DIGITS } from "./types.js";
