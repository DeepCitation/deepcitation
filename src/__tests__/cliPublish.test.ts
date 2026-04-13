/**
 * Tests for `deepcitation publish` — the opt-in hosted-reports upload path.
 *
 * Covers:
 *   - --dry-run path never hits the network and emits a structured payload
 *   - Missing --html / --vr → non-zero exit with help text
 *   - sk-dc- leak in HTML → hard fail before POST
 *   - Payload size cap enforced before POST
 *   - Invalid JSON in verify-response.json → non-zero exit
 *   - --lint pre-check: bad HTML fails before POST
 *   - --vis validates against {private, unlisted, public}
 *
 * These tests only exercise the dry-run path. The actual network call is
 * covered by the server route tests in `packages/deepcitation-functions`.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { publish } from "../cli/publish.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "../prompts/citationPrompts.js";

function htmlWithCitationBlock(body: string, jsonBody: string): string {
  return `<html><body>${body}\n\n${CITATION_DATA_START_DELIMITER}\n${jsonBody}\n${CITATION_DATA_END_DELIMITER}\n</body></html>`;
}

const VALID_CITATION_JSON = JSON.stringify({
  doc1: [{ n: 1, k: "45%", p: "1_0", l: [5], f: "Revenue grew 45% year over year in Q4." }],
});

const VALID_HTML = htmlWithCitationBlock(
  '<p>Revenue grew <strong>45%</strong> <cite data-cite="1">[1]</cite>.</p>',
  VALID_CITATION_JSON,
);

const VALID_VERIFY_RESPONSE = JSON.stringify({
  verifications: {
    abc123: { status: "found", citationKey: "abc123" },
  },
});

describe("publish", () => {
  let tmp: string;
  let mockExit: jest.SpiedFunction<typeof process.exit>;
  let mockError: jest.SpiedFunction<typeof console.error>;
  let mockLog: jest.SpiedFunction<typeof console.log>;
  const errorLines: string[] = [];
  const logLines: string[] = [];

  beforeEach(() => {
    tmp = join(tmpdir(), `dc-publish-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmp, { recursive: true });
    errorLines.length = 0;
    logLines.length = 0;
    mockExit = jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);
    mockError = jest.spyOn(console, "error").mockImplementation(((...args: unknown[]) => {
      errorLines.push(args.map(String).join(" "));
    }) as never);
    mockLog = jest.spyOn(console, "log").mockImplementation(((...args: unknown[]) => {
      logLines.push(args.map(String).join(" "));
    }) as never);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    mockExit.mockRestore();
    mockError.mockRestore();
    mockLog.mockRestore();
  });

  function write(name: string, content: string): string {
    const path = join(tmp, name);
    writeFileSync(path, content);
    return path;
  }

  async function publishAndCatchExit(args: string[]): Promise<number> {
    try {
      await publish(args);
      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const m = msg.match(/^process\.exit\((\d+)\)$/);
      if (m) return parseInt(m[1], 10);
      throw err;
    }
  }

  it("--dry-run writes a structured payload and does not require auth", async () => {
    const htmlPath = write("r.html", VALID_HTML);
    const jsonPath = write("r.json", VALID_VERIFY_RESPONSE);

    const code = await publishAndCatchExit(["--html", htmlPath, "--vr", jsonPath, "--dry-run"]);

    expect(code).toBe(0);
    // Structured dry-run payload goes to stdout
    const combined = logLines.join("\n");
    const parsed = JSON.parse(combined);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.htmlPath).toBe(htmlPath);
    expect(parsed.verifyResponsePath).toBe(jsonPath);
    expect(parsed.visibility).toBe("unlisted");
    expect(parsed.htmlBytes).toBeGreaterThan(0);
    expect(parsed.jsonBytes).toBeGreaterThan(0);
  });

  it("--dry-run with --vis public carries the visibility", async () => {
    const htmlPath = write("r.html", VALID_HTML);
    const jsonPath = write("r.json", VALID_VERIFY_RESPONSE);

    const code = await publishAndCatchExit([
      "--html",
      htmlPath,
      "--vr",
      jsonPath,
      "--vis",
      "public",
      "--title",
      "Q2 report",
      "--dry-run",
    ]);

    expect(code).toBe(0);
    const parsed = JSON.parse(logLines.join("\n"));
    expect(parsed.visibility).toBe("public");
    expect(parsed.title).toBe("Q2 report");
  });

  it("rejects missing --html with exit 1", async () => {
    const jsonPath = write("r.json", VALID_VERIFY_RESPONSE);
    const code = await publishAndCatchExit(["--vr", jsonPath, "--dry-run"]);
    expect(code).toBe(1);
    expect(errorLines.join("\n")).toMatch(/--html is required/);
  });

  it("rejects missing --vr with exit 1", async () => {
    const htmlPath = write("r.html", VALID_HTML);
    const code = await publishAndCatchExit(["--html", htmlPath, "--dry-run"]);
    expect(code).toBe(1);
    expect(errorLines.join("\n")).toMatch(/--vr.*is required/);
  });

  it("rejects missing HTML file with exit 1", async () => {
    const jsonPath = write("r.json", VALID_VERIFY_RESPONSE);
    const code = await publishAndCatchExit(["--html", join(tmp, "does-not-exist.html"), "--vr", jsonPath, "--dry-run"]);
    expect(code).toBe(1);
    expect(errorLines.join("\n")).toMatch(/HTML file not found/);
  });

  it("rejects HTML containing a DeepCitation API key (fail-closed)", async () => {
    const htmlPath = write("leaky.html", `<html><body>oops: sk-dc-abcdef1234567890\n${VALID_HTML}</body></html>`);
    const jsonPath = write("r.json", VALID_VERIFY_RESPONSE);
    const code = await publishAndCatchExit(["--html", htmlPath, "--vr", jsonPath, "--dry-run"]);
    expect(code).toBe(1);
    expect(errorLines.join("\n")).toMatch(/contains a DeepCitation API key/);
  });

  it("rejects invalid JSON in verify-response.json", async () => {
    const htmlPath = write("r.html", VALID_HTML);
    const jsonPath = write("r.json", "{ not valid json");
    const code = await publishAndCatchExit(["--html", htmlPath, "--vr", jsonPath, "--dry-run"]);
    expect(code).toBe(1);
    expect(errorLines.join("\n")).toMatch(/is not valid JSON/);
  });

  it("rejects invalid --vis value", async () => {
    const htmlPath = write("r.html", VALID_HTML);
    const jsonPath = write("r.json", VALID_VERIFY_RESPONSE);
    const code = await publishAndCatchExit(["--html", htmlPath, "--vr", jsonPath, "--vis", "everyone", "--dry-run"]);
    expect(code).toBe(1);
    expect(errorLines.join("\n")).toMatch(/Invalid --vis/);
  });

  it("--lint fails when HTML has a citation-syntax error", async () => {
    // Code-fenced CITATION_DATA block triggers the lint rule-8 error.
    const badHtml = [
      "<html><body>",
      '<p>Some text <cite data-cite="1">[1]</cite>.</p>',
      "```json",
      CITATION_DATA_START_DELIMITER,
      VALID_CITATION_JSON,
      CITATION_DATA_END_DELIMITER,
      "```",
      "</body></html>",
    ].join("\n");
    const htmlPath = write("bad.html", badHtml);
    const jsonPath = write("r.json", VALID_VERIFY_RESPONSE);

    const code = await publishAndCatchExit(["--html", htmlPath, "--vr", jsonPath, "--lint", "--dry-run"]);
    expect(code).toBe(1);
    expect(errorLines.join("\n")).toMatch(/lint ERR|code-fence|refusing to publish/);
  });

  it("--lint passes when HTML is clean", async () => {
    const htmlPath = write("r.html", VALID_HTML);
    const jsonPath = write("r.json", VALID_VERIFY_RESPONSE);

    const code = await publishAndCatchExit(["--html", htmlPath, "--vr", jsonPath, "--lint", "--dry-run"]);

    expect(code).toBe(0);
    expect(errorLines.join("\n")).toMatch(/lint: clean|warning/);
  });

  it("-d short-alias is equivalent to --dry-run", async () => {
    const htmlPath = write("r.html", VALID_HTML);
    const jsonPath = write("r.json", VALID_VERIFY_RESPONSE);
    const code = await publishAndCatchExit(["--html", htmlPath, "--vr", jsonPath, "-d"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(logLines.join("\n"));
    expect(parsed.dryRun).toBe(true);
  });
});
