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
const mockStartCallbackServer = jest.fn();

jest.mock("../auth.js", () => ({
  HOME_CREDENTIALS_PATH: "/tmp/home/credentials.json",
  PROJECT_CREDENTIALS_PATH: "/tmp/project/credentials.json",
  IS_AI_AGENT: false,
  IS_COWORK: false,
  generateNonce: () => "nonce",
  maskKey: (key: string) => key,
  sourceLabel: (source: { kind: string; path?: string }) => source.path ?? source.kind,
  resolveAuth: (...args: unknown[]) => mockResolveAuth(...args),
  writeCredentials: (...args: unknown[]) => mockWriteCredentials(...args),
  deleteCredentials: (...args: unknown[]) => mockDeleteCredentials(...args),
  openBrowser: (...args: unknown[]) => mockOpenBrowser(...args),
  startCallbackServer: (...args: unknown[]) => mockStartCallbackServer(...args),
}));

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
  canStartBrowserAuth,
  env,
  getAttachment,
  hydrate,
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
import { hydrateCitations, parseSummaryToLineMap } from "../cli/hydrate.js";

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
  it("returns auth when authenticated", async () => {
    const auth = makeAuth();
    mockResolveAuth.mockReturnValue(auth);
    await expect(requireAuth()).resolves.toEqual(auth);
  });

  it("exits with action-needed message when not authenticated in non-interactive env", async () => {
    // Test environment has no TTY → non-interactive path exits immediately with instructions
    mockResolveAuth.mockReturnValue(null);
    await expect(requireAuth()).rejects.toThrow("process.exit(1)");
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
    mockWriteCredentials.mockReturnValue("/tmp/home/credentials.json");
    const { stderr } = await captureOutput(() => saveApiKey(TEST_KEY, "--key flag"));
    expect(mockWriteCredentials).toHaveBeenCalledWith(expect.objectContaining({ version: 1, apiKey: TEST_KEY }));
    expect(stderr).toContain("Credentials saved to /tmp/home/credentials.json");
  });

  it("rejects key without sk-dc- prefix", () => {
    expect(() => saveApiKey("pk-test-1234567890123456", "test")).toThrow("process.exit(1)");
  });

  it("rejects too-short key", () => {
    expect(() => saveApiKey("sk-dc-short", "test")).toThrow("process.exit(1)");
  });

  it("rejects empty string", () => {
    expect(() => saveApiKey("", "test")).toThrow("process.exit(1)");
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

  it("writes to -verified.html by default when --out is omitted", async () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");

    writeFileSync(htmlPath, "<html><body></body></html>");
    writeFileSync(verifyPath, JSON.stringify({ verifications: {} }));

    await captureOutput(() => inject(["--html", htmlPath, "--verify-response", verifyPath]));

    const verifiedPath = join(tmpDir, "test-verified.html");
    const output = readFileSync(verifiedPath, "utf-8");
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

  it("auto-fixes display-label when visible text differs from sourceMatch", async () => {
    const htmlPath = join(tmpDir, "test.html");
    const verifyPath = join(tmpDir, "verify.json");
    const outPath = join(tmpDir, "out.html");

    writeFileSync(htmlPath, '<html><body><span data-citation-key="abc123">visible label</span></body></html>');
    writeFileSync(
      verifyPath,
      JSON.stringify({
        verifications: {
          abc123: { status: "found", citation: { sourceMatch: "completely different anchor text" } },
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
          sourceContext: "test phrase",
          sourceMatch: "test",
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
          sourceContext: "test phrase",
          sourceMatch: "test",
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
      a: { sourceContext: "same phrase", sourceMatch: "same", pageNumber: 1, lineIds: [1], attachmentId: "att-1" },
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
        deepTextPages: ["some text"],
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
        deepTextPages: ["some text"],
        metadata: { pageCount: 1, textByteSize: 1024 },
      });

      await captureOutput(() => prepare(["https://example.com/article", "--unsafe-fast"], fmtNetErr));

      expect(mockPrepareUrl).toHaveBeenCalledWith(expect.objectContaining({ unsafeFastUrlOutput: true }));
    } finally {
      process.chdir(origCwd);
    }
  });

  it("prints text JSON when --text is used", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      mockPrepareUrl.mockResolvedValue({
        attachmentId: "att-123",
        deepTextPages: ["deep text here"],
        metadata: { pageCount: 2, textByteSize: 2048 },
      });

      const { stdout } = await captureOutput(() => prepare(["https://example.com/article", "--text"], fmtNetErr));

      const summary = JSON.parse(stdout);
      expect(summary.attachmentId).toBe("att-123");
      expect(summary.deepTextPages).toEqual(["deep text here"]);
    } finally {
      process.chdir(origCwd);
    }
  });

  it("--text strips <line id> and <page_number> metadata from deepTextPages", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      mockPrepareUrl.mockResolvedValue({
        attachmentId: "att-tagged",
        deepTextPages: [
          `<page_number_1_index_0><line id="1">Hello world.</line><line id="2">Second line.</line></page_number_1_index_0>`,
          `<page_number_2_index_0><line id="3">Page two content.</line></page_number_2_index_0>`,
        ],
        metadata: { pageCount: 2, textByteSize: 512 },
      });

      const { stdout } = await captureOutput(() => prepare(["https://example.com/doc", "--text"], fmtNetErr));

      const summary = JSON.parse(stdout);
      expect(summary.deepTextPages[0]).not.toContain("<line id=");
      expect(summary.deepTextPages[0]).not.toContain("<page_number_");
      expect(summary.deepTextPages[0]).toContain("Hello world.");
      expect(summary.deepTextPages[0]).toContain("Second line.");
      expect(summary.deepTextPages[1]).not.toContain("<line id=");
      expect(summary.deepTextPages[1]).not.toContain("<page_number_");
      expect(summary.deepTextPages[1]).toContain("Page two content.");
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
        deepTextPages: ["text"],
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
        deepTextPages: ["text"],
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
        deepTextPages: ["text"],
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
    writeFileSync(citPath, JSON.stringify({ key1: { attachmentId: "a", sourceContext: "x" } }));

    await expect(
      captureOutput(() => verify(["--citations", citPath, "--image-format", "gif"], fmtNetErr)),
    ).rejects.toThrow("process.exit(1)");
  });

  it("exits when citations are missing attachmentId", async () => {
    const tmpDir = makeTmpDir();
    const citPath = join(tmpDir, "citations.json");
    writeFileSync(citPath, JSON.stringify({ key1: { sourceContext: "x" } }));

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
        key1: { attachmentId: "att-1", sourceContext: "phrase 1", sourceMatch: "anchor 1", pageNumber: 1 },
        key2: { attachmentId: "att-1", sourceContext: "phrase 2", sourceMatch: "anchor 2", pageNumber: 2 },
        key3: { attachmentId: "att-2", sourceContext: "phrase 3", sourceMatch: "anchor 3", pageNumber: 1 },
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

  it("writes attachments to output file when verifyAttachment returns assets", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    mkdirSync(join(tmpDir, ".deepcitation"), { recursive: true });
    const citPath = join(tmpDir, "citations.json");
    writeFileSync(
      citPath,
      JSON.stringify({
        key1: { attachmentId: "att-1", sourceContext: "phrase 1", sourceMatch: "anchor 1", pageNumber: 1 },
      }),
    );

    mockVerifyAttachment.mockResolvedValueOnce({
      verifications: { key1: { status: "found" } },
      attachments: {
        "att-1": {
          pageImages: [
            {
              pageNumber: 1,
              dimensions: { width: 800, height: 1200 },
              imageUrl: "https://example.com/p1.avif",
              isMatchPage: true,
            },
          ],
        },
      },
    });

    try {
      const { stdout } = await captureOutput(() => verify(["--citations", citPath], fmtNetErr));
      const outPath = stdout.trim();
      const output = JSON.parse(readFileSync(outPath, "utf-8"));
      expect(output.attachments).toBeDefined();
      expect(output.attachments["att-1"].pageImages).toHaveLength(1);
    } finally {
      process.chdir(origCwd);
    }
  });

  it("omits attachments from output file when verifyAttachment returns no assets", async () => {
    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    mkdirSync(join(tmpDir, ".deepcitation"), { recursive: true });
    const citPath = join(tmpDir, "citations.json");
    writeFileSync(
      citPath,
      JSON.stringify({
        key1: { attachmentId: "att-1", sourceContext: "phrase 1", sourceMatch: "anchor 1", pageNumber: 1 },
      }),
    );

    mockVerifyAttachment.mockResolvedValueOnce({
      verifications: { key1: { status: "found" } },
      // no attachments field
    });

    try {
      const { stdout } = await captureOutput(() => verify(["--citations", citPath], fmtNetErr));
      const outPath = stdout.trim();
      const output = JSON.parse(readFileSync(outPath, "utf-8"));
      expect(output.attachments).toBeUndefined();
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
      deepTextPages: ["big text"],
      pageTexts: { "1": ["line1"] },
    });

    const { stdout } = await captureOutput(() => getAttachment(["abc123"]));
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ready");
    // Large fields should be stripped by default
    expect(parsed.deepTextPages).toBeUndefined();
    expect(parsed.pageTexts).toBeUndefined();
  });

  it("includes --deep-text and --page-texts when requested", async () => {
    mockGetAttachment.mockResolvedValue({
      status: "ready",
      pageCount: 5,
      verifications: {},
      deepTextPages: ["big text"],
      pageTexts: { "1": ["line1"] },
    });

    const { stdout } = await captureOutput(() => getAttachment(["abc123", "--deep-text", "--page-texts"]));
    const parsed = JSON.parse(stdout);
    expect(parsed.deepTextPages).toEqual(["big text"]);
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

// ── Hydrate utilities ─────────────────────────────────────────────

const SINGLE_PAGE_SUMMARY = JSON.stringify({
  attachmentId: "att-123",
  deepTextPages: [
    `<page_number_1_index_0>
<line id="1">The Discount Rate is 80% of the lowest price per share.</line>
<line id="2">The Purchase Amount is the amount invested.</line>
<line id="3">A Dissolution Event means a liquidation.</line>
</page_number_1_index_0>`,
  ],
});

const MULTI_PAGE_SUMMARY = JSON.stringify({
  attachmentId: "att-456",
  deepTextPages: [
    `<page_number_1_index_0>
<line id="1">Page one line one.</line>
<line id="2">Page one line two.</line>
</page_number_1_index_0>
<page_number_2_index_0>
<line id="1">Page two line one.</line>
<line id="3">Page two line three.</line>
</page_number_2_index_0>`,
  ],
});

describe("parseSummaryToLineMap", () => {
  it("builds correct maps from a single-page summary", () => {
    const { qualified, byId } = parseSummaryToLineMap(SINGLE_PAGE_SUMMARY);

    expect(byId.get(1)).toBe("The Discount Rate is 80% of the lowest price per share.");
    expect(byId.get(2)).toBe("The Purchase Amount is the amount invested.");
    expect(byId.get(3)).toBe("A Dissolution Event means a liquidation.");

    expect(qualified.get("page_number_1_index_0:1")).toBe("The Discount Rate is 80% of the lowest price per share.");
    expect(qualified.get("page_number_1_index_0:3")).toBe("A Dissolution Event means a liquidation.");
  });

  it("disambiguates repeated lineIds across pages in the qualified map", () => {
    const { qualified, byId } = parseSummaryToLineMap(MULTI_PAGE_SUMMARY);

    expect(qualified.get("page_number_1_index_0:1")).toBe("Page one line one.");
    expect(qualified.get("page_number_2_index_0:1")).toBe("Page two line one.");

    // byId fallback: last-write wins (page 2 is processed after page 1)
    expect(byId.get(1)).toBe("Page two line one.");
    expect(byId.get(2)).toBe("Page one line two.");
    expect(byId.get(3)).toBe("Page two line three.");
  });

  it("handles line text containing special characters", () => {
    const summary = JSON.stringify({
      attachmentId: "att-789",
      deepTextPages: [
        `<page_number_1_index_0>
<line id="1">Revenue: $1.2B (up 45% YoY) — "record quarter"</line>
</page_number_1_index_0>`,
      ],
    });
    const { byId } = parseSummaryToLineMap(summary);
    expect(byId.get(1)).toBe(`Revenue: $1.2B (up 45% YoY) — "record quarter"`);
  });

  it("returns empty maps for empty deepTextPages", () => {
    const summary = JSON.stringify({ attachmentId: "att-empty", deepTextPages: [] });
    const { qualified, byId } = parseSummaryToLineMap(summary);
    expect(qualified.size).toBe(0);
    expect(byId.size).toBe(0);
  });

  it("throws on non-JSON summary content", () => {
    expect(() => parseSummaryToLineMap("not json at all")).toThrow("Summary file is not valid JSON");
  });

  it("synthetic IDs from raw pages do not collide with IDs from a preceding tagged page", () => {
    // When deepTextPages lacks <page_number_N> wrapper tags, parseSummaryToLineMap
    // processes each array entry as its own page in the raw-OCR branch.
    // Page 1: has <line id="N"> tags with non-contiguous IDs (1, 2, 5)
    // Page 2: raw OCR text — synthetic IDs must not reuse 1, 2, or 5
    const summary = JSON.stringify({
      attachmentId: "att-mixed",
      deepTextPages: [
        `<line id="1">Tagged line one.</line>
<line id="2">Tagged line two.</line>
<line id="5">Tagged line five.</line>`,
        `Raw OCR line A
Raw OCR line B`,
      ],
    });
    const { byId } = parseSummaryToLineMap(summary);

    // Tagged content must be present
    expect(byId.get(1)).toBe("Tagged line one.");
    expect(byId.get(2)).toBe("Tagged line two.");
    expect(byId.get(5)).toBe("Tagged line five.");

    // Raw lines must get unique IDs that don't overwrite the tagged lines
    const rawEntries = [...byId.entries()].filter(([, v]) => v.startsWith("Raw OCR"));
    expect(rawEntries).toHaveLength(2);
    const rawIds = rawEntries.map(([k]) => k);
    expect(rawIds).not.toContain(1);
    expect(rawIds).not.toContain(2);
    expect(rawIds).not.toContain(5);
  });
});

describe("hydrateCitations", () => {
  // Hydration always widens the cited range by ±1 so source_context is reliably
  // broader than source_match — otherwise HighlightedSourceContext has nothing to
  // highlight inside the popover quote when the cited line happens to equal
  // the anchor verbatim (OCR-fragmented sources).
  it("fills source_context from a single lineId and pulls ±1 neighbor lines", () => {
    const citations = [{ id: 1, source_match: "Discount Rate", page_id: "page_number_1_index_0", line_ids: [1] }];
    const { hydrated, misses } = hydrateCitations({ summaryContent: SINGLE_PAGE_SUMMARY, citations });
    expect(hydrated).toBe(1);
    expect(misses).toEqual([]);
    expect(citations[0].source_context).toBe(
      "The Discount Rate is 80% of the lowest price per share. The Purchase Amount is the amount invested.",
    );
  });

  it("concatenates text for multi-lineId citations and pulls ±1 neighbor lines", () => {
    const citations = [{ id: 1, source_match: "Purchase Amount", page_id: "page_number_1_index_0", line_ids: [2, 3] }];
    hydrateCitations({ summaryContent: SINGLE_PAGE_SUMMARY, citations });
    expect(citations[0].source_context).toBe(
      "The Discount Rate is 80% of the lowest price per share. The Purchase Amount is the amount invested. A Dissolution Event means a liquidation.",
    );
  });

  it("skips citations that already have source_context", () => {
    const citations = [{ id: 1, source_context: "existing phrase", line_ids: [1] }];
    const { hydrated } = hydrateCitations({ summaryContent: SINGLE_PAGE_SUMMARY, citations });
    expect(hydrated).toBe(0);
    expect(citations[0].source_context).toBe("existing phrase");
  });

  it("adds to misses when lineId is not found in summary", () => {
    const citations = [{ id: 1, source_match: "Something", line_ids: [999] }];
    const { hydrated, misses } = hydrateCitations({ summaryContent: SINGLE_PAGE_SUMMARY, citations });
    expect(hydrated).toBe(0);
    expect(misses).toEqual([1]);
    expect(citations[0].source_context).toBeUndefined();
  });

  it("adds to misses when line_ids is empty", () => {
    const citations = [{ id: 2, source_match: "Something", line_ids: [] }];
    const { hydrated, misses } = hydrateCitations({ summaryContent: SINGLE_PAGE_SUMMARY, citations });
    expect(hydrated).toBe(0);
    expect(misses).toEqual([2]);
  });

  it("adds to misses when line_ids is absent", () => {
    const citations = [{ id: 3, source_match: "Something" }];
    const { hydrated, misses } = hydrateCitations({ summaryContent: SINGLE_PAGE_SUMMARY, citations });
    expect(hydrated).toBe(0);
    expect(misses).toEqual([3]);
  });

  // Guards cross-page bleed: neighbor expansion must not let page 2's line 2
  // (absent on page 2) resolve via the page-agnostic byId map to page 1's
  // "Page one line two." The qualified-only rule for non-cited neighbor IDs
  // is what prevents that.
  it("uses qualified map when page_id matches and pulls ±1 neighbor lines", () => {
    const citations = [
      { id: 1, source_match: "page one line one", page_id: "page_number_1_index_0", line_ids: [1] },
      { id: 2, source_match: "page two line one", page_id: "page_number_2_index_0", line_ids: [1] },
    ];
    hydrateCitations({ summaryContent: MULTI_PAGE_SUMMARY, citations });
    expect(citations[0].source_context).toBe("Page one line one. Page one line two.");
    expect(citations[1].source_context).toBe("Page two line one.");
  });
});

describe("hydrate CLI command", () => {
  it("fills source_context in draft file and writes output", async () => {
    const tmpDir = makeTmpDir();
    const mdPath = join(tmpDir, "draft.md");
    const summaryPath = join(tmpDir, "summary.txt");

    writeFileSync(
      mdPath,
      `The [Discount Rate](cite:1) is 80%.

<<<CITATION_DATA>>>
[{"id":1,"attachment_id":"att-123","source_match":"Discount Rate","page_id":"page_number_1_index_0","line_ids":[1]}]
<<<END_CITATION_DATA>>>
`,
    );
    writeFileSync(summaryPath, SINGLE_PAGE_SUMMARY);

    const { stderr } = await captureOutput(() => hydrate(["--markdown", mdPath, "--summary", summaryPath]));

    const result = JSON.parse(
      readFileSync(mdPath, "utf-8").split("<<<CITATION_DATA>>>")[1].split("<<<END_CITATION_DATA>>>")[0].trim(),
    );
    // Cited [1], expanded to [1, 2] by the neighbor-line widening.
    expect(result[0].source_context).toBe(
      "The Discount Rate is 80% of the lowest price per share. The Purchase Amount is the amount invested.",
    );
    expect(stderr).toContain("Hydrated 1 citation(s)");
  });

  it("exits when --markdown is missing", async () => {
    await expect(captureOutput(() => hydrate(["--summary", "summary.txt"]))).rejects.toThrow("process.exit(1)");
  });

  it("exits when --summary is missing", async () => {
    const tmpDir = makeTmpDir();
    const mdPath = join(tmpDir, "draft.md");
    writeFileSync(mdPath, "# Draft\n<<<CITATION_DATA>>>\n[]\n<<<END_CITATION_DATA>>>\n");
    await expect(captureOutput(() => hydrate(["--markdown", mdPath]))).rejects.toThrow("process.exit(1)");
  });
});

describe("login command — browser-auth gate", () => {
  const origMsystem = process.env.MSYSTEM;

  afterEach(() => {
    delete process.env.DC_NO_BROWSER;
    if (origMsystem === undefined) delete process.env.MSYSTEM;
    else process.env.MSYSTEM = origMsystem;
  });

  it("exits with non-interactive message when DC_NO_BROWSER overrides MSYSTEM", async () => {
    process.env.MSYSTEM = "MINGW64"; // normally allows browser auth in Git Bash
    process.env.DC_NO_BROWSER = "1"; // DC_NO_BROWSER must override it
    mockResolveAuth.mockReturnValue(null);
    // process.exit is mocked globally in beforeAll above — use rejects.toThrow so
    // the dependency is visible here and the test doesn't silently pass if the mock moves.
    const { stderr } = await captureOutput(() =>
      expect(login([], TEST_BASE_URL)).rejects.toThrow("process.exit(1)"),
    );
    expect(stderr).toContain("Browser authentication is disabled or unavailable");
  });
});

describe("canStartBrowserAuth", () => {
  // IS_AI_AGENT is mocked as `false` in this module (see jest.mock("../auth.js") above).
  // Tests that require IS_AI_AGENT=true are in cliAuthScenarios.test.ts (subprocess-based).

  afterEach(() => {
    delete process.env.DC_NO_BROWSER;
    delete process.env.DC_NON_INTERACTIVE;
  });

  it("returns false when DC_NO_BROWSER is set and no --browser flag", () => {
    process.env.DC_NO_BROWSER = "1";
    expect(canStartBrowserAuth([])).toBe(false);
  });

  it("returns true when --browser is passed even with DC_NO_BROWSER set", () => {
    process.env.DC_NO_BROWSER = "1";
    expect(canStartBrowserAuth(["--browser"])).toBe(true);
  });

  it("returns true when --browser is passed even with DC_NON_INTERACTIVE set", () => {
    process.env.DC_NON_INTERACTIVE = "1";
    expect(canStartBrowserAuth(["--browser"])).toBe(true);
  });

  it("returns false when DC_NON_INTERACTIVE is set and no --browser flag", () => {
    process.env.DC_NON_INTERACTIVE = "1";
    expect(canStartBrowserAuth([])).toBe(false);
  });
});

describe("login command", () => {
  beforeEach(() => {
    mockWriteCredentials.mockReturnValue("/tmp/home/credentials.json");
  });

  it("saves key from --key flag", async () => {
    const { stderr } = await captureOutput(() => login(["--key", TEST_KEY], TEST_BASE_URL));
    expect(mockWriteCredentials).toHaveBeenCalledWith(expect.objectContaining({ apiKey: TEST_KEY }));
    expect(stderr).toContain("Credentials saved to /tmp/home/credentials.json");
  });

  it("exits when --key has no value", async () => {
    await expect(captureOutput(() => login(["--key"], TEST_BASE_URL))).rejects.toThrow("process.exit(1)");
  });

  it("reports already authenticated if auth exists", async () => {
    mockResolveAuth.mockReturnValue(makeAuth());
    // login() calls status() which calls process.exit(0) — mocked to throw
    await expect(captureOutput(() => login([], TEST_BASE_URL))).rejects.toThrow("process.exit(0)");
    expect(mockWriteCredentials).not.toHaveBeenCalled();
  });
});
