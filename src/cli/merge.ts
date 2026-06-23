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
import { normalizeDeepTextPageId } from "../deeptext/index.js";
import { hasWhitespaceOnlyCitationBlock, parseCitationData } from "../parsing/citationParser.js";
import {
  CITATION_DATA_END_DELIMITER,
  CITATION_DATA_START_DELIMITER,
  type CitationData,
} from "../prompts/citationPrompts.js";
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
  mode: "json" | "body-only";
  /** Parse error from section A's <<<CITATION_DATA>>> block, if any. */
  parseErrorA?: string;
  /** Parse error from section B's <<<CITATION_DATA>>> block, if any. */
  parseErrorB?: string;
}

/**
 * Builds the qualified dedup key for a citation line: "normalizedPageId:lineId".
 * Normalises both compact ("1_0") and verbose ("page_number_1_index_0") page IDs
 * to a consistent form so cross-agent comparisons work regardless of which format
 * each sub-agent happened to output.
 */
function qualKey(pageId: string | undefined, lineId: number): string {
  const { startPageId } = normalizeDeepTextPageId(pageId ?? "");
  return `${startPageId ?? ""}:${lineId}`;
}

/**
 * Converts a parsed CitationData back to compact JSON output format.
 * Preserves source_context when present (hydrated citations) so downstream
 * verify does not need to re-hydrate.
 */
