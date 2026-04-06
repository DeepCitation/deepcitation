import { describe, expect, it, jest } from "@jest/globals";
import {
  CLAUDE_COWORK_DOMAIN_HINT,
  extractApiKey,
  formatNetworkError,
  isValidApiKeyFormat,
  parseArgs,
} from "../cli/cliUtils.js";
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
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
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
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
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
    expect(result).toContain("Payment required");
    expect(result).toContain("npx deepcitation billing");
    expect(result).toContain(`${BASE_URL}/billing`);
    expect(result).toContain("$0.05/doc");
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
    expect(result).toContain("Pay-as-you-go");
    expect(result).toContain("spend cap");
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
