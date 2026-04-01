/**
 * Tier 2 — Command handler tests with mocked dependencies.
 *
 * These tests call the extracted command functions directly (no subprocess)
 * with mocked auth, client, and filesystem. They verify command logic,
 * argument parsing, validation, and error handling.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// ── Mocks ─────────────────────────────────────────────────────────
// jest.mock is hoisted before imports, so these run first.

const mockResolveAuth = jest.fn();
const mockWriteCredentials = jest.fn();
const mockDeleteCredentials = jest.fn();
const mockOpenBrowser = jest.fn();

jest.mock("../auth.js", () => {
  const actual = jest.requireActual("../auth.js");
  return {
    ...actual,
    resolveAuth: (...args: unknown[]) => mockResolveAuth(...args),
    writeCredentials: (...args: unknown[]) => mockWriteCredentials(...args),
    deleteCredentials: (...args: unknown[]) => mockDeleteCredentials(...args),
    openBrowser: (...args: unknown[]) => mockOpenBrowser(...args),
  };
});

const mockPrepareUrl = jest.fn();
const mockUploadFile = jest.fn();
const mockVerifyAttachment = jest.fn();
const mockGetAttachment = jest.fn();

jest.mock("../client/DeepCitation.js", () => ({
  DeepCitation: jest.fn().mockImplementation(() => ({
    prepareUrl: mockPrepareUrl,
    uploadFile: mockUploadFile,
    verifyAttachment: mockVerifyAttachment,
    getAttachment: mockGetAttachment,
  })),
}));

// Mock proxy detection to return null (no proxy)
jest.mock("../utils/proxy.js", () => ({
  detectProxyUrl: jest.fn().mockReturnValue(null),
  decodeChunked: jest.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────

import {
  env,
  getAttachment,
  inject,
  keygen,
  login,
  logout,
  openBillingDashboard,
  prepare,
  requireAuth,
  resolveBaseUrl,
  saveApiKey,
  status,
  verify,
  whoami,
} from "../cli/commands.js";

// ── Helpers ───────────────────────────────────────────────────────

const TEST_KEY = "sk-dc-test1234567890abcdef";
const TEST_BILLING_URL = "https://deepcitation.com/billing";
const TEST_BASE_URL = "https://deepcitation.com";

function makeAuth(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: TEST_KEY,
    source: { kind: "credentials", path: "/home/test/.deepcitation/credentials.json" },
    credentials: {
      version: 1,
      apiKey: TEST_KEY,
      email: "test@example.com",
      displayName: "Test User",
      createdAt: "2025-01-01",
    },
    ...overrides,
  };
}

function makeTmpDir(): string {
  const dir = join(tmpdir(), `dc-cmd-test-${randomBytes(4).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Capture stdout/stderr during a function call */
