/**
 * Citation hydration utilities.
 *
 * Reconstructs `source_context` from a DeepCitation summary file using line IDs,
 * eliminating the need for the LLM to copy verbatim text during report generation.
 *
 * Pipeline:
 *   prepare → (summary file on disk) → LLM writes compact draft (no source_context)
 *   → hydrate reads summary + fills source_context → verify runs normally
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCitationData, parsePageId } from "../parsing/citationParser.js";
import { extractDeepTextPageBlocks, formatRequiredDeepTextPageId, parseDeepTextPageLines } from "../deeptext/index.js";
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

Fill in source_context on citations that are missing it, by looking up line IDs
in a DeepCitation summary file. Produces a hydrated draft ready for verify.

Use this when the draft was generated with the compact citation format
(no source_context/reasoning) to reduce LLM output token usage.

Options:
  --markdown <file>   Path to draft markdown file with <<<CITATION_DATA>>> block
  --summary <file>    Path to JSON summary file from "deepcitation prepare --out"
  --out <file>        Output path (default: overwrites --markdown input)
  -h, --help          Show this help message

Examples:
  deepcitation hydrate --markdown .deepcitation/draft.md --summary .deepcitation/prepare-report.json
  deepcitation hydrate --markdown .deepcitation/draft.md --summary .deepcitation/prepare-report.json --out .deepcitation/draft-hydrated.md
`;

export interface LineMap {
  /** Qualified key: "page_number_N_index_I:lineId" → line text */
  qualified: Map<string, string>;
  /** Fallback: lineId → line text (last-write wins for multi-page docs) */
  byId: Map<number, string>;
}

export interface HydrateOptions {
  /** Raw content of the summary file (JSON string from deepcitation prepare --out) */
  summaryContent: string;
  /** Citations to hydrate in place — source_context is mutated on matching entries */
  citations: CitationData[];
  /** When true, log a warning for each citation that could not be hydrated */
  warnOnMiss?: boolean;
}

export interface HydrateResult {
  /** Number of citations that had source_context filled in */
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
  const pageBlocks = extractDeepTextPageBlocks(deepText);
  const hasPageTags = pageBlocks.length > 0;

  if (!hasPageTags && pages) {
    // Each array entry is a separate page — assign page_number_{i+1}_index_{i} (1-based page, 0-based index).
    // globalLineId keeps byId entries unique across all pages.
    // qualified keys use per-page counters (1..N) so IDs match the verify API's
    // per-page expectation — global IDs would be "out of bounds" for later pages.
    let globalLineId = 1;
    for (let i = 0; i < pages.length; i++) {
      const pageId = formatRequiredDeepTextPageId(i + 1);
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
        let perPageLineId = 1;
        for (const lineText of rawLines) {
          qualified.set(`${pageId}:${perPageLineId}`, lineText);
          byId.set(globalLineId, lineText);
          perPageLineId++;
          globalLineId++;
        }
      }
    }
    return { qualified, byId };
  }

  for (const block of pageBlocks) {
    extractLines(block.content, block.pageId, qualified, byId);
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
  for (const line of parseDeepTextPageLines(segment)) {
    const key = `${pageId}:${line.lineId}`;
    if (!qualified.has(key)) qualified.set(key, line.text);
    if (!byId.has(line.lineId)) byId.set(line.lineId, line.text);
  }
}

/**
 * Hydrates source_context on citations that are missing it.
 *
 * For each citation with line_ids but no source_context, looks up the line text
 * from the summary and sets source_context to the concatenated line text.
 * Mutates citations in place.
 */
