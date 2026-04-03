/**
 * Anchor search utilities — resolves [display label](cite:N) markers to
 * evidence line IDs by searching the prepared summary.
 *
 * Used by verifyMarkdown to auto-generate citation data when the body has
 * markers but no <<<CITATION_DATA>>> block. This replaces LLM-generated
 * citation JSON with a deterministic local search.
 */

import type { LineMap } from "./hydrate.js";

/** A single indexed evidence line from the summary. */
interface LineEntry {
  lineId: number;
  /** Verbose page ID: "page_number_N_index_I" */
  pageId: string;
  text: string;
}

/**
 * Converts a verbose page ID ("page_number_N_index_I") to compact ("N_I").
 * Returns the input unchanged if it does not match the expected pattern.
 */
export function toCompactPageId(verbose: string): string {
  const m = verbose.match(/page_number_(\d+)_index_(\d+)/);
  return m ? `${m[1]}_${m[2]}` : verbose;
}

/**
 * Flattens the LineMap from parseSummaryToLineMap into a sorted array of
 * LineEntry objects. Uses the qualified map for full page context. Sorted by
 * lineId for deterministic first-match behaviour.
 */
export function getAllLines(lineMap: LineMap): LineEntry[] {
  const entries: LineEntry[] = [];
  for (const [key, text] of lineMap.qualified) {
    const colonIdx = key.lastIndexOf(":");
    const pageId = key.slice(0, colonIdx);
    const lineId = parseInt(key.slice(colonIdx + 1), 10);
    entries.push({ lineId, pageId, text });
  }
  return entries.sort((a, b) => a.lineId - b.lineId);
}

/**
 * Extracts all [display label](cite:N) markers from a body string.
 * Deduplicates by id — first occurrence wins. Returns entries sorted by id.
 */
export function extractMarkersFromBody(body: string): { id: number; displayLabel: string }[] {
  const re = /\[([^\][]+)\]\(cite:(\d+)\)/g;
  const seen = new Set<number>();
  const results: { id: number; displayLabel: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const id = parseInt(m[2], 10);
    if (!seen.has(id)) {
      seen.add(id);
      results.push({ id, displayLabel: m[1].trim() });
    }
  }
  return results.sort((a, b) => a.id - b.id);
}

/**
 * Finds the best matching evidence line for a display label using progressive
 * word truncation. Tries the full display label first; drops the last word and
 * retries until a match is found or only one word remains (which is also tried).
 *
 * Returns the first line containing the candidate as a case-insensitive
 * substring. The `verbatimAnchor` is the longest matched prefix.
 *
 * Returns null if no match is found even at the single-word level.
 */
export function findAnchorWithFallback(
  displayLabel: string,
  allLines: LineEntry[],
): { lineId: number; pageId: string; verbatimAnchor: string } | null {
  const words = displayLabel.trim().split(/\s+/);
  for (let len = words.length; len >= 1; len--) {
    const candidate = words.slice(0, len).join(" ");
    const needle = candidate.toLowerCase();
    const match = allLines.find(line => line.text.toLowerCase().includes(needle));
    if (match) {
      if (len === 1 && words.length > 1) {
        console.error(`  Warning: single-word fallback "${candidate}" matched for "${displayLabel}" — verify accuracy`);
      }
      return { lineId: match.lineId, pageId: match.pageId, verbatimAnchor: candidate };
    }
  }
  return null;
}
