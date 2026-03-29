import { defaultTranslator, type MessageKey, type TranslateFunction, tPlural } from "../react/i18n.js";
import type { SearchAttempt, SearchMethod, SearchStatus } from "../types/search.js";
import { groupSearchAttempts, groupSearchAttemptsForNotFound } from "./grouping.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Coarse outcome from the user's perspective.
 * Drives the visual theme (color, icon) of every downstream component.
 */
export type NarrativeOutcome = "exact_match" | "partial_match" | "not_found" | "pending";

/**
 * A single rendered row in the timeline.
 * All interpretation has already happened — the renderer just maps this to DOM.
 */
export type NarrativeRow = SuccessRow | FailureRow | CollapsedFailureRow;

export interface SuccessRow {
  kind: "success";
  key: string;
  /** Search phrase, already truncated for display. */
  phraseDisplay: string;
  /** Full phrase for tooltip. */
  phraseFull: string;
  /** e.g. "Exact line match", already translated. */
  methodLabel: string;
  /** e.g. "p. 3, line 12", already translated. Null when unknown. */
  locationLabel: string | null;
  /** True when found page/line differs from expected. */
  isUnexpectedHit: boolean;
  /** Number of method-level retries collapsed into this row. */
  duplicateCount: number;
  /** API-generated note (e.g. "rejected: wrong column"). */
  note: string | undefined;
}

export interface FailureRow {
  kind: "failure";
  key: string;
  phraseDisplay: string;
  phraseFull: string;
  locationLabel: string | null;
  duplicateCount: number;
  note: string | undefined;
}

export interface CollapsedFailureRow {
  kind: "collapsed_failure";
  key: string;
  phraseDisplay: string;
  phraseFull: string;
  locationLabel: string | null;
  duplicateCount: number;
}

/**
 * Everything VerificationLog needs to render, pre-computed.
 *
 * Consumers should render mechanically from this struct.
 * `rows` is the direct render array — map it, nothing else.
 */
export interface SearchNarrative {
  outcome: NarrativeOutcome;
  colorScheme: "green" | "amber" | "red" | "gray";
  /** Pre-translated status label: "Verified", "Partial Match", etc. */
  statusLabel: string;
  /** One-liner for the collapsed summary parenthetical. */
  outcomeSummary: string;
  /** Pre-computed rows for the timeline. Ordered: failures first, then successes. */
  rows: NarrativeRow[];
  /** Whether to show all rows (true) or just the winning hit (false). */
  showAllRows: boolean;
  /** Total raw attempt count. */
  totalAttempts: number;
  /** Number of grouped attempts (for not-found/partial display counts). */
  groupedAttemptCount: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_PHRASE_DISPLAY_LENGTH = 60;
const TRUNCATED_PHRASE_PREFIX_LENGTH = 42;
const TRUNCATED_PHRASE_SUFFIX_LENGTH = 14;

/**
 * Statuses that show only the successful hit (not the full search trail).
 */
const SHOW_ONLY_HIT_STATUSES: ReadonlySet<SearchStatus> = new Set<SearchStatus>([
  "found",
  "found_phrase_missed_anchor_text",
]);

const METHOD_KEY_MAP: Record<SearchMethod, MessageKey> = {
  exact_line_match: "search.method.exactLineMatch",
  line_with_buffer: "search.method.lineWithBuffer",
  expanded_line_buffer: "search.method.expandedLineBuffer",
  current_page: "search.method.currentPage",
  anchor_text_fallback: "search.method.anchorTextFallback",
  adjacent_pages: "search.method.adjacentPages",
  expanded_window: "search.method.expandedWindow",
  regex_search: "search.method.regexSearch",
  first_word_fallback: "search.method.firstWordFallback",
  first_half_fallback: "search.method.firstHalfFallback",
  last_half_fallback: "search.method.lastHalfFallback",
  first_quarter_fallback: "search.method.firstQuarterFallback",
  second_quarter_fallback: "search.method.secondQuarterFallback",
  third_quarter_fallback: "search.method.thirdQuarterFallback",
  fourth_quarter_fallback: "search.method.fourthQuarterFallback",
  longest_word_fallback: "search.method.longestWordFallback",
  content_word_match: "search.method.contentWordMatch",
  custom_phrase_fallback: "search.method.customPhraseFallback",
  keyspan_fallback: "search.method.keyspanFallback",
};

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function truncatePhrase(raw: string | undefined | null, t: TranslateFunction): string {
  const phrase = raw ?? "";
  if (phrase.length === 0) return t("search.empty");
  if (phrase.length <= MAX_PHRASE_DISPLAY_LENGTH) return phrase;
  const prefix = phrase.slice(0, TRUNCATED_PHRASE_PREFIX_LENGTH);
  const suffix = phrase.slice(-TRUNCATED_PHRASE_SUFFIX_LENGTH);
  return `${prefix}...${suffix}`;
}

function getFirstLine(line: number | number[] | undefined): number | undefined {
  if (Array.isArray(line)) return line[0];
  return line;
}

function formatLocationLabel(page: number | undefined, line: number | undefined, t: TranslateFunction): string {
  const hasPage = page != null && page > 0;
  const hasLine = line != null && line > 0;
  if (hasPage && hasLine) return t("location.pageLine", { pageNumber: page, lineNumber: line });
  if (hasPage) return t("location.page", { pageNumber: page });
  if (hasLine) return t("location.line", { lineNumber: line });
  return t("location.unknown");
}

export function getStatusColorScheme(status?: SearchStatus | null): "green" | "amber" | "red" | "gray" {
  if (!status) return "gray";
  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "green";
    case "found_on_other_page":
    case "found_on_other_line":
    case "partial_text_found":
    case "first_word_found":
      return "amber";
    case "not_found":
      return "red";
    default:
      return "gray";
  }
}