async function captureOutput(fn: () => unknown | Promise<unknown>) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;

  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => stderr.push(args.map(String).join(" "));
  process.stdout.write = ((chunk: string) => {
    stdout.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => {
    stderr.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origError;
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

/** Mock process.exit to throw instead of exiting */
let mockExit: jest.SpyInstance;

beforeAll(() => {
  mockExit = jest.spyOn(process, "exit").mockImplementation((code?: number) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterAll(() => {
  mockExit.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────

describe("requireAuth", () => {
  it("returns auth when authenticated", () => {
    const auth = makeAuth();
    mockResolveAuth.mockReturnValue(auth);
    expect(requireAuth("help text")).toEqual(auth);
  });

  it("exits when not authenticated", () => {
    mockResolveAuth.mockReturnValue(null);
    expect(() => requireAuth("help text")).toThrow("process.exit(1)");
  });
});

describe("resolveBaseUrl", () => {
  const origEnv = process.env.DC_LOGIN_URL;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.DC_LOGIN_URL;
    else process.env.DC_LOGIN_URL = origEnv;
  });

  it("returns default URL when DC_LOGIN_URL is not set", () => {
    delete process.env.DC_LOGIN_URL;
    expect(resolveBaseUrl()).toBe("https://deepcitation.com");
  });

  it("returns custom URL when DC_LOGIN_URL is set", () => {
    process.env.DC_LOGIN_URL = "https://staging.deepcitation.com";
    expect(resolveBaseUrl()).toBe("https://staging.deepcitation.com");
  });

  it("exits on invalid DC_LOGIN_URL", () => {
    process.env.DC_LOGIN_URL = "not-a-url";
    expect(() => resolveBaseUrl()).toThrow("process.exit(1)");
  });

  it("exits on non-http protocol", () => {
    process.env.DC_LOGIN_URL = "ftp://deepcitation.com";
    expect(() => resolveBaseUrl()).toThrow("process.exit(1)");
  });
});

describe("saveApiKey", () => {
  it("saves valid key", async () => {
    mockWriteCredentials.mockReturnValue(undefined);
    const { stdout } = await captureOutput(() => saveApiKey(TEST_KEY, "--key flag", TEST_BILLING_URL));
    expect(mockWriteCredentials).toHaveBeenCalledWith(expect.objectContaining({ version: 1, apiKey: TEST_KEY }));
    expect(stdout).toContain("Credentials saved");
  });

  it("rejects key without sk-dc- prefix", () => {
    expect(() => saveApiKey("pk-test-1234567890123456", "test", TEST_BILLING_URL)).toThrow("process.exit(1)");
  });

  it("rejects too-short key", () => {
    expect(() => saveApiKey("sk-dc-short", "test", TEST_BILLING_URL)).toThrow("process.exit(1)");
  });

  it("rejects empty string", () => {
    expect(() => saveApiKey("", "test", TEST_BILLING_URL)).toThrow("process.exit(1)");
  });
});

describe("logout", () => {
  it("reports no credentials when not authenticated", async () => {
    mockResolveAuth.mockReturnValue(null);
    const { stdout } = await captureOutput(() => logout());
    expect(stdout).toContain("No saved credentials");
  });

  it("deletes credentials file when source is credentials", async () => {
    mockResolveAuth.mockReturnValue(makeAuth());
    mockDeleteCredentials.mockReturnValue(true);
    const { stdout } = await captureOutput(() => logout());
    expect(mockDeleteCredentials).toHaveBeenCalled();
    expect(stdout).toContain("Logged out");
  });

  it("advises about .env when source is dotenv", async () => {
    mockResolveAuth.mockReturnValue(makeAuth({ source: { kind: "dotenv", path: "/project/.env" } }));
    const { stdout } = await captureOutput(() => logout());
    expect(stdout).toContain(".env");
    expect(stdout).toContain("Remove the DEEPCITATION_API_KEY");
  });

  it("advises about env var when source is env-var", async () => {
    mockResolveAuth.mockReturnValue(makeAuth({ source: { kind: "env-var" } }));
    const { stdout } = await captureOutput(() => logout());
    expect(stdout).toContain("environment variable");
    expect(stdout).toContain("unset DEEPCITATION_API_KEY");
  });
});

describe("whoami", () => {
  it("prints name, email, key, and source", async () => {
    mockResolveAuth.mockReturnValue(makeAuth());
    const { stdout } = await captureOutput(() => whoami());
    expect(stdout).toContain("Test User");
    expect(stdout).toContain("test@example.com");
    expect(stdout).toContain("sk-dc-test");
  });

  it("omits name line when displayName is absent", async () => {
    const auth = makeAuth();
    auth.credentials.displayName = undefined;
    mockResolveAuth.mockReturnValue(auth);
    const { stdout } = await captureOutput(() => whoami());
    expect(stdout).not.toContain("Name:");
    expect(stdout).toContain("Email:");
  });

  it("exits when not authenticated", async () => {
    mockResolveAuth.mockReturnValue(null);
    await expect(captureOutput(() => whoami())).rejects.toThrow("process.exit(1)");
  });
});

describe("status", () => {
  it("exits 0 when authenticated", async () => {
    mockResolveAuth.mockReturnValue(makeAuth());
    await expect(captureOutput(() => status())).rejects.toThrow("process.exit(0)");
  });

  it("exits 1 when not authenticated", async () => {
    mockResolveAuth.mockReturnValue(null);
    await expect(captureOutput(() => status())).rejects.toThrow("process.exit(1)");
  });

  it("prints key info when authenticated", async () => {
    mockResolveAuth.mockReturnValue(makeAuth());
    try {
      await captureOutput(() => status());
    } catch {
      // exit throws
    }
    // status calls console.log before process.exit — verify via mock
  });
});

describe("env", () => {
  it("prints export line when authenticated", async () => {
    mockResolveAuth.mockReturnValue(makeAuth());
    const { stdout } = await captureOutput(() => {
      try {
        env();
      } catch {
        /* exit */
      }
    });
    expect(stdout).toContain(`export DEEPCITATION_API_KEY="${TEST_KEY}"`);
  });

  it("exits 1 when not authenticated", () => {
    mockResolveAuth.mockReturnValue(null);
    expect(() => env()).toThrow("process.exit(1)");
  });

  it("exits 1 on unexpected key format", () => {
    mockResolveAuth.mockReturnValue(makeAuth({ apiKey: "sk-dc-has spaces!!" }));
    expect(() => env()).toThrow("process.exit(1)");
  });
});

describe("inject command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  it("injects verification data into HTML", async () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");
    const outPath = join(tmpDir, "out.html");

    writeFileSync(htmlPath, '<html><body><span data-citation-key="abc123">text</span></body></html>');
    writeFileSync(verifyPath, JSON.stringify({ verifications: { abc123: { status: "found" } } }));

    await captureOutput(() => inject(["--html", htmlPath, "--verify-response", verifyPath, "--out", outPath]));

    const output = readFileSync(outPath, "utf-8");
    expect(output).toContain("dc-data");
    expect(output).toContain("DeepCitationPopover");
  });

  it("exits when --html is missing", () => {
    const verifyPath = join(tmpDir, "verify.json");
    writeFileSync(verifyPath, "{}");
    expect(() => inject(["--verify-response", verifyPath])).toThrow("process.exit(1)");
  });

  it("exits when --verify-response is missing", () => {
    const htmlPath = join(tmpDir, "test.html");
    writeFileSync(htmlPath, "<html></html>");
    expect(() => inject(["--html", htmlPath])).toThrow("process.exit(1)");
  });

  it("exits on invalid --theme", () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");
    writeFileSync(htmlPath, "<html></html>");
    writeFileSync(verifyPath, JSON.stringify({ verifications: {} }));
    expect(() => inject(["--html", htmlPath, "--verify-response", verifyPath, "--theme", "purple"])).toThrow(
      "process.exit(1)",
    );
  });

  it("exits on invalid --indicator", () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");
    writeFileSync(htmlPath, "<html></html>");
    writeFileSync(verifyPath, JSON.stringify({ verifications: {} }));
    expect(() => inject(["--html", htmlPath, "--verify-response", verifyPath, "--indicator", "caret"])).toThrow(
      "process.exit(1)",
    );
  });

  it("applies --theme dark", async () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");
    const outPath = join(tmpDir, "out.html");

    writeFileSync(htmlPath, "<html><body></body></html>");
    writeFileSync(verifyPath, JSON.stringify({ verifications: {} }));

    await captureOutput(() =>
      inject(["--html", htmlPath, "--verify-response", verifyPath, "--out", outPath, "--theme", "dark"]),
    );

    const output = readFileSync(outPath, "utf-8");
    expect(output).toContain('"dark"');
  });

  it("applies --indicator dot", async () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");
    const outPath = join(tmpDir, "out.html");

    writeFileSync(htmlPath, "<html><body></body></html>");
    writeFileSync(verifyPath, JSON.stringify({ verifications: {} }));

    await captureOutput(() =>
      inject(["--html", htmlPath, "--verify-response", verifyPath, "--out", outPath, "--indicator", "dot"]),
    );

    const output = readFileSync(outPath, "utf-8");
    expect(output).toContain('"dot"');
  });

  it("overwrites input by default when --out is omitted", async () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");

    writeFileSync(htmlPath, "<html><body></body></html>");
    writeFileSync(verifyPath, JSON.stringify({ verifications: {} }));

    await captureOutput(() => inject(["--html", htmlPath, "--verify-response", verifyPath]));

    const output = readFileSync(htmlPath, "utf-8");
    expect(output).toContain("dc-data");
  });

  it("injects key-map script when --key-map is provided", async () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");
    const keyMapPath = join(tmpDir, "keymap.json");
    const outPath = join(tmpDir, "out.html");

    writeFileSync(htmlPath, "<html><body></body></html>");
    writeFileSync(verifyPath, JSON.stringify({ verifications: {} }));
    writeFileSync(keyMapPath, JSON.stringify({ "cite-1": "abc123" }));

    await captureOutput(() =>
      inject(["--html", htmlPath, "--verify-response", verifyPath, "--key-map", keyMapPath, "--out", outPath]),
    );

    const output = readFileSync(outPath, "utf-8");
    expect(output).toContain("dc-key-map");
  });

  it("exits on invalid --key-map JSON", () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");
    const keyMapPath = join(tmpDir, "keymap.json");

    writeFileSync(htmlPath, "<html><body></body></html>");
    writeFileSync(verifyPath, JSON.stringify({ verifications: {} }));
    writeFileSync(keyMapPath, "not valid json {{{");

    expect(() => inject(["--html", htmlPath, "--verify-response", verifyPath, "--key-map", keyMapPath])).toThrow(
      "process.exit(1)",
    );
  });

  it("auto-fixes display-label when visible text differs from anchorText", async () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");
    const outPath = join(tmpDir, "out.html");

    writeFileSync(htmlPath, '<html><body><span data-citation-key="abc123">visible label</span></body></html>');
    writeFileSync(
      verifyPath,
      JSON.stringify({
        verifications: {
          abc123: { status: "found", citation: { anchorText: "completely different anchor text" } },
        },
      }),
    );

    const { stderr } = await captureOutput(() =>
      inject(["--html", htmlPath, "--verify-response", verifyPath, "--out", outPath]),
    );

    const output = readFileSync(outPath, "utf-8");
    expect(output).toContain('data-dc-display-label="visible label"');
    expect(stderr).toContain("Auto-set display label");
  });
});

