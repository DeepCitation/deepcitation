import type { Citation } from "../types/citation.js";
import type { LlmAmendment } from "../types/llmAttempt.js";

type AmendmentField = LlmAmendment["field"];

const TRACKED_FIELDS: AmendmentField[] = ["sourceContext", "sourceMatch", "pageNumber", "lineIds", "reasoning"];

/**
 * Shallow equality check — order-sensitive for arrays.
 * For `lineIds` order is meaningful (line ranges), so this is intentional.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/** Compare two citations and return amendments for each field that changed. */
export function computeAmendments(prev: Citation, next: Citation): LlmAmendment[] {
  const amendments: LlmAmendment[] = [];
  for (const field of TRACKED_FIELDS) {
    const prevVal = prev[field as keyof Citation] as LlmAmendment["previousValue"];
    const nextVal = next[field as keyof Citation] as LlmAmendment["newValue"];
    if (!valuesEqual(prevVal, nextVal)) {
      amendments.push({ field, previousValue: prevVal, newValue: nextVal });
    }
  }
  return amendments;
}
