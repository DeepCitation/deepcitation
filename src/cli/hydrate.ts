/**
 * Citation hydration utilities.
 *
 * Reconstructs `full_phrase` from a DeepCitation summary file using line IDs,
 * eliminating the need for the LLM to copy verbatim text during report generation.
 *
 * Pipeline:
 *   prepare → (summary file on disk) → LLM writes compact draft (no full_phrase)
 *   → hydrate reads summary + fills full_phrase → verify runs normally
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCitationData, parsePageId } from "../parsing/citationParser.js";
import {
  CITATION_DATA_END_DELIMITER,
  CITATION_DATA_START_DELIMITER,
  type CitationData,
} from "../prompts/citationPrompts.js";
import { sanitizeForLog } from "../utils/logSafety.js";
import { normalizeQuotes } from "../utils/normalizeQuotes.js";
import { findAnchorWithFallback, getAllLines, toCompactPageId } from "./cite.js";
import { die, parseArgs } from "./cliUtils.js";

export const HYDRATE_HELP = `Usage: deepcitation hydrate [options]

Fill in full_phrase on citations that are missing it, by looking up line IDs
in a DeepCitation summary file. Produces a hydrated draft ready for verify.

Use this when the draft was generated with the compact citation format
(no full_phrase/reasoning) to reduce LLM output token usage.

Options:
  --markdown <file>   Path to draft markdown file with <<<CITATION_DATA>>> block
  --summary <file>    Path to summary file from "deepcitation prepare --text"
  --out <file>        Output path (default: overwrites --markdown input)
  -h, --help          Show this help message

Examples:
  deepcitation hydrate --markdown .deepcitation/draft.md --summary .deepcitation/summary-report.txt
  deepcitation hydrate --markdown .deepcitation/draft.md --summary .deepcitation/summary-report.txt --out .deepcitation/draft-hydrated.md
`;

/**
 * Matches <page_number_N_index_I> tags. Safe to reuse as a module-level constant:
 * String.matchAll() does not mutate lastIndex.
 * Do NOT use with RegExp.exec() in a loop.
 */
const PAGE_TAG_RE = /<page_number_(\d+)_index_(\d+)>/g;

/**
 * Matches <line id="N">text</line> entries. Non-greedy [\s\S]*? stops at the
 * first </line>, handling line text that contains any characters.
 * Safe to reuse as a module-level constant with matchAll().
 */
const _LINE_TAG_RE = /<line id="(\d+)">([\s\S]*?)<\/line>/g;

export interface LineMap {
  /** Qualified key: "page_number_N_index_I:lineId" → line text */
  qualified: Map<string, string>;
  /** Fallback: lineId → line text (last-write wins for multi-page docs) */
  byId: Map<number, string>;
}

export interface HydrateOptions {
  /** Raw content of the summary file (JSON string from deepcitation prepare --text) */
  summaryContent: string;
  /** Citations to hydrate in place — full_phrase is mutated on matching entries */
  citations: CitationData[];
  /** When true, log a warning for each citation that could not be hydrated */
  warnOnMiss?: boolean;
}

export interface HydrateResult {
  /** Number of citations that had full_phrase filled in */
  hydrated: number;
  /** Citation IDs that could not be hydrated */
  misses: number[];
}

/**
 * Parses a DeepCitation summary file and builds line-ID lookup maps.
 *
 * Summary file format (JSON):
 *   { "attachmentId": "...", "deepTextPages": ["..."] }
 *
 * Multi-page documents: line IDs restart per page. The qualified map uses
 * "page_number_N_index_I:lineId" keys to avoid collisions. The byId fallback
 * map uses the last-seen text for a given numeric lineId.
 *
 * @throws Error if summaryContent is not valid JSON
 */