export function getStatusHeaderText(status: SearchStatus | null | undefined, t: TranslateFunction): string {
  if (!status) return t("status.verifying");
  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return t("status.verified");
    case "found_on_other_page":
      return t("message.foundOnDifferentPage");
    case "found_on_other_line":
      return t("message.foundOnDifferentLine");
    case "partial_text_found":
    case "first_word_found":
      return t("status.partialMatch");
    case "not_found":
      return t("status.notFound");
    case "pending":
    case "loading":
      return t("status.verifying");
    default:
      return "";
  }
}

function getOutcomeSummary(
  status: SearchStatus | null | undefined,
  searchAttempts: SearchAttempt[],
  t: TranslateFunction,
): string {
  if (!status || status === "not_found") {
    const count = groupSearchAttemptsForNotFound(searchAttempts).length;
    return tPlural(t, "verification.attemptsTried", count, { count });
  }

  const successfulAttempt = searchAttempts.find(a => a.success);
  if (successfulAttempt?.matchedVariation) {
    switch (successfulAttempt.matchedVariation) {
      case "exact_full_phrase":
        return t("outcome.exactMatch");
      case "normalized_full_phrase":
        return t("outcome.normalizedMatch");
      case "exact_anchor_text":
      case "normalized_anchor_text":
        return t("outcome.anchorTextMatch");
      case "partial_full_phrase":
      case "partial_anchor_text":
        return t("outcome.partialMatch");
      case "first_word_only":
        return t("outcome.firstWordMatch");
      default:
        return t("outcome.matchFound");
    }
  }

  switch (status) {
    case "found":
    case "found_phrase_missed_anchor_text":
      return t("outcome.exactMatch");
    case "found_anchor_text_only":
      return t("outcome.anchorTextMatch");
    case "found_on_other_page":
    case "found_on_other_line":
      return t("outcome.foundDifferentLocation");
    case "partial_text_found":
      return t("outcome.partialMatch");
    case "first_word_found":
      return t("outcome.firstWordMatch");
    default:
      return t("outcome.matchFound");
  }
}

export function deriveOutcome(status: SearchStatus | null | undefined): NarrativeOutcome {
  if (!status) return "pending";
  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "exact_match";
    case "found_on_other_page":
    case "found_on_other_line":
    case "partial_text_found":
    case "first_word_found":
      return "partial_match";
    case "not_found":
      return "not_found";
    case "pending":
    case "loading":
      return "pending";
    default:
      return "pending";
  }
}

// =============================================================================
// ROW BUILDERS
// =============================================================================

/**
 * Build a single SuccessRow for the exact-match "hit only" view.
 */
function buildSuccessOnlyRow(attempt: SearchAttempt, t: TranslateFunction): SuccessRow {
  const locationLabel = attempt.foundLocation
    ? attempt.foundLocation.line
      ? t("location.pageLineFull", {
          pageNumber: attempt.foundLocation.page,
          lineNumber: attempt.foundLocation.line,
        })
      : t("location.pageFull", { pageNumber: attempt.foundLocation.page })
    : attempt.pageSearched != null
      ? t("location.pageFull", { pageNumber: attempt.pageSearched })
      : null;

  return {
    kind: "success",
    key: "success-hit",
    phraseDisplay: truncatePhrase(attempt.searchPhrase, t),
    phraseFull: attempt.searchPhrase ?? "",
    methodLabel: t(METHOD_KEY_MAP[attempt.method]),
    locationLabel,
    isUnexpectedHit: false,
    duplicateCount: 1,
    note: attempt.note,
  };
}

