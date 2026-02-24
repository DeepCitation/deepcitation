import type { SearchAttempt, SearchMethod } from "../types/search.js";
import type { Verification } from "../types/verification.js";

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
    method === "longest_word_fallback" ||
    method === "keyspan_fallback"
  ) {
    return "fragment";
  }
  if (method === "anchor_text_fallback") return "anchor_text";
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

/** Map VariationType to label (mirrors variationLabels.ts without importing it). */
function variationTypeToLabel(vt: string | undefined): string | null {
  if (!vt) return null;
  const map: Record<string, string> = {
    exact: "Exact match",
    normalized: "Normalized",
    currency: "Price formats",
    date: "Date formats",
    numeric: "Number formats",
    symbol: "Symbol variants",
    accent: "Accent variants",
  };
  return map[vt] ?? null;
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
        variationTypeLabel = variationTypeToLabel(attempt.variationType);
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
