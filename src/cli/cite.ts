/**
 * Anchor search utilities — resolves [display label](cite:N) markers to
 * evidence line IDs by searching the prepared summary.
 *
 * Used by verifyMarkdown to auto-generate citation data when the body has
 * markers but no <<<CITATION_DATA>>> block. This replaces LLM-generated
 * citation JSON with a deterministic local search.
 */

import { sanitizeForLog } from "../utils/logSafety.js";
import { safeExec } from "../utils/regexSafety.js";
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

export interface BodyMarker {
  id: number;
  displayLabel: string;
  /** Verbatim anchor text from the evidence, if provided via title syntax. */
  anchorHint?: string;
}

/**
 * Extracts all [display label](cite:N) and [display label](cite:N "anchor")
 * markers from a body string.
 *
 * Supports two syntaxes (mirroring markdown's [text](url "title")):
 *   - `[display label](cite:N)` — auto-gen will search evidence for anchor
 *   - `[display label](cite:N "anchor text")` — agent provides verbatim anchor
 *
 * The anchorHint (when provided) is the verbatim evidence substring that
 * should be used for the evidence highlight (full length is preserved).
 * The displayLabel is what the reader sees in the report body.
 *
 * Deduplicates by id — first occurrence wins. Returns entries sorted by id.
 */
export function extractMarkersFromBody(body: string): BodyMarker[] {
  // Match [label](cite:N), [label](cite:N "anchor"), and [label](cite:N 'anchor')
  // Supports both single and double quoted anchors, with escaped quotes inside
  const re =
    /\[([^\][]+)\]\(cite:(\d+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)|\[([^\][]+)\]\(cite:(\d+)\s+'((?:[^'\\]|\\.)*)'\s*\)/g;
  const seen = new Map<number, string>(); // id → first display label
  const results: BodyMarker[] = [];
  let m: RegExpExecArray | null;
  while ((m = safeExec(re, body)) !== null) {
    // Groups 1-3 match double-quote or no-quote form; groups 4-6 match single-quote form
    const label = (m[1] ?? m[4]).trim();
    const id = parseInt(m[2] ?? m[5], 10);
    const anchor = m[3] ?? m[6];
    if (!seen.has(id)) {
      seen.set(id, label);
      const marker: BodyMarker = { id, displayLabel: label };
      const trimmedAnchor = anchor?.trim();
      if (trimmedAnchor) marker.anchorHint = trimmedAnchor;
      results.push(marker);
    } else if (seen.get(id) !== label) {
      // Same ID reused with a different label — the LLM is treating IDs as source references
      // rather than per-claim identifiers. Warn so the user can see the error.
      console.error(
        `  Warning: cite:${id} reused with different label — ` +
          `"${sanitizeForLog(seen.get(id)!)}" (used) vs "${sanitizeForLog(label)}" (ignored). ` +
          `Each distinct claim must use a unique ID.`,
      );
    }
  }
  return results.sort((a, b) => a.id - b.id);
}

/** Generic words skipped by Strategy 3 to avoid wrong-context single-word matches. */
const GENERIC_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "which",
  "will",
  "shall",
  "not",
  "any",
  "all",
  "its",
  "such",
  "each",
  "other",
  "upon",
  "into",
  "than",
  "may",
  "has",
  "are",
  "was",
  "were",
  "been",
  "have",
  "had",
  "but",
  "can",
  "investment",
  "amount",
  "rate",
  "price",
  "stock",
  "shares",
  "company",
  "investor",
  "rights",
  "payment",
  "event",
  "means",
  "pursuant",
  "under",
  "prior",
  "subject",
  "including",
  "respect",
  "date",
  "time",
  "number",
  "voting",
  "discount",
  "value",
  "equal",
  "outstanding",
  "applicable",
]);

/**
 * Finds the best matching evidence line for a display label.
 *
 * Strategy 1 — Sliding window: tries all contiguous N-grams from longest to
 * shortest (≥2 words). Unlike simple prefix truncation, this finds key terms
 * that appear in the middle or end of the label (e.g., "on par" inside
 * "it ranks on par with other SAFEs").
 *
 * Strategy 2 — Word-bag scoring: if no multi-word match, finds the evidence
 * line with the most overlapping words (≥3 chars) from the display label. The
 * anchor is the best contiguous substring of that line that overlaps the label.
 *
 * Strategy 3 — Single distinctive word: if word-bag fails, tries individual
 * words sorted by distinctiveness (longer, capitalized words first).
 *
 * Returns null only if no word from the label appears in any evidence line.
 */
