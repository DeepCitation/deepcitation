/**
 * Citation-syntax validator. Read-only, no network, no auth.
 *
 * Runs a pre-flight check over a section or merged markdown file so an agent
 * can catch citation-format bugs before paying for `merge` or `verify`. The
 * same parser that `merge.ts` and `verify` use (parseCitationData) is reused
 * here, so any rule the rest of the pipeline enforces can be mirrored here
 * deterministically.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCitationData } from "../parsing/citationParser.js";
import type { CitationData } from "../prompts/citationPrompts.js";
import { CITATION_DATA_START_DELIMITER } from "../prompts/citationPrompts.js";
import { sanitizeForLog } from "../utils/logSafety.js";
import { die } from "./cliUtils.js";

export const LINT_HELP = `Usage: deepcitation lint <section-file> [options]

Pre-flight citation-syntax validator. Reads a section or merged markdown file
and reports any citation-format problems that would cause verify to mis-match
or fail. Runs entirely locally — no network, no auth, no API call.

Arguments:
  <section-file>            Path to a .md file containing citation markers
                            and a <<<CITATION_DATA>>> block.

Options:
  --strict                  Treat warnings as errors (exit 1 on any finding)
  --json                    Emit machine-readable JSON to stdout
  -h, --help                Show this help message

Exit codes:
  0  no errors (warnings are allowed unless --strict)
  1  at least one error, or --strict with warnings

Examples:
  deepcitation lint .deepcitation/section-a.md
  deepcitation lint .deepcitation/draft.md --strict
  deepcitation lint .deepcitation/draft.md --json
`;

export type LintSeverity = "ERR" | "WARN";

export interface LintFinding {
  severity: LintSeverity;
  rule: string;
  message: string;
  citationId?: number;
}

// Local alias so the rest of the file keeps its shorter name.
type Finding = LintFinding;

interface LintReport {
  file: string;
  errors: Finding[];
  warnings: Finding[];
  citationCount: number;
}

// ── rule thresholds ───────────────────────────────────────────────
// Scan-anchor brevity limits (see packages/deepcitation/docs/agents/deep-citation-standards.md §1).
const K_MAX_WORDS = 4;
const K_MAX_CHARS = 40;

// ── public entry point ───────────────────────────────────────────

export function lint(argv: string[]): void {
  const strict = argv.includes("--strict");
  const jsonOut = argv.includes("--json");
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(LINT_HELP);
    process.exit(0);
  }

  const positional = argv.find(a => !a.startsWith("-"));
  if (!positional) die("section file path is required", LINT_HELP);

  const resolved = resolve(positional);
  if (!existsSync(resolved)) die(`File not found: ${sanitizeForLog(positional)}`, LINT_HELP);

  const content = readFileSync(resolved, "utf-8");
  const findings = runChecks(content);

  // Strict mode promotes warnings to errors for exit code purposes.
  const errors = findings.filter(f => f.severity === "ERR" || (strict && f.severity === "WARN"));
  const warnings = strict ? [] : findings.filter(f => f.severity === "WARN");

  const report: LintReport = {
    file: positional,
    errors,
    warnings,
    citationCount: countCitations(content),
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

// ── check runner ─────────────────────────────────────────────────

/**
 * Run all citation-syntax checks against a raw file body. Exported so
 * `publish --lint` can reuse the same ruleset against the verified HTML
 * before uploading, without shelling out to the `lint` subcommand.
 */
export function runCitationLintChecks(content: string): LintFinding[] {
  return runChecks(content);
}

function runChecks(content: string): Finding[] {
  const findings: Finding[] = [];

  // Rule 8 — code-fenced CITATION_DATA block.
  findings.push(...checkCodeFence(content));

  // Bail out early if there's no CITATION_DATA block at all: the rest of the
  // rules assume a parseable block. A missing block when the body has markers
  // is its own error.
  if (!content.includes(CITATION_DATA_START_DELIMITER)) {
    if (hasAnyMarker(content)) {
      findings.push({
        severity: "ERR",
        rule: "missing-block",
        message: "body contains citation markers but has no <<<CITATION_DATA>>> block",
      });
    }
    return findings;
  }

  const parsed = parseCitationData(content);
  if (!parsed.success) {
    findings.push({
      severity: "ERR",
      rule: "parse",
      message: parsed.error ?? "failed to parse <<<CITATION_DATA>>> block",
    });
    return findings;
  }

  const { citations, visibleText } = parsed;

  findings.push(...checkUniqueIds(citations));
  for (const c of citations) {
    findings.push(...checkCitation(c));
  }
  findings.push(...checkMarkers(visibleText, citations));
  findings.push(...checkMarkerAdjacency(visibleText));
  findings.push(...checkFormat2Mismatch(visibleText, citations));

  return findings;
}

