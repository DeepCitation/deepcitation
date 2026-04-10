import { defaultTranslator, type MessageKey, type TranslateFunction } from "../react/i18n.js";
import type { DeepTextItem } from "../types/boxes.js";
import { isDocumentCitation } from "../types/citation.js";
import type { MatchedVariation, SearchAttempt, SearchMethod } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { normalizeQuotes } from "../utils/normalizeQuotes.js";
import { getVariationLabel } from "./variationLabels.js";

// =============================================================================
// INTENT-CENTRIC TYPES
// =============================================================================

/** High-level outcome from the user's perspective. */
export type SearchOutcome = "exact_match" | "not_found" | "related_found";

/**
 * A snippet of matched text with surrounding context.
 * Used to show the user what was actually found in the document
 * and how it relates to their claim.
 */
export interface MatchSnippet {
  /** The text that was actually matched in the document */
  matchedText: string;
  /** ~10 words surrounding the match, or just matchedText if no context available */
  contextText: string;
  /** Char index where matchedText starts within contextText */
  matchStart: number;
  /** Char index where matchedText ends within contextText */
  matchEnd: number;
  /** Page where the match was found */
  page?: number;
  /** Whether this match is near the expected location (proximate) vs. elsewhere (distal) */
  isProximate: boolean;
  /** Which variation of the text matched */
  matchedVariation?: MatchedVariation;
}

/**
 * Intent-centric summary of what the user claimed and what was found.
 * Transforms audit-log search attempts into a user-facing summary.
 */
export interface IntentSummary {
  /** High-level outcome */
  outcome: SearchOutcome;
  /** What the LLM claimed — the sourceContext from the citation */
  sourceContext: string;
  /** The anchor text (key span) if available */
  sourceMatch?: string;
  /** Which page the citation claimed to be on */
  expectedPage?: number;
  /** Matched snippets with context — only populated for "related_found" outcome */
  snippets: MatchSnippet[];
  /** Total search attempts performed (metadata only, not prominently displayed) */
  totalAttempts: number;
}

// =============================================================================
// PROXIMATE vs DISTAL CLASSIFICATION
// =============================================================================

/**
 * Methods that search near the expected location.
 * Matches found via these methods suggest text reformatting or minor changes.
 */
const PROXIMATE_METHODS: ReadonlySet<SearchMethod> = new Set([
  "exact_line_match",
  "line_with_buffer",
  "expanded_line_buffer",
  "current_page",
]);

/** Check if a search method indicates the match was found near the expected location. */
function isProximateMethod(method: SearchMethod): boolean {
  return PROXIMATE_METHODS.has(method);
}

// =============================================================================
// CONTEXT WINDOW DERIVATION
// =============================================================================

/** Maximum input size for context derivation (100KB safety limit). */
const MAX_TEXT_ITEMS_LENGTH = 100_000;

/** Number of words to include before and after the match. */
const CONTEXT_WORD_COUNT = 5;

/** Pre-computed page text for repeated context lookups. */
interface PreparedPageText {
  fullText: string;
  lowerFull: string;
}

/**
 * Concatenate and lowercase page textItems once, for reuse across multiple
 * `findContextWindow` calls with different matchedText values.
 */
function preparePageText(textItems: DeepTextItem[] | undefined): PreparedPageText | null {
  if (!textItems || textItems.length === 0) return null;

  // Pre-check total length before concatenating to avoid unnecessary work
  let estimatedLen = 0;
  for (const item of textItems) {
    estimatedLen += (item.text?.length ?? 0) + 1;
    if (estimatedLen > MAX_TEXT_ITEMS_LENGTH) return null;
  }

  const parts: string[] = [];
  for (const item of textItems) {
    if (item.text) parts.push(item.text);
  }
  const fullText = parts.join(" ");
  if (fullText.length === 0) return null;

  return { fullText, lowerFull: fullText.toLowerCase() };
}

/**
 * Find a context window around matchedText within pre-computed page text.
 * Expands to ~5 words before and after the match.
 */
