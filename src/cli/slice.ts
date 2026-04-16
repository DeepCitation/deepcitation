/**
 * `deepcitation slice <prepare.json>` — split an existing `prepare-<name>.json`
 * file into N overlapping chunks of tagged text so parallel verify subagents
 * can operate on disjoint-but-overlapping page ranges.
 *
 * Replaces the 25-line Python splitter the `verify` skill used to recommend
 * (SKILL.md Phase 2) plus the `grep -c '<page_number_'` handshake — the
 * inline tag-count validator asserts chunk integrity and the JSON manifest
 * tells the agent exactly which pages each chunk covers.
 *
 * Read-only: no network, no auth.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeForLog } from "../utils/logSafety.js";
import { die, normalizeShortFlags, parseArgs } from "./cliUtils.js";
import { countTags, parseFormatMode, parseLineIdsMode, renderTextStream } from "./textRender.js";

export const SLICE_HELP = `Usage: deepcitation slice <prepare-file.json> [options]

Split an existing prepare JSON file into N overlapping tagged-text chunks so
parallel verify subagents can operate on disjoint page ranges. Writes the
chunks to <out-dir> and prints a JSON manifest to stdout.

Arguments:
  <prepare-file.json>        Path to the prepare-<name>.json written by
                             \`deepcitation prepare <file> --out <path>\`.

Options:
  -n, --parts <N>            Number of chunks to produce (default: 2)
      --overlap <N>          Shared pages at each boundary (default: 2)
      --prefix <name>        File prefix (default: evidence)
  -o, --out <dir>            Output directory (default: .deepcitation)
  -f, --format <mode>        txt | plain | json (default: txt)
  -l, --line-ids <mode>      default | none | every=1..5 | all (default: default)

Output:
  <out>/<prefix>-a.txt
  <out>/<prefix>-b.txt
  ...
  JSON manifest on stdout with pageRange, pageCount, and tagsEmitted per chunk.

Examples:
  deepcitation slice .deepcitation/prepare-paper.json -n 2
  deepcitation slice .deepcitation/prepare-paper.json -n 3 --overlap 1 -l every=1
`;

/**
 * Compute zero-based [start, end] inclusive page indices for each chunk.
 *
 * Base chunk size is `floor(totalPages / parts)`, remainder distributed to
 * the earliest chunks, overlap extends each chunk's end by `overlap` pages
 * (clamped to the document). The last chunk does NOT get overlap extended
 * because there's no "next" chunk to bridge into.
 */
export function computeChunkRanges(
  totalPages: number,
  parts: number,
  overlap: number,
): Array<{ start: number; end: number }> {
  if (parts < 1) throw new Error("parts must be >= 1");
  if (totalPages < 1) throw new Error("totalPages must be >= 1");
  if (overlap < 0) throw new Error("overlap must be >= 0");

  const base = Math.floor(totalPages / parts);
  const remainder = totalPages % parts;

  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (let i = 0; i < parts; i++) {
    const size = base + (i < remainder ? 1 : 0);
    if (size === 0) continue;
    const start = cursor;
    const endExclusive = cursor + size;
    cursor = endExclusive;
    // Extend into the next chunk by `overlap` pages, except the final chunk.
    const isLast = i === parts - 1;
    const extendedEnd = isLast ? endExclusive : Math.min(totalPages, endExclusive + overlap);
    ranges.push({ start, end: extendedEnd - 1 });
  }
  return ranges;
}

/**
 * Generate sequential part suffixes: a, b, c, ... z, aa, ab, ...
 * Deterministic and stable across runs — the same input produces the same
 * file names so cached `verify` runs can be keyed off the chunk file path.
 */
function partSuffix(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

interface PrepareFile {
  attachmentId?: string;
  deepTextPages?: string[];
  metadata?: { pageCount?: number };
}

export function slice(argv: string[]): void {
  const normalized = normalizeShortFlags(argv);
  // parseArgs handles -h/--help and exits cleanly before we check for a positional.
  const args = parseArgs(normalized, SLICE_HELP);

  const positional = normalized.find(a => !a.startsWith("-"));
  if (!positional) die("A prepare-<name>.json path is required", SLICE_HELP);

  const partsRaw = args.parts;
  const parts = partsRaw === undefined ? 2 : parseInt(partsRaw, 10);
  if (!Number.isFinite(parts) || parts < 1) {
    die(`--parts must be a positive integer (got ${sanitizeForLog(partsRaw ?? "")})`, SLICE_HELP);
  }

  const overlapRaw = args.overlap;
  const overlap = overlapRaw === undefined ? 2 : parseInt(overlapRaw, 10);
  if (!Number.isFinite(overlap) || overlap < 0) {
    die(`--overlap must be >= 0 (got ${sanitizeForLog(overlapRaw ?? "")})`, SLICE_HELP);
  }

  const prefix = args.prefix ?? "evidence";
  const outDir = resolve(args.out ?? ".deepcitation");
  const format = parseFormatMode(args.format, "txt", SLICE_HELP);
  if (format === "json") {
    die("--format json is not supported by slice (use prepare default JSON output instead)", SLICE_HELP);
  }
  const lineIdsMode = parseLineIdsMode(args["line-ids"], SLICE_HELP);

  const inputPath = resolve(positional);
  if (!existsSync(inputPath)) die(`Prepare file not found: ${sanitizeForLog(positional)}`, SLICE_HELP);

  let parsed: PrepareFile;
  try {
    parsed = JSON.parse(readFileSync(inputPath, "utf8")) as PrepareFile;
  } catch (err) {
    die(`Failed to parse prepare file: ${err instanceof Error ? err.message : String(err)}`, SLICE_HELP);
  }

  const pages = parsed.deepTextPages ?? [];
  if (pages.length === 0) die("Prepare file contains no deepTextPages", SLICE_HELP);
  if (parts > pages.length) {
    die(`--parts ${parts} exceeds page count ${pages.length}`, SLICE_HELP);
  }

  const ranges = computeChunkRanges(pages.length, parts, overlap);

  const manifestParts: Array<{
    file: string;
    pageRange: [number, number];
    pageCount: number;
    tagsEmitted: { pageTags: number; lineTags: number };
  }> = [];

  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i];
    const chunkPages = pages.slice(start, end + 1);
    const body = renderTextStream(chunkPages, format, lineIdsMode);
    const filename = `${prefix}-${partSuffix(i)}.${format === "plain" ? "txt" : format}`;
    const filePath = resolve(outDir, filename);

    writeFileSync(filePath, body);

    const emitted = countTags(body);
    // Only assert page-tag integrity in `txt` mode — `plain` strips them.
    if (format === "txt" && emitted.pageTags !== chunkPages.length) {
      die(
        `Tag count mismatch in ${filePath}: expected ${chunkPages.length} page tags, got ${emitted.pageTags}. ` +
          `This usually means the prepare file was edited by hand.`,
        SLICE_HELP,
      );
    }

    manifestParts.push({
      file: filePath,
      pageRange: [start + 1, end + 1],
      pageCount: chunkPages.length,
      tagsEmitted: emitted,
    });
  }

  const manifest = {
    attachmentId: parsed.attachmentId,
    totalPages: pages.length,
    parts: manifestParts,
  };

  console.log(JSON.stringify(manifest, null, 2));
}
