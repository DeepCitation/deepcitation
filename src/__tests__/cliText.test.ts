/**
 * Tests for `deepcitation text <prepare.json>` — the offline re-renderer.
 *
 * Coverage: basic txt output, plain format strips tags, --pages spec
 * selection, --out file write, error when input file is missing.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { text } from "../cli/text.js";

function makePage(num: number): string {
  return (
    `<page_number_${num}_index_${num - 1}>\n` +
    `<line id="1">p${num} line 1</line>\n` +
    "line 2\n" +
    "line 3\n" +
    "line 4\n" +
    `<line id="5">p${num} line 5</line>\n` +
    `</page_number_${num}_index_${num - 1}>`
  );
}

function writePrepareFile(tmp: string, pageCount: number): string {
  const pages = Array.from({ length: pageCount }, (_, i) => makePage(i + 1));
  const path = join(tmp, "prepare.json");
  writeFileSync(path, JSON.stringify({ attachmentId: "att_test", deepTextPages: pages }));
  return path;
}

describe("text", () => {
  let tmp: string;
  let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>;
  let mockError: jest.SpiedFunction<typeof console.error>;
  let mockLog: jest.SpiedFunction<typeof console.log>;
  let mockExit: jest.SpiedFunction<typeof process.exit>;
  const stdoutChunks: string[] = [];

  beforeEach(() => {
    tmp = join(tmpdir(), `dc-text-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmp, { recursive: true });
    stdoutChunks.length = 0;
    stdoutSpy = jest.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    }) as never);
    mockError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockLog = jest.spyOn(console, "log").mockImplementation(() => undefined);
    mockExit = jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    stdoutSpy.mockRestore();
    mockError.mockRestore();
    mockLog.mockRestore();
    mockExit.mockRestore();
  });

  function runAndCatchExit(args: string[]): number {
    try {
      text(args);
    } catch (err) {
      const match = (err as Error).message.match(/process\.exit\((\d+)\)/);
      if (match) return parseInt(match[1], 10);
      throw err;
    }
    return 0;
  }

  it("writes tagged txt to stdout by default", () => {
    const path = writePrepareFile(tmp, 3);
    const code = runAndCatchExit([path]);
    expect(code).toBe(0);
    const out = stdoutChunks.join("");
    expect(out).toContain("<page_number_1_index_0>");
    expect(out).toContain("<page_number_3_index_2>");
    expect(out).toContain('<line id="1">');
  });

  it("restricts to --pages 2-3", () => {
    const path = writePrepareFile(tmp, 5);
    const code = runAndCatchExit([path, "-p", "2-3"]);
    expect(code).toBe(0);
    const out = stdoutChunks.join("");
    expect(out).toContain("<page_number_2_index_1>");
    expect(out).toContain("<page_number_3_index_2>");
    expect(out).not.toContain("<page_number_1_index_0>");
    expect(out).not.toContain("<page_number_4_index_3>");
  });

  it("plain format strips both page and line tags", () => {
    const path = writePrepareFile(tmp, 2);
    const code = runAndCatchExit([path, "-f", "plain"]);
    expect(code).toBe(0);
    const out = stdoutChunks.join("");
    expect(out).not.toContain("<page_number_");
    expect(out).not.toContain("<line id=");
    expect(out).toContain("line 2");
  });

  it("writes to a file when --out is passed", () => {
    const prep = writePrepareFile(tmp, 2);
    const outPath = join(tmp, "out.txt");
    const code = runAndCatchExit([prep, "-o", outPath]);
    expect(code).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    const body = readFileSync(outPath, "utf8");
    expect(body).toContain("<page_number_");
  });

  it("exits non-zero when the file does not exist", () => {
    const code = runAndCatchExit([join(tmp, "missing.json")]);
    expect(code).toBe(1);
  });

  it("rejects --format json (use prepare default JSON output)", () => {
    const prep = writePrepareFile(tmp, 1);
    const code = runAndCatchExit([prep, "-f", "json"]);
    expect(code).toBe(1);
  });
});