function findContextWindow(
  matchedText: string,
  prepared: PreparedPageText | null,
): { contextText: string; matchStart: number; matchEnd: number } | null {
  if (!prepared || !matchedText) return null;

  const { fullText, lowerFull } = prepared;
  const idx = normalizeQuotes(lowerFull).indexOf(normalizeQuotes(matchedText.toLowerCase()));
  if (idx === -1) return null;

  // idx comes from the lowercase search but matchedText.length is identical
  // in both casings, so slicing fullText at [idx..matchEnd] preserves original casing.
  const matchEnd = idx + matchedText.length;

  // Expand to word boundaries: ~CONTEXT_WORD_COUNT words before and after
  let contextStart = idx;
  let wordsFound = 0;
  while (contextStart > 0 && wordsFound < CONTEXT_WORD_COUNT) {
    contextStart--;
    if (fullText[contextStart] === " ") wordsFound++;
  }
  if (contextStart > 0) contextStart++;

  let contextEnd = matchEnd;
  wordsFound = 0;
  while (contextEnd < fullText.length && wordsFound < CONTEXT_WORD_COUNT) {
    if (fullText[contextEnd] === " ") wordsFound++;
    contextEnd++;
  }

  const contextText = fullText.slice(contextStart, contextEnd);
  return {
    contextText,
    matchStart: idx - contextStart,
    matchEnd: matchEnd - contextStart,
  };
}

/**
 * Derive a context window around matchedText using page textItems.
 * Convenience wrapper that prepares text and finds context in one call.
 *
 * @returns Context object with indices, or null if textItems unavailable or match not found.
 */
export function deriveContextWindow(
  matchedText: string,
  textItems: DeepTextItem[] | undefined,
): { contextText: string; matchStart: number; matchEnd: number } | null {
  return findContextWindow(matchedText, preparePageText(textItems));
}

// =============================================================================
// INTENT SUMMARY BUILDER
// =============================================================================

/**
 * Build an intent-centric summary from verification data.
 * Transforms the raw search attempt log into a user-facing summary
 * focused on: what was claimed, and was it found?
 */
