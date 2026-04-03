/**
 * Section merge utility.
 *
 * Merges two parallel-generated section files (Agent A and Agent B) into a
 * single draft ready for `verify`. Performs all deterministic post-processing
 * that the LLM would otherwise have to do in-context:
 *
 *   1. Renumber Agent B's citations (IDs ≥ 100 → N + id − 99, where N = max A id)
 *   2. Deduplicate cross-section citations that share a (pageId, lineId) pair
 *   3. Concatenate the two section bodies
 *   4. Emit a single merged <<<CITATION_DATA>>> block
 *
 * Moving this out of the LLM saves ~40–60 s of Haiku generation and eliminates
 * a class of renumber/dedup errors caused by in-context arithmetic mistakes.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCitationData, parsePageId } from "../parsing/citationParser.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER, type CitationData } from "../prompts/citationPrompts.js";
import { sanitizeForLog } from "../utils/logSafety.js";
import { die, parseArgs } from "./cliUtils.js";

export const MERGE_HELP = `Usage: deepcitation merge [options]

Merge two parallel-generated section files into a single verified draft.

Agent A starts its citation IDs at 1. Agent B starts at 100 (to avoid
collisions). This command renumbers B's IDs to continue from A's maximum,
deduplicates citations that reference the same line in the evidence, and
concatenates the two section bodies into one file.

Options:
  --a <file>    Path to Agent A section file (IDs starting at 1)
  --b <file>    Path to Agent B section file (IDs starting at 100)
  --out <file>  Output path for the merged draft
  -h, --help    Show this help message

Example:
  deepcitation merge --a .deepcitation/section-a.md --b .deepcitation/section-b.md --out .deepcitation/draft.md
`;

export interface MergeOptions {
  sectionAContent: string;
  sectionBContent: string;
}

export interface MergeResult {
  mergedContent: string;
  aCount: number;
  bOrigCount: number;
  bRenumbered: number;
  bDeduped: number;
  bFinal: number;
}

/**
 * Builds the qualified dedup key for a citation line: "normalizedPageId:lineId".
 * Normalises both compact ("1_0") and verbose ("page_number_1_index_0") page IDs
 * to a consistent form so cross-agent comparisons work regardless of which format
 * each sub-agent happened to output.
 */
function qualKey(pageId: string | undefined, lineId: number): string {
  const { startPageId } = parsePageId(pageId ?? "");
  return `${startPageId ?? ""}:${lineId}`;
}

/**
 * Converts a parsed CitationData back to compact JSON output format.
 * Preserves full_phrase when present (hydrated citations) so downstream
 * verify does not need to re-hydrate.
 */
function toCompact(c: CitationData): Record<string, unknown> {
  const out: Record<string, unknown> = { n: c.id };
  if (c.anchor_text) out.k = c.anchor_text;
  if (c.page_id) out.p = c.page_id;
  if (c.line_ids?.length) out.l = c.line_ids;
  if (c.full_phrase) out.f = c.full_phrase;
  return out;
}

/**
 * Merges Agent A and Agent B section files into a single draft.
 *
 * Agent B citation IDs are expected to start at 100. This function:
 *   1. Renumbers B: id ≥ 100 → N + id − 99  (N = max A id)
 *   2. Deduplicates: any B citation sharing a (pageId, lineId) with an A
 *      citation is dropped; its body cite links are rewritten to A's id.
 *   3. Concatenates bodies and emits one merged CITATION_DATA block.
 */
