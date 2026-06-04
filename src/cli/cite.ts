/**
 * Anchor search utilities — resolves [display label](cite:N) markers to
 * evidence line IDs by searching the prepared summary.
 *
 * Used by verifyMarkdown to auto-generate citation data when the body has
 * markers but no <<<CITATION_DATA>>> block. This replaces LLM-generated
 * citation JSON with a deterministic local search.
 */

import { sanitizeForLog } from "../utils/logSafety.js";
import { normalizeQuotes } from "../utils/normalizeQuotes.js";
import { safeExec } from "../utils/regexSafety.js";
import { normalizeDeepTextPageId, wrapDeepTextLine } from "../deeptext/index.js";
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
  const normalized = normalizeDeepTextPageId(verbose);
  return normalized.pageNumber !== undefined && normalized.pageIndex !== undefined
    ? `${normalized.pageNumber}_${normalized.pageIndex}`
    : verbose;
}

/**
 * Annotates every non-blank line of raw page text with a sequential `<line id="N">` tag.
 *
 * Use this ONLY on pages that have no existing `<line id>` tags (i.e. raw OCR text
 * with no tag metadata). Pages that already carry sparse `<line id>` tags have their
 * IDs set by the OCR pipeline to correspond to the PDF's actual rendered-line positions.
 * Re-annotating those pages would replace OCR-derived positions with sequential text-line
 * counts, causing `lineIds` sent to the verify API to index the wrong PDF lines.
 *
 * Output format matches what `extractLines` in hydrate.ts expects:
 *   `<line id="1">first line text</line>\n<line id="2">second line text</line>...`
 *
 * Blank lines are silently skipped — they carry no evidence content and the sequential
 * counter should not advance for them, so IDs remain contiguous across non-blank lines.
 *
 * @param rawText  Raw page text with no existing `<line id>` tags.
 * @param startId  First ID to assign (default: 1). Useful when caller needs IDs to
 *                 continue from a previous page's counter.
 */
export function denseAnnotatePage(rawText: string, startId = 1): string {
  if (!rawText.trim()) return "";
  let id = startId - 1;
  return rawText
    .split("\n")
    .map(line => {
      const t = line.trim();
      if (t.length === 0) return "";
      return wrapDeepTextLine(++id, t) ?? t;
    })
    .filter(line => line.length > 0)
    .join("\n");
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
  claimText: string;
  /** Alternate labels that reused the same citation ID. */
  claimTextVariants?: string[];
  /** Verbatim anchor text from the evidence, if provided via title syntax. */
  anchorHint?: string;
}

/**
 * Extracts all `[display](cite:N ...)` markers from a body string.
 *
 * Supported marker syntaxes:
 *   - `[display](cite:N)` — display = anchor
 *   - `[display](cite:N 'anchor')` — explicit anchor hint (also `"anchor"`)
 *
 * Markers provide the in-text references. Citation coordinates (page_id,
 * line_ids) come from a separate `<<<CITATION_DATA>>>` JSON block appended
 * after the body. The CLI hydrates `source_context` from the summary using
 * those coordinates.
 *
 * Deduplicates by id — first occurrence wins. Returns entries sorted by id.
 */
export function extractMarkersFromBody(body: string): BodyMarker[] {
  // Match [label](cite:N ...) — capture everything inside the parens after cite:N
  const re = /\[([^\][]+)\]\(cite:(\d+)((?:\s+[^)]*)?)\)/g;
  const seen = new Map<number, BodyMarker>(); // id → first marker, with alternates preserved
  let m: RegExpExecArray | null;
  while ((m = safeExec(re, body)) !== null) {
    const label = m[1].trim();
    const id = parseInt(m[2], 10);
    const rest = m[3]?.trim() ?? "";

    const existing = seen.get(id);
    if (existing) {
      if (existing.claimText !== label && !(existing.claimTextVariants?.includes(label) ?? false)) {
        console.error(
          `  Warning: cite:${id} reused with different label — ` +
            `"${sanitizeForLog(existing.claimText)}" (used) vs "${sanitizeForLog(label)}" (stored as variant). ` +
            `Each distinct claim must use a unique ID.`,
        );
        existing.claimTextVariants ??= [];
        existing.claimTextVariants.push(label);
      }
      continue;
    }
    const marker: BodyMarker = { id, claimText: label };

    // Parse optional anchor hint (single or double quoted)
    const anchorDQ = rest.match(/"((?:[^"\\]|\\.)*)"/);
    const anchorSQ = rest.match(/'((?:[^'\\]|\\.)*)'/);
    const anchorRaw = anchorDQ?.[1] ?? anchorSQ?.[1];
    if (anchorRaw?.trim()) marker.anchorHint = anchorRaw.trim();

    seen.set(id, marker);
  }
  // Fallback: **bold text** [N] markers (Strategy 2c format).
  // Only used when no [text](cite:N) markers were found.
  if (seen.size === 0) {
    const boldRe = /\*\*([^*]+)\*\*\s*\[(\d+)\]/g;
    let bm: RegExpExecArray | null;
    while ((bm = safeExec(boldRe, body)) !== null) {
      const label = bm[1].trim();
      const id = parseInt(bm[2], 10);
      const existing = seen.get(id);
      if (existing) {
        if (existing.claimText !== label && !(existing.claimTextVariants?.includes(label) ?? false)) {
          console.error(
            `  Warning: [${id}] reused with different label — ` +
              `"${sanitizeForLog(existing.claimText)}" (used) vs "${sanitizeForLog(label)}" (stored as variant). ` +
              `Each distinct claim must use a unique ID.`,
          );
          existing.claimTextVariants ??= [];
          existing.claimTextVariants.push(label);
        }
        continue;
      }
      seen.set(id, { id, claimText: label });
    }
  }

  return [...seen.values()].sort((a, b) => a.id - b.id);
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
  claimText: string,
  allLines: LineEntry[],
): { lineId: number; pageId: string; verbatimAnchor: string } | null {
  const words = claimText.trim().split(/\s+/);
  if (allLines.length === 0) return null;

  // Pre-compute whitespace-normalized, quote-normalized, lowercase text for each line.
  // Evidence text may contain newlines mid-phrase (e.g. "land and\nnaval Forces")
  // which would prevent substring matches against space-joined search terms.
  // Quote normalization handles curly/smart quotes from OCR (e.g. \u201cC\u201d → "C").
  const normalizedLines = allLines.map(line => normalizeQuotes(line.text.replace(/\s+/g, " ").toLowerCase()));

  // Strategy 1: Sliding window — all contiguous N-grams, longest first
  for (let len = words.length; len >= 2; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      const candidate = words.slice(start, start + len).join(" ");
      const needle = normalizeQuotes(candidate.toLowerCase());
      const idx = normalizedLines.findIndex(norm => norm.includes(needle));
      if (idx !== -1) {
        return { lineId: allLines[idx].lineId, pageId: allLines[idx].pageId, verbatimAnchor: candidate };
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

    for (let i = 0; i < allLines.length; i++) {
      const lineLower = normalizedLines[i];
      let score = 0;
      for (const w of significantWords) {
        if (lineLower.includes(w.toLowerCase())) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestLine = allLines[i];
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
    const needle = normalizeQuotes(word.toLowerCase());
    const idx = normalizedLines.findIndex(norm => norm.includes(needle));
    if (idx !== -1) {
      console.error(`  Warning: single-word fallback "${sanitizeForLog(word)}" for "${sanitizeForLog(claimText)}"`);
      return { lineId: allLines[idx].lineId, pageId: allLines[idx].pageId, verbatimAnchor: word };
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