export function buildIntentSummary(
  verification: Verification | null | undefined,
  searchAttempts: SearchAttempt[],
): IntentSummary | null {
  const sourceContext = verification?.citation?.sourceContext;
  if (!sourceContext) return null;

  const sourceMatch = verification?.citation?.sourceMatch?.toString();
  const expectedPage =
    verification?.citation && isDocumentCitation(verification.citation)
      ? (verification.citation.pageNumber ?? undefined)
      : undefined;
  const status = verification?.status;
  const totalAttempts = searchAttempts.length;

  // Determine outcome
  if (status === "not_found") {
    return {
      outcome: "not_found",
      sourceContext,
      sourceMatch,
      expectedPage,
      snippets: [],
      totalAttempts,
    };
  }

  // Check if we have an exact/normalized full phrase match → exact_match
  const successfulAttempt = searchAttempts.find(a => a.success);
  if (
    successfulAttempt?.matchedVariation === "exact_source_context" ||
    successfulAttempt?.matchedVariation === "normalized_source_context"
  ) {
    return {
      outcome: "exact_match",
      sourceContext,
      sourceMatch,
      expectedPage,
      snippets: [],
      totalAttempts,
    };
  }

  // For found status without displacement → exact_match
  if (status === "found" || status === "found_context_missed_source_match") {
    return {
      outcome: "exact_match",
      sourceContext,
      sourceMatch,
      expectedPage,
      snippets: [],
      totalAttempts,
    };
  }

  // Everything else is "related_found" — build snippets from successful partial attempts
  const snippets: MatchSnippet[] = [];

  // Find the match page's textItems for context expansion — prepare once for all snippets
  const matchPage = verification?.document?.verifiedPageNumber;
  const pageTextItems = findPageTextItems(verification, matchPage);
  const preparedText = preparePageText(pageTextItems);

  const seen = new Set<string>();
  for (const attempt of searchAttempts) {
    if (!attempt.success || !attempt.matchedText) continue;
    const page = attempt.foundLocation?.page ?? attempt.pageSearched;
    const dedupKey = `${attempt.matchedText}\0${page ?? ""}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const isProximate =
      isProximateMethod(attempt.method) &&
      (!attempt.expectedLocation ||
        !attempt.foundLocation ||
        attempt.expectedLocation.page === attempt.foundLocation.page);

    // Try to derive context from pre-computed page text
    const context = findContextWindow(attempt.matchedText, preparedText);

    if (context) {
      snippets.push({
        matchedText: attempt.matchedText,
        contextText: context.contextText,
        matchStart: context.matchStart,
        matchEnd: context.matchEnd,
        page: attempt.foundLocation?.page ?? attempt.pageSearched,
        isProximate,
        matchedVariation: attempt.matchedVariation,
      });
    } else {
      // Fallback: use matchedText as both match and context
      snippets.push({
        matchedText: attempt.matchedText,
        contextText: attempt.matchedText,
        matchStart: 0,
        matchEnd: attempt.matchedText.length,
        page: attempt.foundLocation?.page ?? attempt.pageSearched,
        isProximate,
        matchedVariation: attempt.matchedVariation,
      });
    }
  }

  // Also pull from verification-level matched text if no successful attempts produced snippets
  if (snippets.length === 0 && verification?.sourceSnippet) {
    const context = findContextWindow(verification.sourceSnippet, preparedText);
    snippets.push({
      matchedText: verification.sourceSnippet,
      contextText: context?.contextText ?? verification.sourceSnippet,
      matchStart: context?.matchStart ?? 0,
      matchEnd: context?.matchEnd ?? verification.sourceSnippet.length,
      page: matchPage && matchPage > 0 ? matchPage : undefined,
      isProximate: true, // verification-level match is presumed proximate
    });
  }

  return {
    outcome: "related_found",
    sourceContext,
    sourceMatch,
    expectedPage,
    snippets,
    totalAttempts,
  };
}

/**
 * Find textItems for a specific page from verification.document.textItems.
 * Returns undefined if no textItems are available.
 */
function findPageTextItems(
  verification: Verification | null | undefined,
  pageNumber: number | null | undefined,
): DeepTextItem[] | undefined {
  if (!pageNumber || !verification?.document?.textItems) return undefined;
  return verification.document.textItems;
}

export interface SearchQueryGroup {
  searchPhrase: string;
  phraseType: "source_context" | "source_match" | "fragment";
  phraseLabel: string;
  methodsTried: SearchMethod[];
  locations: {
    pages: number[];
    includesDocScan: boolean;
  };
  anySuccess: boolean;
  variationTypeLabel: string | null;
  rejectedMatches: Array<{ text: string; occurrences?: number }>;
  attemptCount: number;
}

export interface SearchSummary {
  totalAttempts: number;
  queryGroups: SearchQueryGroup[];
  distinctQueries: number;
  includesFullDocScan: boolean;
  closestMatch?: { text: string; page?: number };
}

/** Map searchPhraseType + method to a phrase type category. */
function derivePhraseType(attempt: SearchAttempt): SearchQueryGroup["phraseType"] {
  if (attempt.searchPhraseType === "source_match") return "source_match";
  if (attempt.searchPhraseType === "source_context") return "source_context";
  // Infer from method name for fragment fallbacks
  const method = attempt.method;
  if (
    method === "first_half_fallback" ||
    method === "last_half_fallback" ||
    method === "first_quarter_fallback" ||
    method === "second_quarter_fallback" ||
    method === "third_quarter_fallback" ||
    method === "fourth_quarter_fallback" ||
    method === "first_word_fallback" ||
    method === "longest_word_fallback"
  ) {
    return "fragment";
  }
  if (method === "source_match_fallback" || method === "keyspan_fallback") return "source_match";
  return "source_context";
}

/** Human-readable label for the phrase type. */
function derivePhraseLabel(attempt: SearchAttempt, t: TranslateFunction): string {
  if (attempt.searchPhraseType === "source_match") return t("searchPhrase.sourceMatch");
  if (attempt.searchPhraseType === "source_context") return t("searchPhrase.sourceContext");
  // Infer from method for fragments
  const keyMap: Partial<Record<SearchMethod, MessageKey>> = {
    first_half_fallback: "searchPhrase.firstHalf",
    last_half_fallback: "searchPhrase.lastHalf",
    first_quarter_fallback: "searchPhrase.firstQuarter",
    second_quarter_fallback: "searchPhrase.secondQuarter",
    third_quarter_fallback: "searchPhrase.thirdQuarter",
    fourth_quarter_fallback: "searchPhrase.fourthQuarter",
    first_word_fallback: "searchPhrase.firstWord",
    longest_word_fallback: "searchPhrase.longestWord",
    source_match_fallback: "searchPhrase.sourceMatch",
    keyspan_fallback: "searchPhrase.sourceMatch",
    custom_phrase_fallback: "searchPhrase.customPhrase",
  };
  const key = keyMap[attempt.method];
  return key ? t(key) : t("searchPhrase.sourceContext");
}

/**
 * Build a human-readable summary of search attempts for not-found states.
 * Groups attempts by distinct searchPhrase (query-centric), computes page range,
 * full doc scan presence, and closest match if any.
 */
export function buildSearchSummary(
  searchAttempts: SearchAttempt[],
  verification?: Verification | null,
  t: TranslateFunction = defaultTranslator,
): SearchSummary {
  const totalAttempts = searchAttempts.length;

  // --- Group by searchPhrase (Map preserves insertion order) ---
  const groupMap = new Map<string, { attempts: SearchAttempt[] }>();
  for (const attempt of searchAttempts) {
    const key = attempt.searchPhrase ?? "";
    let entry = groupMap.get(key);
    if (!entry) {
      entry = { attempts: [] };
      groupMap.set(key, entry);
    }
    entry.attempts.push(attempt);
  }

  const queryGroups: SearchQueryGroup[] = [];
  const allPagesSearched = new Set<number>();
  let includesFullDocScan = false;

  for (const [phrase, { attempts }] of groupMap) {
    // Deduplicate methods (order-preserving)
    const methodsSeen = new Set<SearchMethod>();
    const methodsTried: SearchMethod[] = [];
    const pages = new Set<number>();
    let docScan = false;
    let anySuccess = false;

    let variationTypeLabel: string | null = null;

    // Collect rejected matches
    const rejectedSeen = new Set<string>();
    const rejectedMatches: SearchQueryGroup["rejectedMatches"] = [];

    for (const attempt of attempts) {
      // Methods
      if (!methodsSeen.has(attempt.method)) {
        methodsSeen.add(attempt.method);
        methodsTried.push(attempt.method);
      }

      // Pages
      if (attempt.pageSearched != null) {
        pages.add(attempt.pageSearched);
        allPagesSearched.add(attempt.pageSearched);
      }
      if (attempt.foundLocation?.page != null) {
        pages.add(attempt.foundLocation.page);
        allPagesSearched.add(attempt.foundLocation.page);
      }

      // Doc scan
      if (attempt.searchScope === "document") {
        docScan = true;
        includesFullDocScan = true;
      }

      // Success
      if (attempt.success) anySuccess = true;

      if (!variationTypeLabel && attempt.variationType) {
        variationTypeLabel = getVariationLabel(attempt.variationType, t);
      }

      // Rejected matches
      if (!attempt.success && attempt.matchedText && !rejectedSeen.has(attempt.matchedText)) {
        rejectedSeen.add(attempt.matchedText);
        rejectedMatches.push({
          text: attempt.matchedText,
          occurrences: attempt.occurrencesFound,
        });
      }
    }

    // Use the first attempt to derive phrase type/label (all share the same searchPhrase)
    const firstAttempt = attempts[0];
    queryGroups.push({
      searchPhrase: phrase,
      phraseType: derivePhraseType(firstAttempt),
      phraseLabel: derivePhraseLabel(firstAttempt, t),
      methodsTried,
      locations: {
        pages: Array.from(pages).sort((a, b) => a - b),
        includesDocScan: docScan,
      },
      anySuccess,
      variationTypeLabel,
      rejectedMatches,
      attemptCount: attempts.length,
    });
  }

  // Closest match
  let closestMatch: SearchSummary["closestMatch"];
  if (verification?.sourceSnippet) {
    const page = verification.document?.verifiedPageNumber ?? undefined;
    closestMatch = {
      text: verification.sourceSnippet,
      page: page != null && page > 0 ? page : undefined,
    };
  }
  if (!closestMatch) {
    for (const attempt of searchAttempts) {
      if (!attempt.success && attempt.matchedText) {
        closestMatch = {
          text: attempt.matchedText,
          page: attempt.pageSearched,
        };
        break;
      }
    }
  }

  return {
    totalAttempts,
    queryGroups,
    distinctQueries: queryGroups.length,
    includesFullDocScan,
    closestMatch,
  };
}
