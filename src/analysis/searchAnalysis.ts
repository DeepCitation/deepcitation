/**
 * Search Analysis — the primary entry point for the analysis module.
 *
 * `analyzeVerification` is the main API. It takes a Verification object
 * and returns a lazy accessor — sub-results (narrative, intent, summary)
 * are computed on first access and cached.
 *
 * `buildNarrativeFromParts` is an escape hatch for callers that receive
 * destructured props (e.g. VerificationLog) instead of a full Verification.
 *
 * @packageDocumentation
 */

import { defaultTranslator, type TranslateFunction } from "../react/i18n.js";
import { isDocumentCitation } from "../types/citation.js";
import type { SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { buildIntentSummary, buildSearchSummary, type IntentSummary, type SearchSummary } from "./intent.js";
import {
  buildSearchNarrative,
  deriveOutcome,
  getStatusColorScheme,
  getStatusHeaderText,
  type NarrativeOutcome,
  type SearchNarrative,
} from "./narrative.js";

// =============================================================================
// TYPES
// =============================================================================

export interface VerificationAnalysis {
  /** Coarse outcome: exact_match | partial_match | not_found | pending */
  readonly outcome: NarrativeOutcome;
  /** Semantic color: green | amber | red | gray */
  readonly colorScheme: "green" | "amber" | "red" | "gray";
  /** Pre-translated status label */
  readonly statusLabel: string;

  /** Timeline narrative — computed lazily on first access */
  readonly narrative: SearchNarrative;
  /** Intent summary with snippets — computed lazily, null when no fullPhrase */
  readonly intent: IntentSummary | null;
  /** Query-group analytics — computed lazily */
  readonly summary: SearchSummary;
}

// =============================================================================
// PRIMARY ENTRY POINT
// =============================================================================

/**
 * Analyze a verification result. Returns a lazy accessor — sub-results
 * are computed on first access and cached.
 *
 * Pure function — no side effects, no React dependencies.
 *
 * @param verification - The verification result to analyze (null/undefined safe)
 * @param t - Translation function. Defaults to English.
 */
export function analyzeVerification(
  verification: Verification | null | undefined,
  t: TranslateFunction = defaultTranslator,
): VerificationAnalysis {
  const status = verification?.status;
  const attempts = verification?.searchAttempts ?? [];
  const outcome = deriveOutcome(status);
  const colorScheme = getStatusColorScheme(status);
  const statusLabel = getStatusHeaderText(status, t);

  let _narrative: SearchNarrative | undefined;
  let _intent: IntentSummary | null | undefined;
  let _summary: SearchSummary | undefined;

  return {
    outcome,
    colorScheme,
    statusLabel,
    get narrative() {
      if (!_narrative) {
        const citation = verification?.citation;
        const expectedPage = citation && isDocumentCitation(citation) ? (citation.pageNumber ?? undefined) : undefined;
        const lineIds = citation && isDocumentCitation(citation) ? citation.lineIds : undefined;
        const expectedLine = Array.isArray(lineIds) ? lineIds[0] : lineIds;
        _narrative = buildSearchNarrative(attempts, status, expectedPage, expectedLine, t);
      }
      return _narrative;
    },
    get intent() {
      if (_intent === undefined) {
        _intent = buildIntentSummary(verification, attempts);
      }
      return _intent;
    },
    get summary() {
      if (!_summary) {
        _summary = buildSearchSummary(attempts, verification, t);
      }
      return _summary;
    },
  };
}

// =============================================================================
// ESCAPE HATCH
// =============================================================================

/**
 * Build a narrative from raw parts when you don't have a full Verification.
 *
 * Use this when you receive destructured props (e.g. VerificationLog
 * receives `searchAttempts`, `status`, `expectedPage`, `expectedLine` separately).
 */
export { buildSearchNarrative as buildNarrativeFromParts } from "./narrative.js";

// =============================================================================
// STANDALONE HELPERS
// =============================================================================

/**
 * Lightweight classification without building any formatted output.
 * Useful for conditional branching on verification outcome.
 */
export function classifySearch(status: SearchStatus | null | undefined): {
  outcome: NarrativeOutcome;
  colorScheme: "green" | "amber" | "red" | "gray";
} {
  return {
    outcome: deriveOutcome(status),
    colorScheme: getStatusColorScheme(status),
  };
}