export function parseSummaryToLineMap(summaryContent: string): LineMap {
  const qualified = new Map<string, string>();
  const byId = new Map<number, string>();

  let deepText: string;
  let pages: string[] | null = null;
  try {
    const parsed = JSON.parse(summaryContent) as {
      deepTextPages?: unknown;
      deepTextPromptPortion?: unknown;
    };
    if (Array.isArray(parsed.deepTextPages) && parsed.deepTextPages.every(page => typeof page === "string")) {
      pages = parsed.deepTextPages as string[];
      if (pages.length === 0) return { qualified, byId };
      deepText = pages.join("\n\n");
    } else if (typeof parsed.deepTextPromptPortion === "string" && parsed.deepTextPromptPortion.length > 0) {
      // deepTextPromptPortion is a single string containing <page_number_N_index_I> + <line id="N"> tags
      deepText = parsed.deepTextPromptPortion;
    } else {
      return { qualified, byId };
    }
  } catch {
    throw new Error("Summary file is not valid JSON");
  }

  // Check if the text contains <page_number_N_index_I> tags (from deepTextPromptPortion).
  // If not, the pages are raw deepTextPages entries — assign synthetic page IDs per array entry.
  const hasPageTags = PAGE_TAG_RE.test(deepText);
  PAGE_TAG_RE.lastIndex = 0; // Reset after .test()

  if (!hasPageTags && pages) {
    // Each array entry is a separate page — assign page_number_{i+1}_index_{i} (1-based page, 0-based index).
    // Use a global synthetic line counter so IDs are unique across all pages.
    let globalLineId = 1;
    for (let i = 0; i < pages.length; i++) {
      const pageId = `page_number_${i + 1}_index_${i}`;
      const pageText = pages[i];

      // If the page has <line id="N"> tags, use extractLines as normal.
      // Otherwise (raw OCR text with no tags), split on newlines and assign synthetic IDs.
      if (pageText.includes('<line id="')) {
        extractLines(pageText, pageId, qualified, byId);
        // Advance globalLineId past any IDs that extractLines added to byId,
        // so synthetic IDs for subsequent raw pages don't collide.
        // Iterates all accumulated byId keys (O(total lines so far)) — acceptable
        // for the small page counts seen in practice. Synthetic IDs only need to
        // be unique, not contiguous, so gaps from skipping high tagged IDs are fine.
        for (const k of byId.keys()) {
          if (k >= globalLineId) globalLineId = k + 1;
        }
      } else {
        const rawLines = pageText
          .split("\n")
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        for (const lineText of rawLines) {
          qualified.set(`${pageId}:${globalLineId}`, lineText);
          byId.set(globalLineId, lineText);
          globalLineId++;
        }
      }
    }
    return { qualified, byId };
  }

  // Walk through deepText, tracking the current page tag context.
  // Each <page_number_N_index_I> tag opens a new page segment; lines within
  // that segment are keyed by the page's normalized ID.
  let lastIndex = 0;
  let currentPageId = "";

  for (const pageMatch of deepText.matchAll(PAGE_TAG_RE)) {
    const segmentText = deepText.slice(lastIndex, pageMatch.index);
    if (segmentText && currentPageId) {
      extractLines(segmentText, currentPageId, qualified, byId);
    }
    currentPageId = `page_number_${pageMatch[1]}_index_${pageMatch[2]}`;
    lastIndex = (pageMatch.index ?? 0) + pageMatch[0].length;
  }

  // Process remaining text after the last page tag
  if (lastIndex < deepText.length && currentPageId) {
    extractLines(deepText.slice(lastIndex), currentPageId, qualified, byId);
  }

  return { qualified, byId };
}

/**
 * Extract <line id="N">text</line> entries from a page segment, plus infer
 * intermediate line IDs from the raw text between consecutive tagged lines.
 *
 * Line IDs are sequential for every document line; <line id="N"> markers appear
 * only every ~5 lines. The raw text between `</line>` and the next `<line id="N">`
 * holds the content of intermediate lines (IDs curr+1 … next-1), recoverable by
 * splitting on newlines and counting up from the preceding tagged ID.
 */
function extractLines(
  segment: string,
  pageId: string,
  qualified: Map<string, string>,
  byId: Map<number, string>,
): void {
  // Use a local regex instance — LINE_TAG_RE must not be used with exec() loops.
  const re = /<line id="(\d+)">([\s\S]*?)<\/line>/g;

  const tagged: Array<{ id: number; text: string; startIdx: number; endIdx: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    tagged.push({
      id: parseInt(m[1], 10),
      text: m[2].trim(),
      startIdx: m.index,
      endIdx: m.index + m[0].length,
    });
  }

  // Store tagged lines.
  for (const entry of tagged) {
    qualified.set(`${pageId}:${entry.id}`, entry.text);
    byId.set(entry.id, entry.text);
  }

  // Infer intermediate lines between consecutive tagged entries.
  for (let i = 0; i < tagged.length - 1; i++) {
    const curr = tagged[i];
    const next = tagged[i + 1];
    const gap = next.id - curr.id - 1;
    if (gap <= 0) continue;

    const betweenText = segment.slice(curr.endIdx, next.startIdx);
    const rawLines = betweenText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Only assign up to `gap` IDs to avoid colliding with the next tagged entry.
    const count = Math.min(rawLines.length, gap);
    for (let j = 0; j < count; j++) {
      const inferredId = curr.id + j + 1;
      const key = `${pageId}:${inferredId}`;
      if (!qualified.has(key)) qualified.set(key, rawLines[j]);
      if (!byId.has(inferredId)) byId.set(inferredId, rawLines[j]);
    }
  }
}

