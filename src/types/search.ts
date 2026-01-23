export type SearchStatus =
  | "loading"
  | "pending"
  | "not_found"
  | "partial_text_found"
  | "found"
  | "found_key_span_only"
  | "found_phrase_missed_value"
  | "found_on_other_page"
  | "found_on_other_line"
  | "first_word_found"
  | "timestamp_wip"
  | "skipped";

export type SearchMethod =
  | "exact_line_match"
  | "line_with_buffer"
  | "current_page"
  | "keyspan_fallback"
  | "adjacent_pages"
  | "expanded_window"
  | "regex_search"
  | "first_word_fallback";

/**
 * Indicates which variation of the citation was matched.
 * Trust decreases as we fall back from fullPhrase to keySpan to partial matches.
 *
 * HIGH TRUST (green indicator):
 * - exact_full_phrase: Exact match on the full phrase
 * - normalized_full_phrase: Full phrase matched with whitespace/case normalization
 *
 * MEDIUM TRUST (green indicator, shows context in popover):
 * - exact_key_span: keySpan matched exactly, but fullPhrase was not found
 * - normalized_key_span: keySpan matched with normalization
 *
 * LOW TRUST (amber indicator):
 * - partial_full_phrase: Only part of fullPhrase matched (tables, columns, line breaks)
 * - partial_key_span: Only part of keySpan matched
 * - first_word_only: Only first word matched (lowest trust)
 */
export type MatchedVariation =
  | "exact_full_phrase"
  | "normalized_full_phrase"
  | "exact_key_span"
  | "normalized_key_span"
  | "partial_full_phrase"
  | "partial_key_span"
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
  /** What searchPhrase contains: "full_phrase" or "key_span" */
  searchPhraseType?: "full_phrase" | "key_span";

  // Where it was searched
  pageSearched?: number;

  // Match details (only if success: true)
  /** Which variation matched + trust level */
  matchedVariation?: MatchedVariation;
  /** The actual text found in document */
  matchedText?: string;

  // Human-readable note (API-generated)
  /** e.g., "not found on expected page (2)" */
  note?: string;

  // Performance tracking
  durationMs?: number;

  // ----- DEPRECATED: Backwards compatibility fields -----
  // These are kept for backwards compatibility with older API responses.
  // Prefer the new fields above.
  /** @deprecated Use searchPhrase instead */
  searchPhrases?: string[];
  /** @deprecated Use note instead */
  notes?: string;
}

