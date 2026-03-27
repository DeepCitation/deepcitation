/**
 * Markdown output module for DeepCitation.
 *
 * Converts LLM responses with numeric citation markers into clean, readable markdown
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
  getIndicator,
  humanizeLinePosition,
  toSuperscript,
} from "./markdownVariants.js";

// Types
export type {
  CitationWithStatus,
  IndicatorSet,
  IndicatorStyle,
  LinePosition,
  MarkdownVariant,
} from "./types.js";

// Constants
export { INDICATOR_SETS, SUPERSCRIPT_DIGITS } from "./types.js";
