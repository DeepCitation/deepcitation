import type { DeepTextItem } from "../types/boxes.js";
import type { MatchedVariation, SearchAttempt, SearchMethod } from "../types/search.js";
import type { Verification } from "../types/verification.js";
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
  /** What the LLM claimed — the fullPhrase from the citation */
  fullPhrase: string;
  /** The anchor text (key span) if available */
  anchorText?: string;
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

/**
 * Derive a context window around matchedText using page textItems.
 * Concatenates textItems in reading order, finds the match,
 * and expands to ~5 words before and after.
 *
 * @returns Context object with indices, or null if textItems unavailable or match not found.
 */
export function deriveContextWindow(
  matchedText: string,
  textItems: DeepTextItem[] | undefined,
): { contextText: string; matchStart: number; matchEnd: number } | null {
  if (!textItems || textItems.length === 0 || !matchedText) return null;

  // Concatenate text items with spaces
  let fullText = "";
  let totalLen = 0;
  for (const item of textItems) {
    const t = item.text ?? "";
    totalLen += t.length + 1;
    if (totalLen > MAX_TEXT_ITEMS_LENGTH) return null; // Safety: bail on huge pages
    if (fullText.length > 0) fullText += " ";
    fullText += t;
  }

  if (fullText.length === 0) return null;

  // Case-insensitive search for matchedText within the concatenated page text
  const lowerFull = fullText.toLowerCase();
  const lowerMatch = matchedText.toLowerCase();
  const idx = lowerFull.indexOf(lowerMatch);
  if (idx === -1) return null;

  const matchEnd = idx + matchedText.length;

  // Expand to word boundaries: ~CONTEXT_WORD_COUNT words before and after
  let contextStart = idx;
  let wordsFound = 0;
  while (contextStart > 0 && wordsFound < CONTEXT_WORD_COUNT) {
    contextStart--;
    if (fullText[contextStart] === " ") wordsFound++;
  }
  // Snap to after the space (or start of string)
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
  const fullPhrase = verification?.citation?.fullPhrase;
  if (!fullPhrase) return null;

  const anchorText = verification?.citation?.anchorText?.toString();
  const expectedPage =
    verification?.citation && "pageNumber" in verification.citation
      ? (verification.citation as { pageNumber?: number }).pageNumber
      : undefined;
  const status = verification?.status;
  const totalAttempts = searchAttempts.length;

  // Determine outcome
  if (status === "not_found") {
    return {
      outcome: "not_found",
      fullPhrase,
      anchorText,
      expectedPage,
      snippets: [],
      totalAttempts,
    };
  }

  // Check if we have an exact/normalized full phrase match → exact_match
  const successfulAttempt = searchAttempts.find(a => a.success);
  if (
    successfulAttempt?.matchedVariation === "exact_full_phrase" ||
    successfulAttempt?.matchedVariation === "normalized_full_phrase"
  ) {
    return {
      outcome: "exact_match",
      fullPhrase,
      anchorText,
      expectedPage,
      snippets: [],
      totalAttempts,
    };
  }

  // For found status without displacement → exact_match
  if (status === "found" || status === "found_phrase_missed_anchor_text") {
    return {
      outcome: "exact_match",
      fullPhrase,
      anchorText,
      expectedPage,
      snippets: [],
      totalAttempts,
    };
  }

  // Everything else is "related_found" — build snippets from successful partial attempts
  const snippets: MatchSnippet[] = [];

  // Find the match page's textItems for context expansion
  const matchPage = verification?.document?.verifiedPageNumber;
  const pageTextItems = findPageTextItems(verification, matchPage);

  for (const attempt of searchAttempts) {
    if (!attempt.success || !attempt.matchedText) continue;

    const isProximate =
      isProximateMethod(attempt.method) &&
      (!attempt.expectedLocation ||
        !attempt.foundLocation ||
        attempt.expectedLocation.page === attempt.foundLocation.page);

    // Try to derive context from page textItems
    const context = deriveContextWindow(attempt.matchedText, pageTextItems);

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
  if (snippets.length === 0 && verification?.verifiedMatchSnippet) {
    const context = deriveContextWindow(verification.verifiedMatchSnippet, pageTextItems);
    snippets.push({
      matchedText: verification.verifiedMatchSnippet,
      contextText: context?.contextText ?? verification.verifiedMatchSnippet,
      matchStart: context?.matchStart ?? 0,
      matchEnd: context?.matchEnd ?? verification.verifiedMatchSnippet.length,
      page: matchPage && matchPage > 0 ? matchPage : undefined,
      isProximate: true, // verification-level match is presumed proximate
    });
  }

  return {
    outcome: "related_found",
    fullPhrase,
    anchorText,
    expectedPage,
    snippets,
    totalAttempts,
  };
}

/**
 * Find textItems for a specific page from the verification's pages array.
 * Returns undefined if no textItems are available.
 */
function findPageTextItems(
  verification: Verification | null | undefined,
  pageNumber: number | null | undefined,
): DeepTextItem[] | undefined {
  if (!verification?.pages || !pageNumber) return undefined;
  const page = verification.pages.find(p => p.pageNumber === pageNumber);
  return page?.textItems;
}

export interface SearchQueryGroup {
  searchPhrase: string;
  phraseType: "full_phrase" | "anchor_text" | "fragment";
  phraseLabel: string;
  methodsTried: SearchMethod[];
  locations: {
    pages: number[];
    includesDocScan: boolean;
  };
  anySuccess: boolean;
  variations: string[];
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
  /** @deprecated Use queryGroups instead */
  pageRange: string;
}

/** Map searchPhraseType + method to a phrase type category. */
function derivePhraseType(attempt: SearchAttempt): SearchQueryGroup["phraseType"] {
  if (attempt.searchPhraseType === "anchor_text") return "anchor_text";
  if (attempt.searchPhraseType === "full_phrase") return "full_phrase";
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
  if (method === "anchor_text_fallback" || method === "keyspan_fallback") return "anchor_text";
  return "full_phrase";
}

/** Human-readable label for the phrase type. */
function derivePhraseLabel(attempt: SearchAttempt): string {
  if (attempt.searchPhraseType === "anchor_text") return "Anchor text";
  if (attempt.searchPhraseType === "full_phrase") return "Full phrase";
  // Infer from method for fragments
  const labels: Partial<Record<SearchMethod, string>> = {
    first_half_fallback: "First half",
    last_half_fallback: "Last half",
    first_quarter_fallback: "First quarter",
    second_quarter_fallback: "Second quarter",
    third_quarter_fallback: "Third quarter",
    fourth_quarter_fallback: "Fourth quarter",
    first_word_fallback: "First word",
    longest_word_fallback: "Longest word",
    anchor_text_fallback: "Anchor text",
    keyspan_fallback: "Anchor text",
    custom_phrase_fallback: "Custom phrase",
  };
  return labels[attempt.method] ?? "Full phrase";
}

/**
 * Build a human-readable summary of search attempts for not-found states.
 * Groups attempts by distinct searchPhrase (query-centric), computes page range,
 * full doc scan presence, and closest match if any.
 */
export function buildSearchSummary(searchAttempts: SearchAttempt[], verification?: Verification | null): SearchSummary {
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

    // Merge variations (deduplicated)
    const variationSet = new Set<string>();
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

      // Variations
      if (attempt.searchVariations) {
        for (const v of attempt.searchVariations) variationSet.add(v);
      }
      if (!variationTypeLabel && attempt.variationType) {
        variationTypeLabel = getVariationLabel(attempt.variationType);
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
      phraseLabel: derivePhraseLabel(firstAttempt),
      methodsTried,
      locations: {
        pages: Array.from(pages).sort((a, b) => a - b),
        includesDocScan: docScan,
      },
      anySuccess,
      variations: Array.from(variationSet),
      variationTypeLabel,
      rejectedMatches,
      attemptCount: attempts.length,
    });
  }

  // --- Backwards-compat fields ---
  let pageRange: string;
  if (allPagesSearched.size === 0) {
    pageRange = "";
  } else if (allPagesSearched.size === 1) {
    const [page] = allPagesSearched;
    pageRange = `page ${page}`;
  } else {
    const sorted = Array.from(allPagesSearched).sort((a, b) => a - b);
    pageRange = `pages ${sorted[0]}-${sorted[sorted.length - 1]}`;
  }

  // Closest match
  let closestMatch: SearchSummary["closestMatch"];
  if (verification?.verifiedMatchSnippet) {
    const page = verification.document?.verifiedPageNumber ?? undefined;
    closestMatch = {
      text: verification.verifiedMatchSnippet,
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
    pageRange,
  };
}