export function hydrateCitations({ summaryContent, citations, warnOnMiss }: HydrateOptions): HydrateResult {
  const lineMap = parseSummaryToLineMap(summaryContent);
  let hydrated = 0;
  const misses: number[] = [];

  for (const citation of citations) {
    if (citation.source_context) continue;

    const lineIds = citation.line_ids ?? [];
    // Empty lineIds: skip the ID-lookup loop — lineTexts will be empty, which
    // falls through to the anchor-text search below. This lets the LLM omit `l`
    // entirely and rely on `k` (source_match) for location, exactly the same path
    // taken when the LLM provides wrong IDs.

    // Resolve the normalized pageId for qualified lookups (handles both "N_I" and "page_number_N_index_I")
    const normalizedPageId = citation.page_id ? (parsePageId(citation.page_id).startPageId ?? "") : "";

    // Always pull ±1 neighbor lines around the cited range so source_context is
    // reliably wider than source_match. Without surrounding context, the popover
    // quote has nothing to highlight (phrase === anchor) and the verify API
    // has no enclosing phrase to narrow the match — falls back to pageText →
    // partial_text_found. Mirrors the wrong-lineId fallback path below.
    //
    // byId is page-agnostic, so resolving a *neighbor* through it can bleed
    // text across pages. Only the originally cited IDs (which carry the
    // agent's intent) may fall back to byId as tolerance for a missing/wrong
    // page_id. Synthetic neighbor IDs must match the qualified page or drop.
    // When page_id is absent, `normalizedPageId === ""` so neighbors can
    // never resolve and expansion silently no-ops for that citation.
    //
    // With lineIds = [], Math.min/max return ±Infinity, loId > hiId, loop is
    // skipped, lineTexts stays empty → falls through to anchor-text search.
    const minCitedId = Math.min(...lineIds);
    const maxCitedId = Math.max(...lineIds);
    const loId = Math.max(1, minCitedId - 1);
    const hiId = maxCitedId + 1;
    const lineTexts: string[] = [];
    for (let lid = loId; lid <= hiId; lid++) {
      const qualKey = normalizedPageId ? `${normalizedPageId}:${lid}` : null;
      const qualified = qualKey ? lineMap.qualified.get(qualKey) : undefined;
      const text = qualified ?? (lineIds.includes(lid) ? lineMap.byId.get(lid) : undefined);
      if (text) lineTexts.push(text);
    }

    if (lineTexts.length > 0) {
      citation.source_context = lineTexts.join(" ");

      // If source_match is paraphrased (not verbatim in source_context), promote it
      // to claim_text and find the actual verbatim anchor from the evidence.
      // Normalize curly/smart quotes before comparing — OCR text may have \u201c/\u201d
      // while the citation anchor uses straight ASCII quotes.
      if (
        citation.source_match &&
        !normalizeQuotes(citation.source_context.toLowerCase()).includes(
          normalizeQuotes(citation.source_match.toLowerCase()),
        )
      ) {
        if (!citation.claim_text) {
          citation.claim_text = citation.source_match;
        }
        const allLines = getAllLines(lineMap);
        const found = findAnchorWithFallback(citation.source_match, allLines);
        if (found) {
          citation.source_match = found.verbatimAnchor;
          // The assembled lines don't contain the anchor — the agent cited the wrong
          // location. Relocate the citation to the actual evidence and expand to
          // include adjacent lines so source_context is broader than the anchor alone.
          // Without surrounding context, sourceContext === sourceMatch → the API's search
          // has no enclosing phrase to narrow → pageText fallback → partial_text_found.
          const { lineId, pageId } = found;
          const neighborIds = [lineId - 1, lineId, lineId + 1].filter(id => id > 0);
          const neighborTexts: string[] = [];
          const resolvedIds: number[] = [];
          for (const id of neighborIds) {
            // Only use the qualified (page-scoped) key. byId is global across pages for
            // deepTextPages sources, so falling back to it for neighbor IDs can silently
            // pull in lines from an adjacent page if id crosses a page boundary.
            const text = lineMap.qualified.get(`${pageId}:${id}`);
            if (text) {
              neighborTexts.push(text);
              resolvedIds.push(id);
            }
          }
          if (neighborTexts.length > 1) {
            citation.source_context = neighborTexts.join(" ");
            citation.page_id = toCompactPageId(pageId);
            citation.line_ids = resolvedIds;
          }
        }
      }

      hydrated++;
    } else {
      // Line ID lookup failed (wrong IDs) or line_ids was omitted. Fall back to
      // anchor-text search to derive the correct location from source_match alone.
      // When the LLM provided a page_id hint, search that page first before
      // falling back to the full document — this resolves ambiguous anchors that
      // appear on multiple pages (e.g. a repeated term in a definitions section).
      if (citation.source_match) {
        const allLines = getAllLines(lineMap);
        const hintPageId = citation.page_id ? (parsePageId(citation.page_id).startPageId ?? "") : "";
        const pageLines = hintPageId ? allLines.filter(l => l.pageId === hintPageId) : [];
        const found =
          (pageLines.length > 0 ? findAnchorWithFallback(citation.source_match, pageLines) : null) ??
          findAnchorWithFallback(citation.source_match, allLines);
        if (found) {
          // Preserve the original source_match as claim_text before overwriting,
          // mirroring the paraphrase-promotion pattern in the successful hydration path.
          if (!citation.claim_text) citation.claim_text = citation.source_match;
          citation.source_match = found.verbatimAnchor;
          // Update page_id and include adjacent lines so source_context is broader than
          // source_match alone. Without surrounding context the API cannot compute the
          // anchor highlight position and falls back to pageText → partial_text_found.
          citation.page_id = toCompactPageId(found.pageId);
          const neighborIds = [found.lineId - 1, found.lineId, found.lineId + 1].filter(id => id > 0);
          const neighborTexts: string[] = [];
          const resolvedIds: number[] = [];
          for (const id of neighborIds) {
            // Only use the qualified (page-scoped) key — same reason as the wrong-page
            // path above: byId is global for deepTextPages and can bleed across pages.
            const text = lineMap.qualified.get(`${found.pageId}:${id}`);
            if (text) {
              neighborTexts.push(text);
              resolvedIds.push(id);
            }
          }
          citation.source_context = neighborTexts.length > 1 ? neighborTexts.join(" ") : found.verbatimAnchor;
          citation.line_ids = resolvedIds.length > 0 ? resolvedIds : [found.lineId];
          hydrated++;
          continue;
        }
      }
      if (warnOnMiss) {
        const detail =
          lineIds.length > 0
            ? `line_ids [${lineIds.join(", ")}] not found`
            : "no line_ids provided and anchor-text search failed";
        console.error(`  Citation ${citation.id}: ${detail} in summary`);
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
 *   2. `.deepcitation/summary-*.txt`  — legacy text+JSON output from `prepare --text`
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
  // Never fall back to mtime guessing — a wrong summary produces wrong source_contexts.
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
 * Reads compact citations (missing source_context), fills in source_context from
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
