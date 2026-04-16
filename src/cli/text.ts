/**
 * `deepcitation text <prepare.json>` — re-render an already-prepared JSON
 * file as txt/plain text with a specific page spec and line-id sampling,
 * without hitting the network or re-uploading the document.
 *
 * Thin wrapper over `renderTextStream` — lets an agent slice text multiple
 * ways (different `-l` or `-p` combinations) without paying for multiple
 * `prepare` API calls.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeForLog } from "../utils/logSafety.js";
import { die, normalizeShortFlags, parseArgs } from "./cliUtils.js";
import { parseFormatMode, parseLineIdsMode, renderTextStream, resolvePageSpec } from "./textRender.js";

export const TEXT_HELP = `Usage: deepcitation text <prepare-file.json> [options]

Re-render the text of an already-prepared JSON file with different flags —
no network, no auth, no re-upload. Emits to stdout by default.

Arguments:
  <prepare-file.json>        Path to the prepare-<name>.json written by
                             \`deepcitation prepare <file> --out <path>\`.

Options:
  -p, --pages <spec>         Page spec: "1-5,10" | "first=10" | "last=10" | "all"
  -l, --line-ids <mode>      default | none | every=1..5 | all (default: default)
  -f, --format <mode>        txt | plain (default: txt)
  -o, --out <path>           Write to file instead of stdout

Examples:
  deepcitation text .deepcitation/prepare-paper.json -p first=3 -l every=1
  deepcitation text .deepcitation/prepare-paper.json -f plain -o paper.txt
`;

interface PrepareFile {
  attachmentId?: string;
  deepTextPages?: string[];
}

export function text(argv: string[]): void {
  const normalized = normalizeShortFlags(argv);
  const args = parseArgs(normalized, TEXT_HELP);

  const positional = normalized.find(a => !a.startsWith("-"));
  if (!positional) die("A prepare-<name>.json path is required", TEXT_HELP);

  const format = parseFormatMode(args.format, "txt", TEXT_HELP);
  if (format === "json") {
    die("--format json is not supported by text (use prepare default JSON output instead)", TEXT_HELP);
  }
  const lineIdsMode = parseLineIdsMode(args["line-ids"], TEXT_HELP);

  const inputPath = resolve(positional);
  if (!existsSync(inputPath)) die(`Prepare file not found: ${sanitizeForLog(positional)}`, TEXT_HELP);

  let parsed: PrepareFile;
  try {
    parsed = JSON.parse(readFileSync(inputPath, "utf8")) as PrepareFile;
  } catch (err) {
    die(`Failed to parse prepare file: ${err instanceof Error ? err.message : String(err)}`, TEXT_HELP);
  }

  const pages = parsed.deepTextPages ?? [];
  if (pages.length === 0) die("Prepare file contains no deepTextPages", TEXT_HELP);

  const pickedIndices = resolvePageSpec(args.pages, pages.length, TEXT_HELP);
  const selected = pickedIndices.map(i => pages[i] as string);

  const body = renderTextStream(selected, format, lineIdsMode);

  if (args.out) {
    const outPath = resolve(args.out);
    writeFileSync(outPath, body);
    console.error(`  Saved: ${outPath}`);
    console.log(outPath);
  } else {
    process.stdout.write(body);
    if (!body.endsWith("\n")) process.stdout.write("\n");
  }
}
