import type { SearchAttempt, SearchMethod } from "../types/search.js";
import { safeReplace } from "../utils/regexSafety.js";

export interface GroupedSearchAttempt {
  key: string;
  attempt: SearchAttempt;
  duplicateCount: number;
  /** Page range for collapsed multi-page groups (used by not_found grouping). */
  pageRange?: { min: number; max: number };
}

function normalizePhrase(value: string): string {
  if (!value) return "";
  const stripped = safeReplace(value.normalize("NFKD"), /[\u0300-\u036f]/g, "").toLowerCase();
  const noDigitSeps = safeReplace(stripped, /(\d)[,._](?=\d)/g, "$1");
  const alphanumOnly = safeReplace(noDigitSeps, /[^a-z0-9]+/g, " ").trim();
  const canonical = safeReplace(alphanumOnly, /\s+/g, " ");
  // When canonical is empty, `value` was all non-alphanumeric characters.
  // Return raw `value` — it can never collide with a normalized alphanumeric key.
  return canonical.length > 0 ? canonical : value;
}

function resolveAttemptPage(attempt: SearchAttempt): number {
  return attempt.foundLocation?.page ?? attempt.pageSearched ?? 0;
}

/**
 * Groups attempts by canonicalized phrase + page.
 * Method-level retries (same phrase on the same page) are treated as one logical
 * search so the audit list doesn't flood with near-duplicate rows.
 */
export function groupSearchAttempts(attempts: SearchAttempt[]): GroupedSearchAttempt[] {
  const grouped: GroupedSearchAttempt[] = [];
  const indexByKey = new Map<string, number>();

  for (const attempt of attempts) {
    const key = `${normalizePhrase(attempt.searchPhrase)}|${resolveAttemptPage(attempt)}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex == null) {
      indexByKey.set(key, grouped.length);
      grouped.push({ key, attempt, duplicateCount: 1 });
      continue;
    }

    const existing = grouped[existingIndex];
    existing.duplicateCount += 1;
    // Prefer a successful representative when any duplicate attempt succeeds.
    if (!existing.attempt.success && attempt.success) {
      existing.attempt = attempt;
    }
  }

  return grouped;
}

export function getUniqueSearchAttemptCount(attempts: SearchAttempt[]): number {
  return groupSearchAttempts(attempts).length;
}

// ============================================================================
// Not-found grouping: groups by method category + phrase (collapses multi-page)
// ============================================================================

type MethodCategory = "exact" | "page" | "nearby" | "regex" | "partial";

function getMethodCategory(method: SearchMethod): MethodCategory {
  switch (method) {
    case "exact_line_match":
    case "line_with_buffer":
    case "expanded_line_buffer":
      return "exact";
    case "current_page":
      return "page";
    case "adjacent_pages":
    case "expanded_window":
      return "nearby";
    case "regex_search":
      return "regex";
    default:
      return "partial";
  }
}

/**
 * Groups attempts by method category + canonicalized phrase (dropping page from the key).
 * Collapses "same phrase searched on pages 1,2,3,4,5" into one row with duplicateCount
 * and a pageRange. Designed for not_found status where the multi-page expansion is noise.
 */
export function groupSearchAttemptsForNotFound(attempts: SearchAttempt[]): GroupedSearchAttempt[] {
  const grouped: GroupedSearchAttempt[] = [];
  const indexByKey = new Map<string, number>();

  for (const attempt of attempts) {
    const category = getMethodCategory(attempt.method);
    const key = `${category}|${normalizePhrase(attempt.searchPhrase)}`;
    const page = resolveAttemptPage(attempt);
    const existingIndex = indexByKey.get(key);

    if (existingIndex == null) {
      indexByKey.set(key, grouped.length);
      grouped.push({
        key,
        attempt,
        duplicateCount: 1,
        pageRange: page > 0 ? { min: page, max: page } : undefined,
      });
      continue;
    }

    const existing = grouped[existingIndex];
    existing.duplicateCount += 1;

    // Track page range
    if (page > 0) {
      if (existing.pageRange) {
        existing.pageRange.min = Math.min(existing.pageRange.min, page);
        existing.pageRange.max = Math.max(existing.pageRange.max, page);
      } else {
        existing.pageRange = { min: page, max: page };
      }
    }

    // Prefer a successful representative when any duplicate attempt succeeds.
    if (!existing.attempt.success && attempt.success) {
      existing.attempt = attempt;
    }
  }

  return grouped;
}
