import type { DeepTextItem } from "./boxes.js";

export type SearchStatus =
  | "loading"
  | "pending"
  | "not_found"
  | "partial_text_found"
  | "found"
  | "found_source_match_only"
  | "found_context_missed_source_match"
  | "found_on_other_page"
  | "found_on_other_line"
  | "first_word_found"
  | "timestamp_wip"
  | "skipped";

export type SearchMethod =
  | "exact_line_match"
  | "line_with_buffer"
  | "expanded_line_buffer"
  | "current_page"
  | "source_match_fallback"
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
  | "content_word_match"
  | "custom_phrase_fallback"
  | "keyspan_fallback";

/** Type of variation applied to search phrases */
export type VariationType = "exact" | "normalized" | "currency" | "date" | "numeric" | "symbol" | "accent";

/**
 * Indicates which variation of the citation was matched.
 * Trust decreases as we fall back from sourceContext to sourceMatch to partial matches.
 *
 * HIGH TRUST (green indicator):
 * - exact_source_context: Exact match on the source context
 * - normalized_source_context: Source context matched with whitespace/case normalization
 *
 * MEDIUM TRUST (green indicator, shows context in popover):
 * - exact_source_match: sourceMatch matched exactly, but sourceContext was not found
 * - normalized_source_match: sourceMatch matched with normalization
 *
 * LOW TRUST (amber indicator):
 * - partial_source_context: Only part of sourceContext matched (tables, columns, line breaks)
 * - partial_source_match: Only part of sourceMatch matched
 * - first_word_only: Only first word matched (lowest trust)
 */
export type MatchedVariation =
  | "exact_source_context"
  | "normalized_source_context"
  | "exact_source_match"
  | "normalized_source_match"
  | "partial_source_context"
  | "partial_source_match"
  | "first_word_only";

export interface SearchAttempt {
  // Core required fields
  method: SearchMethod;
  success: boolean;

  // What was searched (clear separation)
  /** The primary phrase searched for */
  searchPhrase: string;
  /** What searchPhrase contains: "source_context" or "source_match" */
  searchPhraseType?: "source_context" | "source_match";
  /** The regex source pattern when regex matching was used */
  regexPattern?: string;

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
  /**
   * Deep text boxes for what was observed during this attempt (accepted or rejected).
   * Enables highlighting exact seen text, even when it was on the wrong line/page.
   */
  deepTextItems?: DeepTextItem[];

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