// ── rule 8: code fence around CITATION_DATA ──────────────────────

const FENCE_OPEN_RE = /```(?:json)?\s*\r?\n\s*<<<CITATION_DATA>>>/;
const FENCE_CLOSE_RE = /<<<END_CITATION_DATA>>>\s*\r?\n\s*```/;

function checkCodeFence(content: string): Finding[] {
  const findings: Finding[] = [];
  if (FENCE_OPEN_RE.test(content)) {
    findings.push({
      severity: "ERR",
      rule: "code-fence",
      message: "<<<CITATION_DATA>>> is wrapped in a markdown code fence — the parser treats it as body text",
    });
  }
  if (FENCE_CLOSE_RE.test(content)) {
    findings.push({
      severity: "ERR",
      rule: "code-fence",
      message: "<<<END_CITATION_DATA>>> is followed by a closing code fence — strip the fence",
    });
  }
  return findings;
}

// ── rule 2: unique n ─────────────────────────────────────────────

function checkUniqueIds(citations: CitationData[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Map<number, number>();
  for (const c of citations) {
    seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      findings.push({
        severity: "ERR",
        rule: "unique-n",
        message: `duplicate citation id ${id} (appears ${count} times)`,
        citationId: id,
      });
    }
  }
  return findings;
}

// ── per-citation rules ───────────────────────────────────────────

const PAGE_ID_COMPACT_RE = /^\d+_\d+$/;
const PAGE_ID_VERBOSE_RE = /^page_number_\d+_index_\d+$/;

function checkCitation(c: CitationData): Finding[] {
  const findings: Finding[] = [];
  const k = c.source_match;
  const f = c.source_context;

  // Rule 3: k brevity (≤4 words AND ≤40 chars)
  if (k !== undefined) {
    if (k.length > 0) {
      const wordCount = k.trim().split(/\s+/).length;
      if (wordCount > K_MAX_WORDS) {
        findings.push({
          severity: "WARN",
          rule: "k-words",
          message: `k has ${wordCount} words (>${K_MAX_WORDS}): ${quote(k)}`,
          citationId: c.id,
        });
      }
      if (k.length > K_MAX_CHARS) {
        findings.push({
          severity: "WARN",
          rule: "k-chars",
          message: `k is ${k.length} chars (>${K_MAX_CHARS}): ${quote(k)}`,
          citationId: c.id,
        });
      }
    }
  }

  // Rule 4: k contiguous substring of f
  if (k && f) {
    if (!f.includes(k)) {
      findings.push({
        severity: "ERR",
        rule: "k-not-in-f",
        message: `k is not a substring of f: k=${quote(k)} f=${quote(truncate(f, 80))}`,
        citationId: c.id,
      });
    }
  }

  // Rule 6: line_ids non-empty integer array
  if (!c.line_ids || c.line_ids.length === 0) {
    findings.push({
      severity: "WARN",
      rule: "l-empty",
      message: `citation ${c.id} has no line_ids (l)`,
      citationId: c.id,
    });
  } else {
    const bad = c.line_ids.filter(n => !Number.isInteger(n) || n < 0);
    if (bad.length > 0) {
      findings.push({
        severity: "ERR",
        rule: "l-format",
        message: `citation ${c.id} has non-integer line_ids: ${JSON.stringify(bad)}`,
        citationId: c.id,
      });
    }
  }

  // Rule 7: page_id format
  if (c.page_id === undefined || c.page_id === "") {
    findings.push({
      severity: "WARN",
      rule: "p-missing",
      message: `citation ${c.id} has no page_id (p)`,
      citationId: c.id,
    });
  } else if (!PAGE_ID_COMPACT_RE.test(c.page_id) && !PAGE_ID_VERBOSE_RE.test(c.page_id)) {
    findings.push({
      severity: "ERR",
      rule: "p-format",
      message: `citation ${c.id} page_id does not match "N_I" or "page_number_N_index_I": ${quote(c.page_id)}`,
      citationId: c.id,
    });
  }

  return findings;
}

// ── rule 1: every body marker has a matching citation ────────────