/**
 * Hydrates full_phrase on citations that are missing it.
 *
 * For each citation with line_ids but no full_phrase, looks up the line text
 * from the summary and sets full_phrase to the concatenated line text.
 * Mutates citations in place.
 */
export function hydrateCitations({ summaryContent, citations, warnOnMiss }: HydrateOptions): HydrateResult {
  const lineMap = parseSummaryToLineMap(summaryContent);
  let hydrated = 0;
  const misses: number[] = [];

  for (const citation of citations) {
    if (citation.full_phrase) continue;

    const lineIds = citation.line_ids;
    if (!lineIds?.length) {
      if (warnOnMiss) console.error(`  Citation ${citation.id}: no line_ids — skipping`);
      misses.push(citation.id);
      continue;
    }

    // Resolve the normalized pageId for qualified lookups (handles both "N_I" and "page_number_N_index_I")
    const normalizedPageId = citation.page_id ? (parsePageId(citation.page_id).startPageId ?? "") : "";

    const lineTexts: string[] = [];
    for (const lid of lineIds) {
      const qualKey = normalizedPageId ? `${normalizedPageId}:${lid}` : null;
      const text = (qualKey && lineMap.qualified.get(qualKey)) ?? lineMap.byId.get(lid);
      if (text) lineTexts.push(text);
    }

    if (lineTexts.length > 0) {
      citation.full_phrase = lineTexts.join(" ");

      // If anchor_text is paraphrased (not verbatim in full_phrase), promote it
      // to display_label and find the actual verbatim anchor from the evidence.
      // Normalize curly/smart quotes before comparing — OCR text may have \u201c/\u201d
      // while the citation anchor uses straight ASCII quotes.
      if (
        citation.anchor_text &&
        !normalizeQuotes(citation.full_phrase.toLowerCase()).includes(
          normalizeQuotes(citation.anchor_text.toLowerCase()),
        )
      ) {
        if (!citation.display_label) {
          citation.display_label = citation.anchor_text;
        }
        const allLines = getAllLines(lineMap);
        const found = findAnchorWithFallback(citation.anchor_text, allLines);
        if (found) {
          citation.anchor_text = found.verbatimAnchor;
          // The assembled lines don't contain the anchor — the agent cited the wrong
          // location. Relocate the citation to the actual evidence and expand to
          // include adjacent lines so full_phrase is broader than the anchor alone.
          // Without surrounding context, fullPhrase === anchorText → the API's search
          // has no enclosing phrase to narrow → pageText fallback → partial_text_found.
          const { lineId, pageId } = found;
          const neighborIds = [lineId - 1, lineId, lineId + 1].filter(id => id > 0);
          const neighborTexts: string[] = [];
          const resolvedIds: number[] = [];
          for (const id of neighborIds) {
            const text = lineMap.qualified.get(`${pageId}:${id}`) ?? lineMap.byId.get(id);
            if (text) {
              neighborTexts.push(text);
              resolvedIds.push(id);
            }
          }
          if (neighborTexts.length > 1) {
            citation.full_phrase = neighborTexts.join(" ");
            citation.page_id = toCompactPageId(pageId);
            citation.line_ids = resolvedIds;
          }
        }
      }

      hydrated++;
    } else {
      // Line ID lookup failed (agent guessed wrong IDs). Fall back to anchor_text search
      // across all lines so we still get a correct full_phrase and page/line location.
      if (citation.anchor_text) {
        const allLines = getAllLines(lineMap);
        const found = findAnchorWithFallback(citation.anchor_text, allLines);
        if (found) {
          // Preserve the original anchor_text as display_label before overwriting,
          // mirroring the paraphrase-promotion pattern in the successful hydration path.
          if (!citation.display_label) citation.display_label = citation.anchor_text;
          citation.anchor_text = found.verbatimAnchor;
          // Update page_id and include adjacent lines so full_phrase is broader than
          // anchor_text alone. Without surrounding context the API cannot compute the
          // anchor highlight position and falls back to pageText → partial_text_found.
          citation.page_id = toCompactPageId(found.pageId);
          const neighborIds = [found.lineId - 1, found.lineId, found.lineId + 1].filter(id => id > 0);
          const neighborTexts: string[] = [];
          const resolvedIds: number[] = [];
          for (const id of neighborIds) {
            const text = lineMap.qualified.get(`${found.pageId}:${id}`) ?? lineMap.byId.get(id);
            if (text) {
              neighborTexts.push(text);
              resolvedIds.push(id);
            }
          }
          citation.full_phrase = neighborTexts.length > 1 ? neighborTexts.join(" ") : found.verbatimAnchor;
          citation.line_ids = resolvedIds.length > 0 ? resolvedIds : [found.lineId];
          hydrated++;
          continue;
        }
      }
      if (warnOnMiss) {
        console.error(`  Citation ${citation.id}: line_ids [${lineIds.join(", ")}] not found in summary`);
      }
      misses.push(citation.id);
    }
  }

  return { hydrated, misses };
}

