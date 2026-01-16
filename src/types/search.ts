export type SearchStatus =
  | "loading"
  | "pending" // Page not ready, still retrying
  | "not_found"
  | "partial_text_found"
  | "found"
  | "found_key_span_only"
  | "found_phrase_missed_value"
  | "found_on_other_page"
  | "found_on_other_line"
  | "first_word_found"
  | "timestamp_wip";

export type SearchMethod =
  | "exact_line_match"
  | "line_with_buffer"
  | "current_page"
  | "keyspan_fallback"
  | "adjacent_pages"
  | "expanded_window"
  | "regex_search"
  | "bm25_search"
  | "fuzzy_regex"
  | "first_word_fallback";

export interface SearchAttempt {
  method: SearchMethod;
  success: boolean;
  searchPhrases: string[]; // The actual phrase(s) searched for (e.g., ["$4.89", "4.89"])
  pageSearched?: number;

  matchedPhrases?: string[];
  matchedVariation?: string; // 'fullPhrase' | 'keySpan' | 'value'
  phraseVariations?: string[];
  matchQuality?: string; // 'exact' | 'partial_keyspan' | 'value_only' | 'fuzzy'
  isPartialMatch?: boolean; // true when keySpan < 50% of fullPhrase

  matchScore?: number; // For BM25 and other scoring methods
  matchSnippet?: string;
  notes?: string; // Additional context about why it failed/succeeded

  startTime?: number; // Timestamp when search started
  endTime?: number; // Timestamp when search ended

  durationMs?: number; // Time taken in milliseconds
}

