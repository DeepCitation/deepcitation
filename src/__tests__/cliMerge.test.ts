/**
 * Tests for `deepcitation merge` — the parallel-agent section merger.
 *
 * Covers both the pure `mergeSections()` library fn and the `merge()` CLI wrapper.
 * The CLI wrapper's main job is to refuse to write output when citation parsing
 * fails on either side — without this gate, a silent parse failure would produce
 * a "successful" merged body with an empty CITATION_DATA map, and the caller
 * would only notice downstream when `verify` shipped a citation-less HTML.
 * See plans/noble-skipping-wolf.md for the failure history.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { merge, mergeSections } from "../cli/merge.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "../prompts/citationPrompts.js";

// ── Fixture helpers ─────────────────────────────────────────────────

function sectionWithBlock(body: string, jsonBody: string): string {
  return `${body}\n\n${CITATION_DATA_START_DELIMITER}\n${jsonBody}\n${CITATION_DATA_END_DELIMITER}\n`;
}

const VALID_A = sectionWithBlock(
  "Section A body with **bold term** [1] and **another** [2] and **third** [3].",
  JSON.stringify({
    doc1: [
      { n: 1, k: "bold term", p: "1_0", l: [1, 2] },
      { n: 2, k: "another", p: "1_0", l: [3, 4] },
      { n: 3, k: "third", p: "1_0", l: [5, 6] },
    ],
  }),
);

const VALID_B = sectionWithBlock(
  "Section B body with **extra** [100] and **more** [101].",
  JSON.stringify({
    doc1: [
      { n: 100, k: "extra", p: "2_0", l: [10, 11] },
      { n: 101, k: "more", p: "2_0", l: [12, 13] },
    ],
  }),
);

// ── mergeSections: happy path ───────────────────────────────────────

describe("mergeSections — happy path", () => {
  it("merges two valid section files with compact citation format", () => {
    const result = mergeSections({ sectionAContent: VALID_A, sectionBContent: VALID_B });

    expect(result.mode).toBe("json");
    expect(result.parseErrorA).toBeUndefined();
    expect(result.parseErrorB).toBeUndefined();
    expect(result.aCount).toBe(3);
    expect(result.bOrigCount).toBe(2);
    expect(result.mergedContent).toContain(CITATION_DATA_START_DELIMITER);
    expect(result.mergedContent).toContain(CITATION_DATA_END_DELIMITER);
  });

  it("leaves body-only mode (no citation blocks in either file) untouched", () => {
    const result = mergeSections({
      sectionAContent: "## A\nText (cite:1).",
      sectionBContent: "## B\nMore text (cite:100).",
    });

    expect(result.mode).toBe("body-only");
    expect(result.parseErrorA).toBeUndefined();
    expect(result.parseErrorB).toBeUndefined();
  });
});

// ── mergeSections: silent-failure cases ─────────────────────────────

describe("mergeSections — silent-failure detection", () => {
  it("surfaces parseErrorA when section A has an empty CITATION_DATA block", () => {
    // Whitespace-only content between delimiters is the exact symptom we saw in
    // plans/noble-skipping-wolf.md — before the fix this silently returned 0 citations.
    const emptyA = `## A\nSome text.\n\n${CITATION_DATA_START_DELIMITER}\n\n${CITATION_DATA_END_DELIMITER}\n`;
    const result = mergeSections({ sectionAContent: emptyA, sectionBContent: VALID_B });

    expect(result.parseErrorA).toBeDefined();
    expect(result.parseErrorA).toMatch(/empty/i);
    expect(result.aCount).toBe(0);
  });

  it("surfaces parseErrorB when section B has a markdown code fence with trailing text", () => {
    // Agents sometimes wrap JSON in ```json fences. The repair heuristic only strips
    // fences at the start/end; trailing text after the closing fence makes the whole
    // block unparseable.
    const fencedB = `## B\nText.\n\n${CITATION_DATA_START_DELIMITER}\n\`\`\`json\n{"doc1": [{"n": 100, "k": "x", "p": "1_0", "l": [1]}]}\n\`\`\`\nSome trailing commentary\n${CITATION_DATA_END_DELIMITER}\n`;
    const result = mergeSections({ sectionAContent: VALID_A, sectionBContent: fencedB });

    expect(result.parseErrorB).toBeDefined();
    expect(result.bOrigCount).toBe(0);
  });

  it("surfaces parseErrorA when the JSON is missing the required `n` field", () => {
    const badSchema = sectionWithBlock(
      "## A\nText.",
      JSON.stringify([{ k: "foo", p: "1_0", l: [1] }]),
    );
    const result = mergeSections({ sectionAContent: badSchema, sectionBContent: VALID_B });

    expect(result.parseErrorA).toBeDefined();
    expect(result.aCount).toBe(0);
  });
});

// ── merge CLI wrapper: refuse-to-write gate ─────────────────────────

describe("merge CLI — refuse-to-write gate", () => {
  let tmp: string;
  let mockExit: jest.SpiedFunction<typeof process.exit>;
  let mockError: jest.SpiedFunction<typeof console.error>;
  let mockLog: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    tmp = join(tmpdir(), `dc-merge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmp, { recursive: true });
    mockExit = jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);
    mockError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockLog = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    mockExit.mockRestore();
    mockError.mockRestore();
    mockLog.mockRestore();
  });

  it("exits 1 and does not write output when section A has an empty block", () => {
    const aPath = join(tmp, "a.md");
    const bPath = join(tmp, "b.md");
    const outPath = join(tmp, "out.md");
    writeFileSync(aPath, `## A\n\n${CITATION_DATA_START_DELIMITER}\n\n${CITATION_DATA_END_DELIMITER}\n`);
    writeFileSync(bPath, VALID_B);

    expect(() => merge(["--a", aPath, "--b", bPath, "--out", outPath])).toThrow("process.exit(1)");

    // Output must not be written on failure — callers must not find a stale empty body.
    expect(existsSync(outPath)).toBe(false);

    const stderr = mockError.mock.calls.map(args => args.join(" ")).join("\n");
    expect(stderr).toContain("refusing to write output");
    expect(stderr).toContain("Empty <<<CITATION_DATA>>>");
    expect(stderr).toContain(aPath);
  });

  it("exits 1 when both sections have parse failures", () => {
    const aPath = join(tmp, "a.md");
    const bPath = join(tmp, "b.md");
    const outPath = join(tmp, "out.md");
    writeFileSync(aPath, `## A\n\n${CITATION_DATA_START_DELIMITER}\n\n${CITATION_DATA_END_DELIMITER}\n`);
    writeFileSync(bPath, `## B\n\n${CITATION_DATA_START_DELIMITER}\n\n${CITATION_DATA_END_DELIMITER}\n`);

    expect(() => merge(["--a", aPath, "--b", bPath, "--out", outPath])).toThrow("process.exit(1)");
    expect(existsSync(outPath)).toBe(false);

    const stderr = mockError.mock.calls.map(args => args.join(" ")).join("\n");
    // Both sides should be named in the diagnostic.
    expect(stderr).toContain(aPath);
    expect(stderr).toContain(bPath);
  });

  it("writes output and exits 0 on the happy path", () => {
    const aPath = join(tmp, "a.md");
    const bPath = join(tmp, "b.md");
    const outPath = join(tmp, "out.md");
    writeFileSync(aPath, VALID_A);
    writeFileSync(bPath, VALID_B);

    expect(() => merge(["--a", aPath, "--b", bPath, "--out", outPath])).not.toThrow();

    expect(existsSync(outPath)).toBe(true);
    const merged = readFileSync(outPath, "utf-8");
    expect(merged).toContain(CITATION_DATA_START_DELIMITER);
    expect(mockExit).not.toHaveBeenCalled();
  });
});