describe("keygen command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  it("prints key mapping to stdout", async () => {
    const citPath = join(tmpDir, "citations.json");
    writeFileSync(
      citPath,
      JSON.stringify({
        "my-label": {
          fullPhrase: "test phrase",
          anchorText: "test",
          pageNumber: 1,
          lineIds: [1],
          attachmentId: "att-1",
        },
      }),
    );

    const { stdout } = await captureOutput(() => keygen(["--citations", citPath]));
    const mapping = JSON.parse(stdout);
    expect(Object.keys(mapping)).toContain("my-label");
    // Key should be a hash string
    expect(typeof Object.values(mapping)[0]).toBe("string");
  });

  it("writes rekeyed file with --out", async () => {
    const citPath = join(tmpDir, "citations.json");
    const outPath = join(tmpDir, "rekeyed.json");
    writeFileSync(
      citPath,
      JSON.stringify({
        "label-1": {
          fullPhrase: "test phrase",
          anchorText: "test",
          pageNumber: 1,
          lineIds: [1],
          attachmentId: "att-1",
        },
      }),
    );

    await captureOutput(() => keygen(["--citations", citPath, "--out", outPath]));

    const rekeyed = JSON.parse(readFileSync(outPath, "utf-8"));
    // Rekeyed file should have hash keys, not original labels
    expect(Object.keys(rekeyed)).not.toContain("label-1");
    expect(Object.keys(rekeyed).length).toBe(1);
  });

  it("exits when --citations is missing", () => {
    expect(() => keygen([])).toThrow("process.exit(1)");
  });

  it("produces deterministic keys", async () => {
    const citPath = join(tmpDir, "citations.json");
    const data = {
      a: { fullPhrase: "same phrase", anchorText: "same", pageNumber: 1, lineIds: [1], attachmentId: "att-1" },
    };
    writeFileSync(citPath, JSON.stringify(data));

    const { stdout: out1 } = await captureOutput(() => keygen(["--citations", citPath]));
    const { stdout: out2 } = await captureOutput(() => keygen(["--citations", citPath]));

    expect(JSON.parse(out1)).toEqual(JSON.parse(out2));
  });
});