function toCompact(c: CitationData): Record<string, unknown> {
  const out: Record<string, unknown> = { n: c.id };
  if (c.source_match) out.k = c.source_match;
  if (c.page_id) out.p = c.page_id;
  if (c.line_ids?.length) out.l = c.line_ids;
  if (c.source_context) out.f = c.source_context;
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
/**
 * Returns the highest cite:N id in a body string where N is below `limit`.
 * Used to determine where to start renumbering B's ids in body-only mode.
 */
function findMaxCiteId(body: string, limit: number): number {
  // Matches (cite:N), (cite:N "anchor"), and bare [N] markers
  const re = /\(cite:(\d+)(?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?\s*\)/g;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    if (n < limit && n > max) max = n;
  }
  // Also check **bold** [N] markers (Strategy 2c)
  const boldRe = /\*\*[^*]+\*\*\s*\[(\d+)\]/g;
  while ((m = boldRe.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    if (n < limit && n > max) max = n;
  }
  return max;
}

/**
 * Renumbers (cite:N) and (cite:N "anchor") markers in bodyB where N ≥ 100.
 * New id = maxAId + (N − 99). Processes ids descending to avoid substring collision.
 */
function rewriteBCiteIds(bodyB: string, maxAId: number): string {
  const ids = new Set<number>();
  // Collect IDs from (cite:N) markers
  const re = /\(cite:(\d+)(?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyB)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 100) ids.add(n);
  }
  // Collect IDs from **bold** [N] markers (Strategy 2c)
  const boldRe = /\*\*[^*]+\*\*\s*\[(\d+)\]/g;
  while ((m = boldRe.exec(bodyB)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 100) ids.add(n);
  }
  // Sort descending so higher IDs are replaced first (avoids substring collision)
  const sorted = [...ids].sort((a, b) => b - a);
  let result = bodyB;
  for (const oldId of sorted) {
    const newId = maxAId + oldId - 99;
    // Rewrite (cite:N) and (cite:N "anchor") forms
    const oldRe = new RegExp(`\\(cite:${oldId}(\\s+(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'))?\\s*\\)`, "g");
    result = result.replace(oldRe, (_match, title) => `(cite:${newId}${title ?? ""})`);
    // Rewrite **bold** [N] markers
    const boldMarkerRe = new RegExp(`(\\*\\*[^*]+\\*\\*\\s*)\\[${oldId}\\]`, "g");
    result = result.replace(boldMarkerRe, `$1[${newId}]`);
  }
  return result;
}

/**
 * Body-only merge: concatenates two body-only section files (no <<<CITATION_DATA>>> blocks).
 * Renumbers B's (cite:N) markers to continue from A's highest id.
 * Citation JSON is generated separately by `npx deepcitation cite`.
 */
function mergeBodyOnly(bodyA: string, bodyB_raw: string): MergeResult {
  const maxAId = findMaxCiteId(bodyA, 100);
  const bodyB = rewriteBCiteIds(bodyB_raw, maxAId);
  return {
    mergedContent: `${bodyA.trim()}\n\n${bodyB.trim()}`,
    aCount: 0,
    bOrigCount: 0,
    bRenumbered: 0,
    bDeduped: 0,
    bFinal: 0,
    mode: "body-only",
  };
}

export function mergeSections({ sectionAContent, sectionBContent }: MergeOptions): MergeResult {
  // Body-only mode: neither file has a <<<CITATION_DATA>>> block.
  // Just renumber B's cite markers and concatenate — citation JSON is generated
  // by `npx deepcitation cite` in the next pipeline step.
  if (
    !sectionAContent.includes(CITATION_DATA_START_DELIMITER) &&
    !sectionBContent.includes(CITATION_DATA_START_DELIMITER)
  ) {
    return mergeBodyOnly(sectionAContent, sectionBContent);
  }

  const parsedA = parseCitationData(sectionAContent);
  const parsedB = parseCitationData(sectionBContent);

  const parseErrorA = hasWhitespaceOnlyCitationBlock(sectionAContent)
    ? "Empty <<<CITATION_DATA>>> block"
    : parsedA.success
      ? undefined
      : parsedA.error;
  const parseErrorB = hasWhitespaceOnlyCitationBlock(sectionBContent)
    ? "Empty <<<CITATION_DATA>>> block"
    : parsedB.success
      ? undefined
      : parsedB.error;

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
      // Rewrite (cite:N) and (cite:N "anchor") syntaxes
      const oldRe = new RegExp(`\\(cite:${oldId}(\\s+(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'))?\\s*\\)`, "g");
      bodyB = bodyB.replace(oldRe, (_match, title) => `(cite:${newId}${title ?? ""})`);
      // Rewrite **bold** [N] markers (Strategy 2c)
      const boldRe = new RegExp(`(\\*\\*[^*]+\\*\\*\\s*)\\[${oldId}\\]`, "g");
      bodyB = bodyB.replace(boldRe, `$1[${newId}]`);
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
      const dedupRe = new RegExp(`\\(cite:${b.id}(\\s+(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'))?\\s*\\)`, "g");
      bodyB = bodyB.replace(dedupRe, (_match, title) => `(cite:${matchedAId}${title ?? ""})`);
      // Also rewrite **bold** [N] markers (Strategy 2c)
      const boldDedupRe = new RegExp(`(\\*\\*[^*]+\\*\\*\\s*)\\[${b.id}\\]`, "g");
      bodyB = bodyB.replace(boldDedupRe, `$1[${matchedAId}]`);
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
    mode: "json",
    parseErrorA,
    parseErrorB,
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
  const { aCount, bOrigCount, bDeduped, bFinal, mode, parseErrorA, parseErrorB } = result;

  // In json mode, refuse to write output if either section's citation block failed
  // to parse or produced zero citations. Without this gate, a silent parser failure
  // would still produce a "successful" merged body (with an empty CITATION_DATA map)
  // and the caller would only notice downstream when verify ships a citation-less HTML.
  // See plans/noble-skipping-wolf.md for the failure history.
  if (mode === "json") {
    // Only fail on an actual parse error, not on zero citations: a section may
    // legitimately contain no cited claims (parseable `[]`). Empty blocks are
    // detected explicitly so they still fail here even though the parser
    // treats them as recoverable empties for other callers.
    if (parseErrorA !== undefined || parseErrorB !== undefined) {
      const lines: string[] = ["Error: merge refusing to write output — citation parsing failed."];
      if (parseErrorA !== undefined) {
        lines.push(`  A (${sanitizeForLog(aPath)}): ${parseErrorA}`);
      }
      if (parseErrorB !== undefined) {
        lines.push(`  B (${sanitizeForLog(bPath)}): ${parseErrorB}`);
      }
      lines.push("");
      lines.push("Check the section files for:");
      lines.push("  • empty or whitespace-only content between <<<CITATION_DATA>>> and <<<END_CITATION_DATA>>>");
      lines.push("  • markdown code fences (```json) wrapping the JSON with trailing text");
      lines.push("  • missing `n` field on citation objects");
      console.error(lines.join("\n"));
      process.exit(1);
    }
  }

  writeFileSync(resolvedOut, result.mergedContent, "utf-8");

  if (mode === "body-only") {
    console.error(`Merged body-only sections → ${resolvedOut} (run "cite" next to generate citations JSON)`);
  } else {
    console.error(
      `Merged: ${aCount} A citations + ${bOrigCount} B citations → ${aCount + bFinal} total (${bDeduped} deduped)`,
    );
  }
  console.log(resolvedOut);
}