export function mergeSections({ sectionAContent, sectionBContent }: MergeOptions): MergeResult {
  const parsedA = parseCitationData(sectionAContent);
  const parsedB = parseCitationData(sectionBContent);

  const citesA = parsedA.citations;
  const citesB = parsedB.citations;

  // N = highest id in A (0 if A has no citations)
  const N = citesA.reduce((max, c) => Math.max(max, c.id), 0);

  // --- Step 1: renumber B ---
  // Map old B id → new id. B ids that are < 100 are kept as-is (unusual but safe).
  const renumberMap = new Map<number, number>();
  for (const c of citesB) {
    renumberMap.set(c.id, c.id >= 100 ? N + c.id - 99 : c.id);
  }

  let bodyB = parsedB.visibleText;
  for (const [oldId, newId] of renumberMap) {
    if (oldId !== newId) {
      bodyB = bodyB.replaceAll(`(cite:${oldId})`, `(cite:${newId})`);
    }
  }

  const citesB_renumbered: CitationData[] = citesB.map(c => ({
    ...c,
    id: renumberMap.get(c.id) ?? c.id,
  }));

  // --- Step 2: dedup by (pageId, lineId) ---
  // Build lookup: qualKey → A citation id
  const aLineIndex = new Map<string, number>();
  for (const a of citesA) {
    for (const lid of a.line_ids ?? []) {
      aLineIndex.set(qualKey(a.page_id, lid), a.id);
    }
  }

  const bFinal: CitationData[] = [];
  for (const b of citesB_renumbered) {
    let matchedAId: number | undefined;
    for (const lid of b.line_ids ?? []) {
      const found = aLineIndex.get(qualKey(b.page_id, lid));
      if (found !== undefined) {
        matchedAId = found;
        break;
      }
    }

    if (matchedAId !== undefined) {
      // Replace all occurrences of this B id in bodyB with A's id
      bodyB = bodyB.replaceAll(`(cite:${b.id})`, `(cite:${matchedAId})`);
      // Drop from output (deduplicated)
    } else {
      bFinal.push(b);
    }
  }

  const bDeduped = citesB_renumbered.length - bFinal.length;

  // --- Step 3: build merged output ---
  const mergedBody = `${parsedA.visibleText}\n\n${bodyB}`;
  const mergedCitations = [...citesA, ...bFinal];

  // Group by attachmentId for the output JSON block
  const grouped: Record<string, ReturnType<typeof toCompact>[]> = {};
  for (const c of mergedCitations) {
    const attId = c.attachment_id ?? "unknown";
    if (!grouped[attId]) grouped[attId] = [];
    grouped[attId].push(toCompact(c));
  }

  const citationJson = JSON.stringify(grouped, null, 2);
  const mergedContent = `${mergedBody}\n\n${CITATION_DATA_START_DELIMITER}\n${citationJson}\n${CITATION_DATA_END_DELIMITER}\n`;

  return {
    mergedContent,
    aCount: citesA.length,
    bOrigCount: citesB.length,
    bRenumbered: citesB_renumbered.filter((c, i) => c.id !== citesB[i].id).length,
    bDeduped,
    bFinal: bFinal.length,
  };
}

/**
 * CLI command: merge two section files into one draft.
 */
export function merge(argv: string[]): void {
  const args = parseArgs(argv, MERGE_HELP);

  const aPath = args.a as string | undefined;
  const bPath = args.b as string | undefined;
  const outPath = args.out as string | undefined;

  if (!aPath) die("--a is required", MERGE_HELP);
  if (!bPath) die("--b is required", MERGE_HELP);
  if (!outPath) die("--out is required", MERGE_HELP);

  const resolvedA = resolve(aPath);
  const resolvedB = resolve(bPath);
  const resolvedOut = resolve(outPath);

  if (!existsSync(resolvedA)) die(`File not found: ${sanitizeForLog(aPath)}`, MERGE_HELP);
  if (!existsSync(resolvedB)) die(`File not found: ${sanitizeForLog(bPath)}`, MERGE_HELP);

  const sectionAContent = readFileSync(resolvedA, "utf-8");
  const sectionBContent = readFileSync(resolvedB, "utf-8");

  const result = mergeSections({ sectionAContent, sectionBContent });
  const { aCount, bOrigCount, bDeduped, bFinal } = result;

  writeFileSync(resolvedOut, result.mergedContent, "utf-8");

  console.error(`Merged: ${aCount} A citations + ${bOrigCount} B citations → ${aCount + bFinal} total (${bDeduped} deduped)`);
  console.log(resolvedOut);
}
