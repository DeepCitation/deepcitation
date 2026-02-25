/**
 * Markdown output module for DeepCitation.
 *
 * Converts LLM responses with <cite /> tags into clean, readable markdown
 * with verification status indicators.
 *
 * @example Basic usage
 * ```typescript
 * import { toMarkdown, renderCitationsAsMarkdown } from "deepcitation/markdown";
 *
 * // Simple string output
 * const md = toMarkdown(llmOutput, { verifications, variant: "brackets" });
 *
 * // Structured output with metadata
 * const { markdown, references, citations } = renderCitationsAsMarkdown(llmOutput, {
 *   verifications,
 *   variant: "footnote",
 *   includeReferences: true,
 * });
 * ```
 *
 * @packageDocumentation
 */

// Variant and indicator utilities
export {
  formatPageLocation,
  getCitationDisplayText,
  getIndicator,
  humanizeLinePosition,
  renderCitationVariant,
  renderReferenceEntry,
  renderReferencesSection,
  toSuperscript,
} from "./markdownVariants.js";
// Main rendering functions
export {
  getVerificationIndicator,
  renderCitationsAsMarkdown,
  toMarkdown,
} from "./renderMarkdown.js";

// Types
export type {
  CitationWithStatus,
  IndicatorSet,
  IndicatorStyle,
  LinePosition,
  MarkdownOutput,
  MarkdownVariant,
  RenderMarkdownOptions,
} from "./types.js";

// Constants
export { INDICATOR_SETS, SUPERSCRIPT_DIGITS } from "./types.js";