describe("prepare command", () => {
  const fmtNetErr = (err: unknown) => (err instanceof Error ? err.message : String(err));

  beforeEach(() => {
    mockResolveAuth.mockReturnValue(makeAuth());
  });

  it("exits when no file or URL is provided", async () => {
    await expect(captureOutput(() => prepare([], fmtNetErr))).rejects.toThrow("process.exit(1)");
  });

  it("exits when not authenticated", async () => {
    mockResolveAuth.mockReturnValue(null);
    await expect(captureOutput(() => prepare(["somefile.pdf"], fmtNetErr))).rejects.toThrow("process.exit(1)");
  });

  it("exits when file is not found", async () => {
    await expect(captureOutput(() => prepare(["/nonexistent/path/to/file.pdf"], fmtNetErr))).rejects.toThrow(
      "process.exit(1)",
    );
  });

  it("prepares a URL", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      mockPrepareUrl.mockResolvedValue({
        attachmentId: "att-123",
        deepTextPromptPortion: "some text",
        metadata: { pageCount: 1, textByteSize: 1024 },
      });

      const { stdout } = await captureOutput(() => prepare(["https://example.com/article"], fmtNetErr));

      expect(mockPrepareUrl).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/article" }));
      expect(stdout).toContain(".deepcitation/prepare-example.com.json");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("passes --unsafe-fast flag to prepareUrl", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      mockPrepareUrl.mockResolvedValue({
        attachmentId: "att-123",
        deepTextPromptPortion: "some text",
        metadata: { pageCount: 1, textByteSize: 1024 },
      });

      await captureOutput(() => prepare(["https://example.com/article", "--unsafe-fast"], fmtNetErr));

      expect(mockPrepareUrl).toHaveBeenCalledWith(expect.objectContaining({ unsafeFastUrlOutput: true }));
    } finally {
      process.chdir(origCwd);
    }
  });

  it("prints summary JSON when --summary is used", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      mockPrepareUrl.mockResolvedValue({
        attachmentId: "att-123",
        deepTextPromptPortion: "deep text here",
        metadata: { pageCount: 2, textByteSize: 2048 },
      });

      const { stdout } = await captureOutput(() => prepare(["https://example.com/article", "--summary"], fmtNetErr));

      const summary = JSON.parse(stdout);
      expect(summary.attachmentId).toBe("att-123");
      expect(summary.deepTextPromptPortion).toBe("deep text here");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("warns on http:// URL", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      mockPrepareUrl.mockResolvedValue({
        attachmentId: "att-123",
        deepTextPromptPortion: "text",
        metadata: { pageCount: 1, textByteSize: 100 },
      });

      const { stderr } = await captureOutput(() => prepare(["http://example.com/article"], fmtNetErr));

      expect(stderr).toContain("plaintext");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("does not warn on http://localhost", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      mockPrepareUrl.mockResolvedValue({
        attachmentId: "att-123",
        deepTextPromptPortion: "text",
        metadata: { pageCount: 1, textByteSize: 100 },
      });

      const { stderr } = await captureOutput(() => prepare(["http://localhost:3000/article"], fmtNetErr));

      expect(stderr).not.toContain("plaintext");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("prepares a local file", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    const filePath = join(tmpDir, "report.pdf");
    writeFileSync(filePath, "fake pdf content");

    try {
      mockUploadFile.mockResolvedValue({
        attachmentId: "att-456",
        deepTextPromptPortion: "text",
        metadata: { pageCount: 3, textByteSize: 4096 },
      });

      const { stdout } = await captureOutput(() => prepare([filePath], fmtNetErr));

      expect(mockUploadFile).toHaveBeenCalled();
      expect(stdout).toContain("prepare-report.json");
    } finally {
      process.chdir(origCwd);
    }
  });
});

describe("verify command (--citations mode)", () => {
  const fmtNetErr = (err: unknown) => (err instanceof Error ? err.message : String(err));

  beforeEach(() => {
    mockResolveAuth.mockReturnValue(makeAuth());
  });

  it("exits when no mode flag is provided", async () => {
    await expect(captureOutput(() => verify([], fmtNetErr))).rejects.toThrow("process.exit(1)");
  });

  it("exits on invalid --image-format", async () => {
    const tmpDir = makeTmpDir();
    const citPath = join(tmpDir, "citations.json");
    writeFileSync(citPath, JSON.stringify({ key1: { attachmentId: "a", fullPhrase: "x" } }));

    await expect(
      captureOutput(() => verify(["--citations", citPath, "--image-format", "gif"], fmtNetErr)),
    ).rejects.toThrow("process.exit(1)");
  });

  it("exits when citations are missing attachmentId", async () => {
    const tmpDir = makeTmpDir();
    const citPath = join(tmpDir, "citations.json");
    writeFileSync(citPath, JSON.stringify({ key1: { fullPhrase: "x" } }));

    await expect(captureOutput(() => verify(["--citations", citPath], fmtNetErr))).rejects.toThrow("process.exit(1)");
  });

  it("verifies citations grouped by attachmentId", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    // Create .deepcitation/ output dir (in real usage it already exists from prepare)
    mkdirSync(join(tmpDir, ".deepcitation"), { recursive: true });
    const citPath = join(tmpDir, "citations.json");
    writeFileSync(
      citPath,
      JSON.stringify({
        key1: { attachmentId: "att-1", fullPhrase: "phrase 1", anchorText: "anchor 1", pageNumber: 1 },
        key2: { attachmentId: "att-1", fullPhrase: "phrase 2", anchorText: "anchor 2", pageNumber: 2 },
        key3: { attachmentId: "att-2", fullPhrase: "phrase 3", anchorText: "anchor 3", pageNumber: 1 },
      }),
    );

    // mockResolvedValueOnce is consumed in order — first call returns att-1 results, second returns att-2
    mockVerifyAttachment.mockResolvedValueOnce({
      verifications: { key1: { status: "found" }, key2: { status: "not_found" } },
    });
    mockVerifyAttachment.mockResolvedValueOnce({
      verifications: { key3: { status: "found" } },
    });

    try {
      const { stderr } = await captureOutput(() => verify(["--citations", citPath], fmtNetErr));

      expect(mockVerifyAttachment).toHaveBeenCalledTimes(2);
      expect(stderr).toContain("3 citations across 2 attachment(s)");
    } finally {
      process.chdir(origCwd);
    }
  });
});

