/**
 * Tests for `deepcitation slice <prepare.json>` — the overlapping chunk
 * splitter that replaces the skill's manual Python page-split path.
 *
 * Coverage:
 *   - computeChunkRanges math (even/odd splits, overlap boundaries)
 *   - the end-to-end splitter with a fixture prepare.json
 *   - manifest validation (tagsEmitted.pageTags matches chunk page count)
 *   - error paths (missing file, bad parts, parts > page count)
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeChunkRanges, slice } from "../cli/slice.js";

function makePage(num: number): string {
  return (
    `<page_number_${num}_index_${num - 1}>\n` +
    `<line id="1">page ${num} line 1</line>\n` +
    "line 2\n" +
    "line 3\n" +
    "line 4\n" +
    `<line id="5">page ${num} line 5</line>\n` +
    `</page_number_${num}_index_${num - 1}>`
  );
}

function writePrepareFile(tmp: string, pageCount: number, name = "prepare.json"): string {
  const pages = Array.from({ length: pageCount }, (_, i) => makePage(i + 1));
  const path = join(tmp, name);
  writeFileSync(
    path,
    JSON.stringify({
      attachmentId: "att_test",
      deepTextPages: pages,
      metadata: { pageCount },
    }),
  );
  return path;
}

// ── math helpers ───────────────────────────────────────────────────

describe("computeChunkRanges", () => {
  it("splits 10 pages into 2 parts with overlap=2", () => {
    expect(computeChunkRanges(10, 2, 2)).toEqual([
      { start: 0, end: 6 }, // pages 1..7 (5 base + 2 overlap)
      { start: 5, end: 9 }, // pages 6..10 (no trailing overlap on last chunk)
    ]);
  });

  it("splits 10 pages into 2 parts with overlap=0", () => {
    expect(computeChunkRanges(10, 2, 0)).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
    ]);
  });

  it("distributes remainder to earliest chunks (11 pages, 3 parts)", () => {
    const ranges = computeChunkRanges(11, 3, 0);
    const sizes = ranges.map(r => r.end - r.start + 1);
    // 11 / 3 = 3 remainder 2 → [4, 4, 3]
    expect(sizes).toEqual([4, 4, 3]);
  });

  it("handles 3 parts with overlap=1", () => {
    const ranges = computeChunkRanges(11, 3, 1);
    // base [4, 4, 3], extend first two by 1, last unchanged
    expect(ranges).toEqual([
      { start: 0, end: 4 }, // 0..4 (4+1 = 5 pages)
      { start: 4, end: 8 }, // 4..8 (4+1 = 5 pages)
      { start: 8, end: 10 }, // 8..10 (3 pages, no trailing overlap)
    ]);
  });
});

// ── e2e splitter ───────────────────────────────────────────────────

describe("slice", () => {
  let tmp: string;
  const logLines: string[] = [];
  const errorLines: string[] = [];
  let mockLog: ReturnType<typeof spyOn<typeof console, "log">>;
  let mockError: ReturnType<typeof spyOn<typeof console, "error">>;
  let mockExit: ReturnType<typeof spyOn<typeof process, "exit">>;

  beforeEach(() => {
    tmp = join(tmpdir(), `dc-slice-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmp, { recursive: true });
    logLines.length = 0;
    errorLines.length = 0;
    mockLog = spyOn(console, "log").mockImplementation(((...args: unknown[]) => {
      logLines.push(args.map(String).join(" "));
    }) as never);
    mockError = spyOn(console, "error").mockImplementation(((...args: unknown[]) => {
      errorLines.push(args.map(String).join(" "));
    }) as never);
    mockExit = spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    mockLog.mockRestore();
    mockError.mockRestore();
    mockExit.mockRestore();
  });

  function runAndCatchExit(args: string[]): number {
    try {
      slice(args);
    } catch (err) {
      const match = (err as Error).message.match(/process\.exit\((\d+)\)/);
      if (match) return parseInt(match[1], 10);
      throw err;
    }
    return 0;
  }

  it("splits a 10-page prepare file into 2 chunks with overlap=2", () => {
    const path = writePrepareFile(tmp, 10);
    const code = runAndCatchExit([path, "-n", "2", "-o", tmp]);
    expect(code).toBe(0);

    const manifest = JSON.parse(logLines.join("\n")) as {
      totalPages: number;
      parts: Array<{ file: string; pageRange: [number, number]; pageCount: number; tagsEmitted: { pageTags: number } }>;
    };
    expect(manifest.totalPages).toBe(10);
    expect(manifest.parts).toHaveLength(2);
    expect(manifest.parts[0].pageRange).toEqual([1, 7]);
    expect(manifest.parts[1].pageRange).toEqual([6, 10]);
    expect(manifest.parts[0].pageCount).toBe(7);
    expect(manifest.parts[1].pageCount).toBe(5);
    // Handshake: tag count in the chunk body matches the declared page count
    expect(manifest.parts[0].tagsEmitted.pageTags).toBe(7);
    expect(manifest.parts[1].tagsEmitted.pageTags).toBe(5);

    for (const part of manifest.parts) {
      expect(existsSync(part.file)).toBe(true);
      const body = readFileSync(part.file, "utf8");
      // Preserves original page indices — e.g. chunk B should still start at
      // page 6, not renumber to 1.
      expect(body).toContain("<page_number_6_index_5>");
    }
  });

  it("honors custom prefix and output dir", () => {
    const path = writePrepareFile(tmp, 6);
    const code = runAndCatchExit([path, "-n", "3", "--prefix", "chunk", "-o", tmp, "--overlap", "0"]);
    expect(code).toBe(0);

    const manifest = JSON.parse(logLines.join("\n")) as {
      parts: Array<{ file: string }>;
    };
    expect(manifest.parts.map(p => p.file.split("/").pop())).toEqual(["chunk-a.txt", "chunk-b.txt", "chunk-c.txt"]);
  });

  it("strips line-ids when -l none is passed", () => {
    const path = writePrepareFile(tmp, 4);
    const code = runAndCatchExit([path, "-n", "2", "-o", tmp, "-l", "none"]);
    expect(code).toBe(0);

    const manifest = JSON.parse(logLines.join("\n")) as { parts: Array<{ file: string }> };
    const body = readFileSync(manifest.parts[0].file, "utf8");
    expect(body).not.toContain("<line id=");
    expect(body).toContain("<page_number_");
  });

  it("exits non-zero when the prepare file does not exist", () => {
    const code = runAndCatchExit([join(tmp, "missing.json"), "-n", "2"]);
    expect(code).toBe(1);
  });

  it("exits non-zero when parts exceeds page count", () => {
    const path = writePrepareFile(tmp, 2);
    const code = runAndCatchExit([path, "-n", "5", "-o", tmp]);
    expect(code).toBe(1);
  });

  it("exits non-zero when the prepare file has no deepTextPages", () => {
    const path = join(tmp, "empty.json");
    writeFileSync(path, JSON.stringify({ attachmentId: "att_test", deepTextPages: [] }));
    const code = runAndCatchExit([path, "-n", "2", "-o", tmp]);
    expect(code).toBe(1);
  });
});
