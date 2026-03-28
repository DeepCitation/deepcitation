import { sanitizeForLog } from "./logSafety.js";

/**
 * Normalize citation JSON into the flat-map format expected by keygen/verify.
 *
 * Accepts two formats:
 *   1. Flat map (CLI format):   { "cite-key": { attachmentId, fullPhrase, ... } }
 *   2. Grouped array (LLM format): { "ATTACHMENT_ID": [ { id, fullPhrase, ... }, ... ] }
 *
 * Format 2 is produced by the LLM citation prompt (<<<CITATION_DATA>>> blocks).
 * This function detects format 2 and converts it to format 1, using the outer
 * key as attachmentId and each citation's `id` field as the flat-map key.
 *
 * Mixed formats (some values are arrays, others are objects) are rejected.
 */
export function normalizeCitationsFile(raw: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const entries = Object.entries(raw);
  if (entries.length === 0) return {};

  const arrayCount = entries.filter(([, v]) => Array.isArray(v)).length;
  const objectCount = entries.filter(([, v]) => typeof v === "object" && v !== null && !Array.isArray(v)).length;

  // Mixed format: some arrays, some objects — ambiguous, reject
  if (arrayCount > 0 && objectCount > 0) {
    throw new Error(
      `Citations file has mixed formats: ${arrayCount} array value(s) and ${objectCount} object value(s). ` +
        "Use either flat-map format (all objects) or grouped format (all arrays).",
    );
  }

  if (arrayCount === 0) {
    // Flat-map format — caller validates that each value has attachmentId
    return raw as Record<string, Record<string, unknown>>;
  }

  // Convert grouped → flat
  const flat: Record<string, Record<string, unknown>> = {};
  for (const [attachmentId, citationArray] of entries) {
    const arr = citationArray as Record<string, unknown>[];
    for (const citation of arr) {
      const hasId = citation.id != null && String(citation.id) !== "";
      const key = hasId ? String(citation.id) : `${attachmentId}-${Object.keys(flat).length}`;
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (key in flat) {
        console.error(`Warning: duplicate citation id "${sanitizeForLog(key)}" — skipping`);
        continue;
      }
      flat[key] = { ...citation, attachmentId };
    }
  }

  return flat;
}
