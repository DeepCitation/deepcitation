/**
 * Single source of truth for SearchStatus → display mappings.
 *
 * Consolidates three parallel switch/if-chains (deriveOutcome,
 * getStatusColorScheme, getStatusHeaderText) into one exhaustive record.
 * Adding a new SearchStatus without an entry here is a compile error.
 */

import type { MessageKey } from "../react/i18n.js";
import type { SearchStatus } from "../types/search.js";
import type { NarrativeOutcome } from "./narrative.js";

export interface StatusMapping {
  outcome: NarrativeOutcome;
  colorScheme: "green" | "amber" | "red" | "gray";
  headerKey: MessageKey;
  /** When true, show only the successful hit (not the full search trail). */
  showOnlyHit: boolean;
}

/**
 * Exhaustive mapping from every SearchStatus to its display properties.
 *
 * The `satisfies Record<SearchStatus, StatusMapping>` ensures that every
 * member of the SearchStatus union has an entry — adding a new status
 * without updating this table is a compile error.
 */
export const STATUS_MAP = {
  found: {
    outcome: "exact_match",
    colorScheme: "green",
    headerKey: "status.verified",
    showOnlyHit: true,
  },
  found_source_match_only: {
    outcome: "exact_match",
    colorScheme: "green",
    headerKey: "status.verified",
    showOnlyHit: false,
  },
  found_context_missed_source_match: {
    outcome: "exact_match",
    colorScheme: "green",
    headerKey: "status.verified",
    showOnlyHit: true,
  },
  found_on_other_page: {
    outcome: "partial_match",
    colorScheme: "amber",
    headerKey: "message.foundOnDifferentPage",
    showOnlyHit: false,
  },
  found_on_other_line: {
    outcome: "partial_match",
    colorScheme: "amber",
    headerKey: "message.foundOnDifferentLine",
    showOnlyHit: false,
  },
  partial_text_found: {
    outcome: "partial_match",
    colorScheme: "amber",
    headerKey: "status.partialMatch",
    showOnlyHit: false,
  },
  first_word_found: {
    outcome: "partial_match",
    colorScheme: "amber",
    headerKey: "status.partialMatch",
    showOnlyHit: false,
  },
  not_found: {
    outcome: "not_found",
    colorScheme: "red",
    headerKey: "status.notFound",
    showOnlyHit: false,
  },
  pending: {
    outcome: "pending",
    colorScheme: "gray",
    headerKey: "status.verifying",
    showOnlyHit: false,
  },
  loading: {
    outcome: "pending",
    colorScheme: "gray",
    headerKey: "status.verifying",
    showOnlyHit: false,
  },
  timestamp_wip: {
    outcome: "pending",
    colorScheme: "gray",
    headerKey: "status.verifying",
    showOnlyHit: false,
  },
  skipped: {
    outcome: "pending",
    colorScheme: "gray",
    headerKey: "status.verifying",
    showOnlyHit: false,
  },
} as const satisfies Record<SearchStatus, StatusMapping>;
