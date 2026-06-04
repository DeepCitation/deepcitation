/**
 * Deterministic text rendering primitives shared by `prepare`,
 * `slice`, and `text` subcommands.
 *
 * Everything here is a pure function over strings — no filesystem, no network,
 * no API calls. Keeping these in one place prevents drift between the three
 * entry points and makes the behavior easy to unit-test.
 */

import { sanitizeForLog } from "../utils/logSafety.js";
import { cleanDeepTextPage, removeLineIdMetadata } from "../utils/textCleanup.js";
import { wrapDeepTextLine } from "../deeptext/index.js";
import { die } from "./cliUtils.js";

// ── types ─────────────────────────────────────────────────────────

/**
 * How to emit `<line id="N">` tags in rendered text.
 *
 * - `default` — keep the server's every-5 sampling verbatim (no rewrite).
 * - `none` — strip all `<line id>` tags.
 * - `{ kind: "every", n }` with n ∈ 1..4 — walk the existing every-5 tags,
 *   infer intermediate line numbers from `\n` splits between them, and emit
 *   a new tag at every Nth line (first and last lines are always tagged to
 *   match `addLineIdToText`'s boundary behavior in `pdfTextUtils.ts:56-60`).
 *
 * `every=5` is resolved to `default` before reaching here. N > 5 is rejected
 * by the parser because `hydrate.ts:186-201` assumes every-5 is the ceiling.
 */
export type LineIdsMode = "default" | "none" | { kind: "every"; n: 1 | 2 | 3 | 4 };

export type TextFormat = "json" | "txt" | "plain";

// ── flag parsers ──────────────────────────────────────────────────

/**
 * Parse the `--line-ids` value.
 *
 * Accepted: `default`, `none`, `every=1`..`every=5`, `all` (alias for
 * `every=1`). `every=5` collapses to `default`. `every=N` for N > 5 is
 * rejected because `hydrate.ts` assumes every-5 is the ceiling and sparser
 * tags would widen the `sourceContext` extraction window.
 */
export function parseLineIdsMode(value: string | undefined, help: string = ""): LineIdsMode {
  if (value === undefined || value === "default" || value === "every=5") return "default";
  if (value === "none") return "none";
  if (value === "all") return { kind: "every", n: 1 };
  const m = value.match(/^every=(\d+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 4) return { kind: "every", n: n as 1 | 2 | 3 | 4 };
    if (n === 5) return "default";
    die(`--line-ids every=${n}: rejected (hydrate assumes every-5 is the ceiling)`, help);
  }
  die(`--line-ids: unknown value "${sanitizeForLog(value)}"`, help);
}

export function parseFormatMode(value: string | undefined, fallback: TextFormat, help: string = ""): TextFormat {
  if (value === undefined) return fallback;
  if (value === "json" || value === "txt" || value === "plain") return value;
  die(`--format: unknown value "${sanitizeForLog(value)}" (expected json|txt|plain)`, help);
}

/**
 * Resolves a page spec to a sorted, deduplicated list of zero-based indices.
 *
 * Accepts `all` | `first=N` | `last=N` | comma-separated ranges/singles
 * (`1-5,10`). Ranges are 1-based and inclusive. Out-of-range segments are
 * clamped rather than rejected — callers that need strict matching can
 * compare `result.length` against the request.
 */
export function resolvePageSpec(spec: string | undefined, totalPages: number, help: string = ""): number[] {
  if (!spec || spec === "all") {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const firstMatch = spec.match(/^first=(\d+)$/);
  if (firstMatch) {
    const n = Math.min(parseInt(firstMatch[1], 10), totalPages);
    return Array.from({ length: Math.max(0, n) }, (_, i) => i);
  }
  const lastMatch = spec.match(/^last=(\d+)$/);
  if (lastMatch) {
    const n = Math.min(parseInt(lastMatch[1], 10), totalPages);
    return Array.from({ length: Math.max(0, n) }, (_, i) => totalPages - n + i);
  }

  const picked = new Set<number>();
  for (const part of spec.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = Math.max(1, parseInt(range[1], 10));
      const to = Math.min(totalPages, parseInt(range[2], 10));
      for (let p = from; p <= to; p++) picked.add(p - 1);
      continue;
    }
    if (/^\d+$/.test(trimmed)) {
      const single = parseInt(trimmed, 10);
      if (single >= 1 && single <= totalPages) picked.add(single - 1);
      continue;
    }
    die(`--pages: unrecognized segment "${sanitizeForLog(trimmed)}"`, help);
  }
  if (picked.size === 0) die(`--pages: "${sanitizeForLog(spec)}" matched no pages`, help);
  return [...picked].sort((a, b) => a - b);
}

