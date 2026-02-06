import type { SearchStatus } from "../types/search.js";

/**
 * Get a human-readable status message for the verification status
 */
export function getContextualStatusMessage(
  status: SearchStatus | null | undefined,
  expectedPage?: number | null,
  actualPage?: number | null,
): string {
  if (!status) return "";

  switch (status) {
    case "found":
      return "Exact match found";
    case "found_anchor_text_only":
      return "Anchor text found, full context differs";
    case "found_phrase_missed_anchor_text":
      return "Full phrase found, anchor text highlight missed";
    case "partial_text_found":
      return "Partial text match found";
    case "found_on_other_page":
      if (expectedPage != null && actualPage != null) {
        return `Found on page ${actualPage} (expected page ${expectedPage})`;
      }
      return "Found on different page";
    case "found_on_other_line":
      return "Found on different line";
    case "first_word_found":
      return "Only first word matched";
    case "not_found":
      return "Not found in source";
    case "pending":
    case "loading":
      return "Searching...";
    default:
      return "";
  }
}