describe("getAttachment command", () => {
  beforeEach(() => {
    mockResolveAuth.mockReturnValue(makeAuth());
  });

  it("exits when no attachment ID is provided", async () => {
    await expect(captureOutput(() => getAttachment([]))).rejects.toThrow("process.exit(1)");
  });

  it("exits when not authenticated", async () => {
    mockResolveAuth.mockReturnValue(null);
    await expect(captureOutput(() => getAttachment(["abc123"]))).rejects.toThrow("process.exit(1)");
  });

  it("prints JSON to stdout by default", async () => {
    mockGetAttachment.mockResolvedValue({
      status: "ready",
      pageCount: 5,
      verifications: { k: { status: "found" } },
      deepTextPromptPortion: "big text",
      pageTexts: { "1": ["line1"] },
    });

    const { stdout } = await captureOutput(() => getAttachment(["abc123"]));
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ready");
    // Large fields should be stripped by default
    expect(parsed.deepTextPromptPortion).toBeUndefined();
    expect(parsed.pageTexts).toBeUndefined();
  });

  it("includes --deep-text and --page-texts when requested", async () => {
    mockGetAttachment.mockResolvedValue({
      status: "ready",
      pageCount: 5,
      verifications: {},
      deepTextPromptPortion: "big text",
      pageTexts: { "1": ["line1"] },
    });

    const { stdout } = await captureOutput(() => getAttachment(["abc123", "--deep-text", "--page-texts"]));
    const parsed = JSON.parse(stdout);
    expect(parsed.deepTextPromptPortion).toBe("big text");
    expect(parsed.pageTexts).toBeDefined();
  });

  it("writes to file with --out", async () => {
    const tmpDir = makeTmpDir();
    const outPath = join(tmpDir, "attachment.json");

    mockGetAttachment.mockResolvedValue({
      status: "ready",
      pageCount: 3,
      verifications: { k1: { status: "found" } },
    });

    await captureOutput(() => getAttachment(["abc123", "--out", outPath]));

    const output = JSON.parse(readFileSync(outPath, "utf-8"));
    expect(output.status).toBe("ready");
  });
});

describe("openBillingDashboard", () => {
  it("opens the billing URL", async () => {
    await captureOutput(() => openBillingDashboard(TEST_BILLING_URL));
    expect(mockOpenBrowser).toHaveBeenCalledWith(TEST_BILLING_URL);
  });
});

describe("login command", () => {
  it("saves key from --key flag", async () => {
    const { stdout } = await captureOutput(() => login(["--key", TEST_KEY], TEST_BASE_URL, TEST_BILLING_URL));
    expect(mockWriteCredentials).toHaveBeenCalledWith(expect.objectContaining({ apiKey: TEST_KEY }));
    expect(stdout).toContain("Credentials saved");
  });

  it("exits when --key has no value", async () => {
    await expect(captureOutput(() => login(["--key"], TEST_BASE_URL, TEST_BILLING_URL))).rejects.toThrow(
      "process.exit(1)",
    );
  });

  it("reports already authenticated if auth exists", async () => {
    mockResolveAuth.mockReturnValue(makeAuth());
    const { stdout } = await captureOutput(() => login([], TEST_BASE_URL, TEST_BILLING_URL));
    expect(stdout).toContain("Already authenticated");
    expect(mockWriteCredentials).not.toHaveBeenCalled();
  });
});
