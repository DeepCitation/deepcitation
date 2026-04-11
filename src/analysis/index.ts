/**
 * Search Analysis Module
 *
 * Pure-function module for transforming search/verification data into
 * display-ready structures. No React hooks — depends only on i18n types
 * and `defaultTranslator` from `src/react/i18n.ts` for string resolution.
 *
 * Primary entry point: `analyzeVerification(verification, t?)`
 * Escape hatch: `buildNarrativeFromParts(attempts, status, ...)`
 *
 * @packageDocumentation
 */

// Grouping (for advanced/direct usage)
export { type GroupedSearchAttempt, groupSearchAttempts, groupSearchAttemptsForNotFound } from "./grouping.js";
// Intent summary types & builder
export {
  buildIntentSummary,
  buildSearchSummary,
  deriveContextWindow,
  type IntentSummary,
  type MatchSnippet,
  type SearchOutcome,
  type SearchQueryGroup,
  type SearchSummary,
} from "./intent.js";
// Narrative types & builder
export {
  type AmendmentRow,
  buildSearchNarrative,
  type CollapsedFailureRow,
  deriveOutcome,
  type FailureRow,
  getStatusColorScheme,
  getStatusHeaderText,
  type NarrativeOutcome,
  type NarrativeRow,
  type SearchNarrative,
  type SuccessRow,
} from "./narrative.js";
// Main entry point
export {
  analyzeVerification,
  buildNarrativeFromParts,
  classifySearch,
  type VerificationAnalysis,
} from "./searchAnalysis.js";

// Status registry — single source of truth for SearchStatus → display mappings
export { STATUS_MAP, type StatusMapping } from "./statusRegistry.js";
// Variation labels
export { getVariationLabel } from "./variationLabels.js";