// Format 1: **bold** [N]
const FMT1_RE = /\*\*([^*\n]+)\*\*\s*\[(\d+)\]/g;
// Format 2: [label](cite:N) or [label](cite:N 'k') or [label](cite:N "k")
const FMT2_RE = /\[([^\][]+)\]\(cite:(\d+)(?:\s+(?:'([^']*)'|"([^"]*)"))?\)/g;
// Any [N] marker (catches bare markers that don't fit either format above)
const BARE_MARKER_RE = /\[(\d+)\]/g;

function collectMarkerIds(body: string): Set<number> {
  const ids = new Set<number>();
  for (const m of body.matchAll(FMT1_RE)) ids.add(parseInt(m[2], 10));
  for (const m of body.matchAll(FMT2_RE)) ids.add(parseInt(m[2], 10));
  for (const m of body.matchAll(BARE_MARKER_RE)) ids.add(parseInt(m[1], 10));
  return ids;
}

function checkMarkers(visibleText: string, citations: CitationData[]): Finding[] {
  const findings: Finding[] = [];
  const markerIds = collectMarkerIds(visibleText);
  const citationIds = new Set(citations.map(c => c.id));

  for (const id of markerIds) {
    if (!citationIds.has(id)) {
      findings.push({
        severity: "ERR",
        rule: "orphan-marker",
        message: `body marker [${id}] has no matching entry in <<<CITATION_DATA>>>`,
        citationId: id,
      });
    }
  }
  for (const id of citationIds) {
    if (!markerIds.has(id)) {
      findings.push({
        severity: "WARN",
        rule: "orphan-citation",
        message: `citation ${id} in CITATION_DATA has no matching body marker`,
        citationId: id,
      });
    }
  }
  return findings;
}

// ── rule 5: [N] adjacency to closing ** ──────────────────────────

// Greedy match from a closing ** up to the next [N], on the same line.
// Anything between them that isn't pure whitespace is an adjacency violation.
const FMT1_LOOSE_RE = /\*\*([^*\n]+)\*\*([^\n[]*?)\[(\d+)\]/g;

function checkMarkerAdjacency(visibleText: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of visibleText.matchAll(FMT1_LOOSE_RE)) {
    const between = m[2];
    if (between.trim().length === 0) continue; // whitespace-only is fine
    const id = parseInt(m[3], 10);
    findings.push({
      severity: "WARN",
      rule: "marker-adjacency",
      message: `[${id}] not immediately adjacent to closing **; intervening text: ${quote(between)}`,
      citationId: id,
    });
  }
  return findings;
}

// ── rule 9: Format-2 tick-quoted k mismatch (WARN) ──────────────

function checkFormat2Mismatch(visibleText: string, citations: CitationData[]): Finding[] {
  const findings: Finding[] = [];
  const byId = new Map(citations.map(c => [c.id, c]));
  for (const m of visibleText.matchAll(FMT2_RE)) {
    const id = parseInt(m[2], 10);
    const quotedK = m[3] ?? m[4]; // single or double quoted
    if (!quotedK) continue; // format-2 without explicit k is fine
    const c = byId.get(id);
    if (!c || !c.source_match) continue;
    if (c.source_match !== quotedK) {
      findings.push({
        severity: "WARN",
        rule: "fmt2-k-mismatch",
        message: `format-2 tick-quoted k ${quote(quotedK)} does not match CITATION_DATA k ${quote(c.source_match)}`,
        citationId: id,
      });
    }
  }
  return findings;
}

// ── helpers ──────────────────────────────────────────────────────

function hasAnyMarker(content: string): boolean {
  return /\[\d+\]/.test(content);
}

function countCitations(content: string): number {
  if (!content.includes(CITATION_DATA_START_DELIMITER)) return 0;
  const parsed = parseCitationData(content);
  return parsed.success ? parsed.citations.length : 0;
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "...";
}

function printHuman(report: LintReport): void {
  const { file, errors, warnings, citationCount } = report;
  const total = errors.length + warnings.length;

  if (total === 0) {
    console.error(`lint: ${file}`);
    console.error(`  OK   ${citationCount} citation${citationCount === 1 ? "" : "s"}`);
    return;
  }

  console.error(`lint: ${file}`);
  for (const e of errors) {
    console.error(`  ERR  ${formatFinding(e)}`);
  }
  for (const w of warnings) {
    console.error(`  WARN ${formatFinding(w)}`);
  }
  console.error(
    `  ${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"} across ${citationCount} citation${citationCount === 1 ? "" : "s"}`,
  );
}

function formatFinding(f: Finding): string {
  const id = f.citationId !== undefined ? `n=${f.citationId} ` : "";
  return `${f.rule}: ${id}${f.message}`;
}
