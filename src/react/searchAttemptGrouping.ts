import type { SearchAttempt } from "../types/search.js";
import { safeReplace } from "../utils/regexSafety.js";

export interface GroupedSearchAttempt {
  key: string;
  attempt: SearchAttempt;
  duplicateCount: number;
}

function normalizePhrase(value: string): string {
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
