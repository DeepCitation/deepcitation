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

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCitationData, parsePageId } from "../parsing/citationParser.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER, type CitationData } from "../prompts/citationPrompts.js";
import { sanitizeForLog } from "../utils/logSafety.js";
import { die, parseArgs } from "./cliUtils.js";

export const HYDRATE_HELP = `Usage: deepcitation hydrate [options]

Fill in full_phrase on citations that are missing it, by looking up line IDs
in a DeepCitation summary file. Produces a hydrated draft ready for verify.

Use this when the draft was generated with the compact citation format
(no full_phrase/reasoning) to reduce LLM output token usage.

Options:
  --markdown <file>   Path to draft markdown file with <<<CITATION_DATA>>> block
  --summary <file>    Path to summary file from "deepcitation prepare --summary"
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
const LINE_TAG_RE = /<line id="(\d+)">([\s\S]*?)<\/line>/g;

interface LineMap {
  /** Qualified key: "page_number_N_index_I:lineId" → line text */
  qualified: Map<string, string>;
  /** Fallback: lineId → line text (last-write wins for multi-page docs) */
  byId: Map<number, string>;
}

export interface HydrateOptions {
  /** Raw content of the summary file (JSON string from deepcitation prepare --summary) */
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
 *   { "attachmentId": "...", "deepTextPromptPortion": "..." }
 *
 * deepTextPromptPortion format:
 *   <page_number_1_index_0>
 *   <line id="1">Line text here</line>
 *   <line id="2">Another line</line>
 *   ...
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
  try {
    const parsed = JSON.parse(summaryContent) as { deepTextPromptPortion?: unknown };
    deepText = typeof parsed.deepTextPromptPortion === "string" ? parsed.deepTextPromptPortion : "";
  } catch {
    throw new Error("Summary file is not valid JSON");
  }

  if (!deepText) return { qualified, byId };

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
    lastIndex = pageMatch.index! + pageMatch[0].length;
  }

  // Process remaining text after the last page tag
  if (lastIndex < deepText.length && currentPageId) {
    extractLines(deepText.slice(lastIndex), currentPageId, qualified, byId);
  }

  return { qualified, byId };
}

/** Extract <line id="N">text</line> entries from a page segment. */
function extractLines(
  segment: string,
  pageId: string,
  qualified: Map<string, string>,
  byId: Map<number, string>,
): void {
  for (const lineMatch of segment.matchAll(LINE_TAG_RE)) {
    const lineId = parseInt(lineMatch[1], 10);
    const lineText = lineMatch[2].trim();
    qualified.set(`${pageId}:${lineId}`, lineText);
    byId.set(lineId, lineText);
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
      hydrated++;
    } else {
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
 * Looks for `.deepcitation/summary-*.txt` in the current working directory.
 * Returns the path of the single summary file found, or the newest by mtime
 * if multiple exist. Returns null if none found.
 */
export function findSummaryForMarkdown(_mdPath: string): string | null {
  const dcDir = join(process.cwd(), ".deepcitation");
  if (!existsSync(dcDir)) return null;

  let entries: string[];
  try {
    entries = readdirSync(dcDir).filter(f => f.startsWith("summary-") && f.endsWith(".txt"));
  } catch {
    return null;
  }

  if (entries.length === 0) return null;
  if (entries.length === 1) return join(dcDir, entries[0]);

  // Multiple summaries — return newest by mtime
  return entries
    .map(f => ({ path: join(dcDir, f), mtime: statSync(join(dcDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].path;
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
  if (!existsSync(resolved)) die(`File not found: ${sanitizeForLog(mdPath)}`, HYDRATE_HELP);

  const resolvedSummary = resolve(summaryPath);
  if (!existsSync(resolvedSummary)) die(`Summary file not found: ${sanitizeForLog(summaryPath)}`, HYDRATE_HELP);

  const raw = readFileSync(resolved, "utf-8");
  const parsed = parseCitationData(raw);
  if (!parsed.success || parsed.citations.length === 0) {
    die("No valid <<<CITATION_DATA>>> block found in the markdown file.", HYDRATE_HELP);
  }

  let result: HydrateResult = { hydrated: 0, misses: [] };
  try {
    result = hydrateCitations({
      summaryContent: readFileSync(resolvedSummary, "utf-8"),
      citations: parsed.citations,
      warnOnMiss: true,
    });
  } catch (err) {
    die(
      `Failed to parse summary file: ${err instanceof Error ? err.message : String(err)}`,
      HYDRATE_HELP,
    );
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