/**
 * Locates a summary file alongside a markdown draft by convention.
 *
 * Search order (most reliable first):
 *   1. `.deepcitation/prepare-*.json` — pure JSON output from `deepcitation prepare`
 *   2. `.deepcitation/summary-*.txt`  — text+JSON output from `prepare --text`
 *
 * When `attachmentId` is provided, scans each candidate and returns the first one
 * whose JSON contains a matching `attachmentId`. This prevents the wrong evidence
 * source from being used when multiple prepare files exist in `.deepcitation/`.
 *
 * Falls back to newest-by-mtime when no attachmentId match is found.
 */
export function findSummaryForMarkdown(_mdPath: string, attachmentId?: string): string | null {
  const dcDir = join(process.cwd(), ".deepcitation");
  if (!existsSync(dcDir)) return null;

  let all: string[];
  try {
    all = readdirSync(dcDir);
  } catch {
    return null;
  }

  // Prefer prepare-*.json (pure JSON) over summary-*.txt (text+JSON)
  const jsonFiles = all.filter(f => f.startsWith("prepare-") && f.endsWith(".json"));
  const txtFiles = all.filter(f => f.startsWith("summary-") && f.endsWith(".txt"));
  const candidates = jsonFiles.length > 0 ? jsonFiles : txtFiles;

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return join(dcDir, candidates[0]);

  // When attachmentId is known, find the prepare file that matches it exactly.
  // Never fall back to mtime guessing — a wrong summary produces wrong full_phrases.
  if (attachmentId) {
    for (const f of candidates) {
      const filePath = join(dcDir, f);
      try {
        const content = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content) as { attachmentId?: string };
        if (parsed.attachmentId === attachmentId) return filePath;
      } catch {
        // skip unparseable files
      }
    }
    return null; // No match found — don't gamble on the wrong source
  }

  // Multiple prepare files, no attachmentId to disambiguate — refuse to guess.
  // Returning null forces the caller to require --summary from the user.
  return null;
}

/**
 * CLI command: hydrate a draft markdown file using a summary file.
 * Reads compact citations (missing full_phrase), fills in full_phrase from
 * line text in the summary, then writes the enriched draft back to disk.
 */
export function hydrate(argv: string[]): void {
  const args = parseArgs(argv, HYDRATE_HELP);

  const mdPath = args.markdown;
  if (!mdPath) die("--markdown is required", HYDRATE_HELP);

  const summaryPath = args.summary;
  if (!summaryPath) die("--summary is required", HYDRATE_HELP);

  const resolved = resolve(mdPath);
  const resolvedSummary = resolve(summaryPath);

  let raw: string;
  try {
    raw = readFileSync(resolved, "utf-8");
  } catch {
    die(`File not found: ${sanitizeForLog(mdPath)}`, HYDRATE_HELP);
  }

  let summaryRaw: string;
  try {
    summaryRaw = readFileSync(resolvedSummary, "utf-8");
  } catch {
    die(`Summary file not found: ${sanitizeForLog(summaryPath)}`, HYDRATE_HELP);
  }
  const parsed = parseCitationData(raw);
  if (!parsed.success || parsed.citations.length === 0) {
    die("No valid <<<CITATION_DATA>>> block found in the markdown file.", HYDRATE_HELP);
  }

  let result: HydrateResult = { hydrated: 0, misses: [] };
  try {
    result = hydrateCitations({
      summaryContent: summaryRaw,
      citations: parsed.citations,
      warnOnMiss: true,
    });
  } catch (err) {
    die(`Failed to parse summary file: ${err instanceof Error ? err.message : String(err)}`, HYDRATE_HELP);
  }

  const { hydrated, misses } = result;
  console.error(`Hydrated ${hydrated} citation(s).`);
  if (misses.length > 0) {
    console.error(`Warning: ${misses.length} citation(s) could not be hydrated (ids: ${misses.join(", ")})`);
  }

  const citationJson = JSON.stringify(parsed.citations);
  const output = `${parsed.visibleText}\n\n${CITATION_DATA_START_DELIMITER}\n${citationJson}\n${CITATION_DATA_END_DELIMITER}\n`;

  const outPath = args.out ? resolve(args.out) : resolved;
  writeFileSync(outPath, output, "utf-8");
  console.log(outPath);
}
