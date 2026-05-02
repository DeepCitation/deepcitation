import type { Mock } from "bun:test";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

mock.module("node:fs", () => ({
  existsSync: mock(() => false),
  mkdirSync: mock(() => {}),
  readFileSync: mock(() => {
    throw new Error("ENOENT");
  }),
  writeFileSync: mock(() => {}),
}));
mock.module("node:os", () => ({
  homedir: mock(() => "/tmp/test-home"),
}));

import {
  CLAUDE_COWORK_DOMAIN_HINT,
  checkForUpdate,
  extractApiKey,
  formatNetworkError,
  isValidApiKeyFormat,
  parseArgs,
} from "../cli/cliUtils.js";
import { TimeoutError } from "../cli/proxy.js";
import { PaymentRequiredError } from "../client/errors.js";

// ── parseArgs ─────────────────────────────────────────────────────

describe("parseArgs", () => {
  const HELP = "test help text";

  it("extracts --key value pairs", () => {
    const result = parseArgs(["--html", "file.html", "--out", "out.html"], HELP);
    expect(result).toEqual({ html: "file.html", out: "out.html" });
  });

  it("returns empty object for empty argv", () => {
    expect(parseArgs([], HELP)).toEqual({});
  });

  it("ignores flag without value at end of argv", () => {
    // --html has no value after it
    const result = parseArgs(["--html"], HELP);
    expect(result).toEqual({});
  });

  it("ignores non-flag positional args", () => {
    const result = parseArgs(["prepare", "--out", "f.json"], HELP);
    expect(result).toEqual({ out: "f.json" });
  });

  it("last flag wins when duplicated", () => {
    const result = parseArgs(["--out", "a.json", "--out", "b.json"], HELP);
    expect(result).toEqual({ out: "b.json" });
  });

  it("exits with 0 on -h", () => {
    const exitSpy = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    try {
      parseArgs(["-h"], HELP);
    } catch {
      // expected
    }
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(HELP);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("exits with 0 on --help", () => {
    const exitSpy = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    try {
      parseArgs(["--help"], HELP);
    } catch {
      // expected
    }
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("handles mixed flags and positionals", () => {
    const result = parseArgs(["--theme", "dark", "extra", "--indicator", "dot"], HELP);
    expect(result).toEqual({ theme: "dark", indicator: "dot" });
  });

  it("strips leading dashes from key names", () => {
    const result = parseArgs(["--image-format", "avif"], HELP);
    expect(result).toEqual({ "image-format": "avif" });
  });
});

// ── formatNetworkError ────────────────────────────────────────────

describe("formatNetworkError", () => {
  const BASE_URL = "https://deepcitation.com";

  it("formats PaymentRequiredError with billing instructions", () => {
    const err = new PaymentRequiredError("Free tier exhausted", "billing_quota_exceeded");
    const result = formatNetworkError(err, BASE_URL);
    expect(result).toContain("Quota reached");
    expect(result).toContain("npx deepcitation billing");
    expect(result).toContain(`${BASE_URL}/billing`);
    expect(result).toContain("Manage your plan");
  });

  it("formats ENOTFOUND without proxy env as network hint", () => {
    const saved = { HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY };
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    try {
      const result = formatNetworkError(new Error("getaddrinfo ENOTFOUND api.deepcitation.com"), BASE_URL);
      expect(result).toContain("Network error");
      expect(result).toContain("set HTTPS_PROXY");
    } finally {
      if (saved.HTTPS_PROXY !== undefined) process.env.HTTPS_PROXY = saved.HTTPS_PROXY;
      if (saved.HTTP_PROXY !== undefined) process.env.HTTP_PROXY = saved.HTTP_PROXY;
    }
  });

  it("formats ENOTFOUND with proxy env as proxy hint", () => {
    const saved = process.env.HTTPS_PROXY;
    process.env.HTTPS_PROXY = "http://proxy:3128";
    try {
      const result = formatNetworkError(new Error("getaddrinfo ENOTFOUND"), BASE_URL);
      expect(result).toContain("Proxy is set but may not be working");
      expect(result).toContain("NO_PROXY=api.deepcitation.com");
    } finally {
      if (saved !== undefined) {
        process.env.HTTPS_PROXY = saved;
      } else {
        delete process.env.HTTPS_PROXY;
      }
    }
  });

  it("formats 'fetch failed' errors as network errors", () => {
    const saved = { HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY };
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    try {
      const result = formatNetworkError(new Error("fetch failed"), BASE_URL);
      expect(result).toContain("Network error");
    } finally {
      if (saved.HTTPS_PROXY !== undefined) process.env.HTTPS_PROXY = saved.HTTPS_PROXY;
      if (saved.HTTP_PROXY !== undefined) process.env.HTTP_PROXY = saved.HTTP_PROXY;
    }
  });

  it("formats EAI_AGAIN errors as network errors", () => {
    const saved = { HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY };
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    try {
      const result = formatNetworkError(new Error("EAI_AGAIN"), BASE_URL);
      expect(result).toContain("Network error");
    } finally {
      if (saved.HTTPS_PROXY !== undefined) process.env.HTTPS_PROXY = saved.HTTPS_PROXY;
      if (saved.HTTP_PROXY !== undefined) process.env.HTTP_PROXY = saved.HTTP_PROXY;
    }
  });

  it("passes through generic errors as-is", () => {
    const result = formatNetworkError(new Error("something broke"), BASE_URL);
    expect(result).toBe("something broke");
  });

  it("converts non-Error input to string", () => {
    const result = formatNetworkError("string error", BASE_URL);
    expect(result).toBe("string error");
  });

  it("converts number input to string", () => {
    const result = formatNetworkError(42, BASE_URL);
    expect(result).toBe("42");
  });

  it("exports CLAUDE_COWORK_DOMAIN_HINT with expected content", () => {
    expect(CLAUDE_COWORK_DOMAIN_HINT).toContain("Claude Cowork");
    expect(CLAUDE_COWORK_DOMAIN_HINT).toContain("allowed domains");
    expect(CLAUDE_COWORK_DOMAIN_HINT).toContain("deepcitation.com");
  });

  it("PaymentRequiredError includes billing URL from baseUrl param", () => {
    const err = new PaymentRequiredError("quota exceeded", "billing_quota_exceeded");
    const result = formatNetworkError(err, "https://deepcitation.com");
    expect(result).toContain("https://deepcitation.com/billing");
  });

  it("PaymentRequiredError includes actionable steps", () => {
    const err = new PaymentRequiredError("Free tier exhausted", "billing_quota_exceeded");
    const result = formatNetworkError(err, "https://deepcitation.com");
    expect(result).toContain("npx deepcitation billing");
    expect(result).toContain("Manage your plan");
  });

  it("proxy hint differs based on HTTP_PROXY (not just HTTPS_PROXY)", () => {
    const saved = { HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY };
    delete process.env.HTTPS_PROXY;
    process.env.HTTP_PROXY = "http://corp-proxy:8080";
    try {
      const result = formatNetworkError(new Error("fetch failed"), "https://dc.com");
      expect(result).toContain("Proxy is set but may not be working");
    } finally {
      delete process.env.HTTP_PROXY;
      if (saved.HTTPS_PROXY !== undefined) process.env.HTTPS_PROXY = saved.HTTPS_PROXY;
      if (saved.HTTP_PROXY !== undefined) process.env.HTTP_PROXY = saved.HTTP_PROXY;
    }
  });

  it("no proxy hint when neither HTTPS_PROXY nor HTTP_PROXY set", () => {
    const saved = { HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY };
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    try {
      const result = formatNetworkError(new Error("ENOTFOUND api.deepcitation.com"), "https://dc.com");
      expect(result).not.toContain("Proxy is set");
      expect(result).toContain("If behind a proxy");
    } finally {
      if (saved.HTTPS_PROXY !== undefined) process.env.HTTPS_PROXY = saved.HTTPS_PROXY;
      if (saved.HTTP_PROXY !== undefined) process.env.HTTP_PROXY = saved.HTTP_PROXY;
    }
  });

  // ── TimeoutError formatting ─────────────────────────────────────

  it("formats TimeoutError with structured human + marker output", () => {
    const err = new TimeoutError("response_headers", 60023, "http://localhost:3128", "api.deepcitation.com:443");
    const result = formatNetworkError(err, BASE_URL);
    // Human-readable preamble
    expect(result).toContain("timed out after 60023ms");
    expect(result).toContain("phase: response_headers");
    expect(result).toContain("api.deepcitation.com:443");
    expect(result).toContain("http://localhost:3128");
    // Anti-stumbling guidance
    expect(result).toContain("TRANSPORT failure");
    expect(result).toContain("install undici");
    expect(result).toContain("modify HTTP_PROXY");
    expect(result).toContain("retry with a smaller payload");
    expect(result).toContain("background this command");
    // Machine-parseable marker line on its own
    expect(result).toContain("__DC_ERROR__");
    const markerLine = result.split("\n").find(l => l.startsWith("__DC_ERROR__"));
    if (!markerLine) throw new Error("expected __DC_ERROR__ marker line in formatNetworkError output");
    const json = JSON.parse(markerLine.slice("__DC_ERROR__ ".length));
    expect(json.type).toBe("timeout");
    expect(json.phase).toBe("response_headers");
    expect(json.elapsedMs).toBe(60023);
    expect(json.target).toBe("api.deepcitation.com:443");
    expect(json.retryable).toBe(false);
    expect(json.recoverable).toBe(false);
  });

  it("formats TimeoutError for proxy_connect phase", () => {
    const err = new TimeoutError("proxy_connect", 5001, "http://localhost:3128", "api.deepcitation.com:443");
    const result = formatNetworkError(err, BASE_URL);
    expect(result).toContain("could not establish a TCP CONNECT");
    expect(result).toContain("phase: proxy_connect");
  });

  it("formats TimeoutError for tls_handshake phase", () => {
    const err = new TimeoutError("tls_handshake", 10005, "http://localhost:3128", "api.deepcitation.com:443");
    const result = formatNetworkError(err, BASE_URL);
    expect(result).toContain("TLS handshake stalled");
  });

  it("formats TimeoutError for response_idle phase", () => {
    const err = new TimeoutError("response_idle", 30100, "http://localhost:3128", "api.deepcitation.com:443");
    const result = formatNetworkError(err, BASE_URL);
    expect(result).toContain("stalled mid-stream");
  });

  it("formats TimeoutError for request_overall phase", () => {
    const err = new TimeoutError("request_overall", 90050, "http://localhost:3128", "api.deepcitation.com:443");
    const result = formatNetworkError(err, BASE_URL);
    expect(result).toContain("absolute 90-second ceiling");
  });

  it("redacts user:password@ from proxy URL in TimeoutError output", () => {
    const err = new TimeoutError(
      "response_headers",
      60023,
      "http://user:secret@proxy.example.com:3128",
      "api.deepcitation.com:443",
    );
    const result = formatNetworkError(err, BASE_URL);
    expect(result).not.toContain("secret");
    expect(result).toContain("//***@proxy.example.com:3128");
  });
});

// ── isValidApiKeyFormat ───────────────────────────────────────────

describe("isValidApiKeyFormat", () => {
  it("accepts valid key", () => {
    expect(isValidApiKeyFormat("sk-dc-abcdefghij1234567890")).toBe(true);
  });

  it("accepts key at minimum length (20 chars)", () => {
    expect(isValidApiKeyFormat("sk-dc-12345678901234")).toBe(true);
  });

  it("rejects key without sk-dc- prefix", () => {
    expect(isValidApiKeyFormat("abc12345678901234567890")).toBe(false);
  });

  it("rejects key that is too short", () => {
    expect(isValidApiKeyFormat("sk-dc-short")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidApiKeyFormat("")).toBe(false);
  });
});

// ── extractApiKey ───────────────────────────────────────────────

describe("extractApiKey", () => {
  const VALID_KEY = "sk-dc-validkey12345678";

  it("extracts bare key", () => {
    expect(extractApiKey(VALID_KEY)).toBe(VALID_KEY);
  });

  it("extracts key with surrounding whitespace", () => {
    expect(extractApiKey(`  ${VALID_KEY}  `)).toBe(VALID_KEY);
  });

  it("extracts key wrapped in double quotes", () => {
    expect(extractApiKey(`"${VALID_KEY}"`)).toBe(VALID_KEY);
  });

  it("extracts key wrapped in single quotes", () => {
    expect(extractApiKey(`'${VALID_KEY}'`)).toBe(VALID_KEY);
  });

  it("extracts key from full npx command with quotes", () => {
    expect(extractApiKey(`npx deepcitation login --key "${VALID_KEY}"`)).toBe(VALID_KEY);
  });

  it("extracts key from full npx command without quotes", () => {
    expect(extractApiKey(`npx deepcitation login --key ${VALID_KEY}`)).toBe(VALID_KEY);
  });

  it("extracts key embedded in other text", () => {
    expect(extractApiKey(`some text ${VALID_KEY} more text`)).toBe(VALID_KEY);
  });

  it("returns null for empty string", () => {
    expect(extractApiKey("")).toBeNull();
  });

  it("returns null for non-key text", () => {
    expect(extractApiKey("not-a-key")).toBeNull();
  });

  it("returns null for key that is too short", () => {
    expect(extractApiKey("sk-dc-short")).toBeNull();
  });
});

// ── checkForUpdate throttling ────────────────────────────────────

describe("checkForUpdate", () => {
  const stampPath = join("/tmp/test-home", ".deepcitation", "update-check");

  afterEach(() => {
    mock.restore();
    (readFileSync as Mock).mockImplementation(() => {
      throw new Error("ENOENT");
    });
  });

  it("skips fetch when stamp is recent (within 24h)", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "0.3.10" }),
    } as globalThis.Response);
    // Stamp is 1 minute old
    (readFileSync as Mock).mockReturnValue(String(Date.now() - 60_000));

    await checkForUpdate("0.3.10");

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("fetches when stamp is older than 24h", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "0.3.10" }),
    } as globalThis.Response);
    // Stamp is 25 hours old
    (readFileSync as Mock).mockReturnValue(String(Date.now() - 25 * 60 * 60 * 1000));

    await checkForUpdate("0.3.10");

    expect(fetchSpy).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledWith(stampPath, expect.any(String), "utf8");
    fetchSpy.mockRestore();
  });

  it("fetches when no stamp file exists", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "0.3.10" }),
    } as globalThis.Response);
    // readFileSync throws (no file) — default mock behavior

    await checkForUpdate("0.3.10");

    expect(fetchSpy).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledWith(stampPath, expect.any(String), "utf8");
    fetchSpy.mockRestore();
  });

  it("writes stderr when a newer version is available", async () => {
    const stderrSpy = spyOn(process.stderr, "write").mockReturnValue(true);
    spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "99.0.0" }),
    } as globalThis.Response);

    await checkForUpdate("0.3.10");

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Update available"));
    stderrSpy.mockRestore();
  });

  it("does not write stderr when versions match", async () => {
    const stderrSpy = spyOn(process.stderr, "write").mockReturnValue(true);
    spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "0.3.10" }),
    } as globalThis.Response);

    await checkForUpdate("0.3.10");

    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});
