/**
 * Markdown output module for DeepCitation.
 *
 * Converts LLM responses with <cite /> tags into clean, readable markdown
 * with verification status indicators.
 *
 * @example Basic usage
 * ```typescript
 * import { toMarkdown, renderCitationsAsMarkdown } from "@deepcitation/deepcitation-js/markdown";
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

// Main rendering functions
export {
  renderCitationsAsMarkdown,
  toMarkdown,
  getVerificationIndicator,
} from "./renderMarkdown.js";

// Variant and indicator utilities
export {
  getIndicator,
  toSuperscript,
  humanizeLinePosition,
  getCitationDisplayText,
  formatPageLocation,
  renderCitationVariant,
  renderReferenceEntry,
  renderReferencesSection,
} from "./markdownVariants.js";

// Types
export type {
  MarkdownVariant,
  IndicatorStyle,
  LinePosition,
  RenderMarkdownOptions,
  MarkdownOutput,
  CitationWithStatus,
  IndicatorSet,
} from "./types.js";

// Constants
export { INDICATOR_SETS, SUPERSCRIPT_DIGITS } from "./types.js";
