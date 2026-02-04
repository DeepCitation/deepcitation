export type SearchStatus =
  | "loading"
  | "pending"
  | "not_found"
  | "partial_text_found"
  | "found"
  | "found_anchor_text_only"
  | "found_phrase_missed_anchor_text"
  | "found_on_other_page"
  | "found_on_other_line"
  | "first_word_found"
  | "timestamp_wip"
  | "skipped";

export type SearchMethod =
  | "exact_line_match"
  | "line_with_buffer"
  | "current_page"
  | "anchor_text_fallback"
  | "adjacent_pages"
  | "expanded_window"
  | "regex_search"
  | "first_word_fallback"
  | "first_half_fallback"
  | "last_half_fallback"
  | "first_quarter_fallback"
  | "second_quarter_fallback"
  | "third_quarter_fallback"
  | "fourth_quarter_fallback"
  | "longest_word_fallback"
  | "custom_phrase_fallback"
  | "keyspan_fallback";

/** Type of variation applied to search phrases */
export type VariationType =
  | "exact"
  | "normalized"
  | "currency"
  | "date"
  | "numeric"
  | "symbol"
  | "accent";

/**
 * Indicates which variation of the citation was matched.
 * Trust decreases as we fall back from fullPhrase to anchorText to partial matches.
 *
 * HIGH TRUST (green indicator):
 * - exact_full_phrase: Exact match on the full phrase
 * - normalized_full_phrase: Full phrase matched with whitespace/case normalization
 *
 * MEDIUM TRUST (green indicator, shows context in popover):
 * - exact_anchor_text: anchorText matched exactly, but fullPhrase was not found
 * - normalized_anchor_text: anchorText matched with normalization
 *
 * LOW TRUST (amber indicator):
 * - partial_full_phrase: Only part of fullPhrase matched (tables, columns, line breaks)
 * - partial_anchor_text: Only part of anchorText matched
 * - first_word_only: Only first word matched (lowest trust)
 */
export type MatchedVariation =
  | "exact_full_phrase"
  | "normalized_full_phrase"
  | "exact_anchor_text"
  | "normalized_anchor_text"
  | "partial_full_phrase"
  | "partial_anchor_text"
  | "first_word_only";

export interface SearchAttempt {
  // Core required fields
  method: SearchMethod;
  success: boolean;

  // What was searched (clear separation)
  /** The primary phrase searched for */
  searchPhrase: string;
  /** Additional variations tried (e.g., ["$4.89", "4.89"]) */
  searchVariations?: string[];
  /** What searchPhrase contains: "full_phrase" or "anchor_text" */
  searchPhraseType?: "full_phrase" | "anchor_text";

  // Where it was searched
  pageSearched?: number;
  /** Line ID(s) searched within the page */
  lineSearched?: number | number[];
  /** Search scope: specific line, entire page, or whole document */
  searchScope?: "line" | "page" | "document";

  // Location comparison (for displacement detection)
  /** Where we expected to find the match */
  expectedLocation?: {
    page: number;
    line?: number;
  };
  /** Where we actually found the match (if success: true) */
  foundLocation?: {
    page: number;
    line?: number;
  };

  // Match details
  /** Which variation matched + trust level (only if success: true) */
  matchedVariation?: MatchedVariation;
  /** The actual text found in document (may exist even if success: false, for rejected matches) */
  matchedText?: string;

  // Human-readable note (API-generated)
  /** e.g., "not found on expected page (2)" */
  note?: string;

  // Performance tracking
  durationMs?: number;

  // Variation tracking
  /** Type of variation applied to the search phrase */
  variationType?: VariationType;

  // Occurrence tracking (for ambiguity detection)
  /** Number of occurrences found for this search phrase */
  occurrencesFound?: number;
  /** Whether the matched occurrence was the expected one (based on page/line context) */
  matchedExpectedOccurrence?: boolean;
}