export function findAnchorWithFallback(
  displayLabel: string,
  allLines: LineEntry[],
): { lineId: number; pageId: string; verbatimAnchor: string } | null {
  const words = displayLabel.trim().split(/\s+/);
  if (allLines.length === 0) return null;

  // Strategy 1: Sliding window — all contiguous N-grams, longest first
  for (let len = words.length; len >= 2; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      const candidate = words.slice(start, start + len).join(" ");
      const needle = candidate.toLowerCase();
      const match = allLines.find(line => line.text.toLowerCase().includes(needle));
      if (match) {
        return { lineId: match.lineId, pageId: match.pageId, verbatimAnchor: candidate };
      }
    }
  }

  // Strategy 2: Word-bag scoring — find the line with the most word overlap,
  // then extract the best contiguous anchor from it
  const significantWords = words
    .map(w => w.replace(/[^a-zA-Z0-9'-]/g, "")) // strip punctuation
    .filter(w => w.length >= 3);

  if (significantWords.length >= 2) {
    let bestLine: LineEntry | null = null;
    let bestScore = 0;

    for (const line of allLines) {
      const lineLower = line.text.toLowerCase();
      let score = 0;
      for (const w of significantWords) {
        if (lineLower.includes(w.toLowerCase())) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestLine = line;
      }
    }

    // Accept if at least 2 words match (avoids spurious single-word hits)
    if (bestLine && bestScore >= 2) {
      const anchor = extractBestAnchor(significantWords, bestLine.text);
      return { lineId: bestLine.lineId, pageId: bestLine.pageId, verbatimAnchor: anchor };
    }
  }

  // Strategy 3: Single distinctive word — prefer longer, capitalized words
  const sorted = [...words]
    .map(w => w.replace(/[^a-zA-Z0-9'-]/g, ""))
    .filter(w => w.length >= 3 && !GENERIC_WORDS.has(w.toLowerCase()))
    .sort((a, b) => {
      // Prefer capitalized words (proper nouns/terms)
      const aUp = /^[A-Z]/.test(a) ? 1 : 0;
      const bUp = /^[A-Z]/.test(b) ? 1 : 0;
      if (aUp !== bUp) return bUp - aUp;
      // Then prefer longer words
      return b.length - a.length;
    });

  for (const word of sorted) {
    const needle = word.toLowerCase();
    const match = allLines.find(line => line.text.toLowerCase().includes(needle));
    if (match) {
      console.error(`  Warning: single-word fallback "${sanitizeForLog(word)}" for "${sanitizeForLog(displayLabel)}"`);
      return { lineId: match.lineId, pageId: match.pageId, verbatimAnchor: word };
    }
  }

  return null;
}

/**
 * Given a set of words from the display label and a matching evidence line,
 * extracts the best contiguous anchor substring (2–4 words from the line that
 * overlap with the label words). Prefers longer overlapping spans.
 */
function extractBestAnchor(labelWords: string[], lineText: string): string {
  const lineWords = lineText.split(/\s+/);
  const labelSet = new Set(labelWords.map(w => w.toLowerCase()));

  // Find the best contiguous span of 2–4 words where all words are in the label
  let bestSpan = "";
  let bestLen = 0;

  for (let start = 0; start < lineWords.length; start++) {
    for (let len = Math.min(4, lineWords.length - start); len >= 2; len--) {
      const span = lineWords.slice(start, start + len);
      const stripped = span.map(w => w.replace(/[^a-zA-Z0-9'-]/g, "").toLowerCase());
      const overlapCount = stripped.filter(w => w.length >= 3 && labelSet.has(w)).length;
      if (overlapCount >= 2 && overlapCount > bestLen) {
        bestLen = overlapCount;
        bestSpan = span.join(" ");
      }
    }
  }

  if (bestSpan) return bestSpan;

  // Fallback: return the first label word found in the line (verbatim from line)
  for (const lw of lineWords) {
    const stripped = lw.replace(/[^a-zA-Z0-9'-]/g, "").toLowerCase();
    if (stripped.length >= 3 && labelSet.has(stripped)) {
      return lw;
    }
  }

  // Last resort: first significant word from line
  return lineWords.find(w => w.replace(/[^a-zA-Z0-9'-]/g, "").length >= 3) ?? lineWords[0];
}