// ── line-id re-tagger ─────────────────────────────────────────────

interface TaggedLine {
  id: number;
  text: string;
  start: number;
  end: number;
}

function findTaggedLines(page: string): TaggedLine[] {
  const tags: TaggedLine[] = [];
  for (const m of page.matchAll(/<line id="(\d+)">([\s\S]*?)<\/line>/g)) {
    tags.push({
      id: parseInt(m[1], 10),
      text: m[2],
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }
  return tags;
}

/**
 * Re-tag a page at every Nth line, given that the server already inserted
 * every-5 tags. Inference for intermediate IDs mirrors `hydrate.ts:186-201`:
 * split the raw text between two consecutive tagged lines by `\n`, keep
 * non-empty entries, and assign ID curr+1, curr+2, … up to `gap` slots.
 *
 * First and last line IDs are always tagged so downstream tooling can still
 * recover page boundaries without counting.
 *
 * Pages without any existing tags are returned unchanged — we have no way to
 * infer line IDs and guessing is worse than leaving the text alone.
 */
export function retagEveryN(page: string, n: 1 | 2 | 3 | 4): string {
  const tags = findTaggedLines(page);
  if (tags.length === 0) return page;

  const lines: Array<{ id: number; text: string }> = [];
  for (let i = 0; i < tags.length; i++) {
    const curr = tags[i];
    lines.push({ id: curr.id, text: curr.text });

    const next = tags[i + 1];
    if (!next) break;

    const gap = next.id - curr.id - 1;
    if (gap <= 0) continue;

    const betweenText = page.slice(curr.end, next.start);
    const rawLines = betweenText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const count = Math.min(rawLines.length, gap);
    for (let j = 0; j < count; j++) {
      lines.push({ id: curr.id + j + 1, text: rawLines[j] });
    }
  }

  const firstId = lines[0]?.id ?? 0;
  const lastId = lines[lines.length - 1]?.id ?? 0;
  const body = lines
    .map(({ id, text }) => {
      const tag = id === firstId || id === lastId || id % n === 0;
      return tag ? (wrapDeepTextLine(id, text) ?? text) : text;
    })
    .join("\n");

  const prefix = page.slice(0, tags[0].start);
  const suffix = page.slice(tags[tags.length - 1].end);
  return prefix + body + suffix;
}

// ── renderers ─────────────────────────────────────────────────────

export function applyLineIds(page: string, mode: LineIdsMode): string {
  if (mode === "default") return page;
  if (mode === "none") return removeLineIdMetadata(page);
  return retagEveryN(page, mode.n);
}

/**
 * Renders a subset of `deepTextPages` as a single concatenated text stream.
 *
 * - `txt` preserves `<page_number_...>` wrappers and `<line id>` tags (subject
 *   to `lineIds` mode), joining pages with `\n`. This is the LLM-default
 *   output for `prepare`, `text`, and `slice`.
 * - `plain` strips both page wrappers and line tags via `cleanDeepTextPage`,
 *   then joins pages with a blank-line separator so prose stays readable.
 */
export function renderTextStream(pages: string[], format: Exclude<TextFormat, "json">, lineIds: LineIdsMode): string {
  if (format === "plain") {
    return pages.map(cleanDeepTextPage).join("\n\n");
  }
  return pages.map(p => applyLineIds(p, lineIds)).join("\n");
}

// ── tag counters ──────────────────────────────────────────────────

/**
 * Count `<page_number_N_index_I>` and `<line id="K">` tags in a rendered
 * string. Used by `slice` to assert that a chunk file actually contains the
 * expected number of tags before declaring success (absorbs the skill's
 * `grep -c '<page_number_' evidence-b.txt` handshake into the CLI).
 */
export function countTags(text: string): { pageTags: number; lineTags: number } {
  const pageTags = (text.match(/<page_number_\d+_index_\d+>/g) ?? []).length;
  const lineTags = (text.match(/<line id="\d+">/g) ?? []).length;
  return { pageTags, lineTags };
}