/**
 * Build NarrativeRow[] from grouped attempts for the "show all" view.
 */
function buildAllRows(
  searchAttempts: SearchAttempt[],
  status: SearchStatus | null | undefined,
  expectedPage: number | undefined,
  expectedLine: number | undefined,
  t: TranslateFunction,
): NarrativeRow[] {
  const isNotFound = status === "not_found";
  const grouped = isNotFound ? groupSearchAttemptsForNotFound(searchAttempts) : groupSearchAttempts(searchAttempts);

  const rows: NarrativeRow[] = [];
  for (const group of grouped) {
    const { attempt, key, duplicateCount } = group;
    const foundPage = attempt.foundLocation?.page ?? attempt.pageSearched;
    const foundLine = attempt.foundLocation?.line ?? getFirstLine(attempt.lineSearched);

    const locationText =
      group.pageRange && group.pageRange.min !== group.pageRange.max
        ? t("location.pageRange", { startPage: group.pageRange.min, endPage: group.pageRange.max })
        : formatLocationLabel(foundPage, foundLine, t);

    const unexpectedPage =
      attempt.success &&
      expectedPage != null &&
      expectedPage > 0 &&
      foundPage != null &&
      foundPage > 0 &&
      foundPage !== expectedPage;
    const unexpectedLine =
      attempt.success &&
      expectedLine != null &&
      expectedLine > 0 &&
      foundLine != null &&
      foundLine > 0 &&
      foundLine !== expectedLine;
    const isUnexpectedHit = unexpectedPage || unexpectedLine;

    const phraseDisplay = truncatePhrase(attempt.searchPhrase, t);
    const phraseFull = attempt.searchPhrase ?? "";

    if (isNotFound && group.pageRange) {
      rows.push({
        kind: "collapsed_failure",
        key,
        phraseDisplay,
        phraseFull,
        locationLabel: locationText,
        duplicateCount,
      });
    } else if (attempt.success) {
      rows.push({
        kind: "success",
        key,
        phraseDisplay,
        phraseFull,
        methodLabel: t(METHOD_KEY_MAP[attempt.method]),
        locationLabel: locationText,
        isUnexpectedHit,
        duplicateCount,
        note: attempt.note,
      });
    } else {
      rows.push({
        kind: "failure",
        key,
        phraseDisplay,
        phraseFull,
        locationLabel: locationText,
        duplicateCount,
        note: attempt.note,
      });
    }
  }

  // Order: failures first, then successes
  const failures = rows.filter(r => r.kind !== "success");
  const successes = rows.filter(r => r.kind === "success");
  return [...failures, ...successes];
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Build the complete SearchNarrative for a set of search attempts.
 *
 * Pure function — no side effects, no React dependencies.
 * Safe to call in useMemo, server-side, in tests, or in non-React contexts.
 *
 * @param searchAttempts - The ordered search attempts from verification.
 * @param status - The overall verification status.
 * @param expectedPage - Expected page from the citation.
 * @param expectedLine - Expected line from the citation.
 * @param t - Translation function. Defaults to English.
 */
export function buildSearchNarrative(
  searchAttempts: SearchAttempt[],
  status: SearchStatus | null | undefined,
  expectedPage?: number,
  expectedLine?: number,
  t: TranslateFunction = defaultTranslator,
): SearchNarrative {
  const outcome = deriveOutcome(status);
  const colorScheme = getStatusColorScheme(status);
  const statusLabel = getStatusHeaderText(status, t);
  const outcomeSummary = getOutcomeSummary(status, searchAttempts, t);
  const showAllRows = status == null || !SHOW_ONLY_HIT_STATUSES.has(status);
  const totalAttempts = searchAttempts.length;

  // Build rows
  let rows: NarrativeRow[];
  if (!showAllRows) {
    // Exact match: find the successful attempt and show only that
    const successfulAttempt = searchAttempts.find(a => a.success);
    rows = successfulAttempt ? [buildSuccessOnlyRow(successfulAttempt, t)] : [];
  } else {
    rows = buildAllRows(searchAttempts, status, expectedPage, expectedLine, t);
  }

  // Derive from rows.length — buildAllRows produces exactly one row per grouped
  // attempt, so this is always consistent with the rendered timeline.
  const groupedAttemptCount = showAllRows ? rows.length : 0;

  return {
    outcome,
    colorScheme,
    statusLabel,
    outcomeSummary,
    rows,
    showAllRows,
    totalAttempts,
    groupedAttemptCount,
  };
}
