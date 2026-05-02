import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { decodeChunked, detectProxyUrl } from "../utils/proxy.js";

// ── detectProxyUrl ──────────────────────────────────────────────────

describe("detectProxyUrl", () => {
  const PROXY_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy"] as const;
  const saved = Object.fromEntries(PROXY_KEYS.map(k => [k, process.env[k]]));

  beforeEach(() => {
    // Guarantee a clean baseline — no proxy env vars leak between tests
    for (const key of PROXY_KEYS) delete process.env[key];
  });

  afterEach(() => {
    // Restore original env state
    for (const key of PROXY_KEYS) {
      if (saved[key] !== undefined) {
        process.env[key] = saved[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("returns HTTPS_PROXY for https targets", () => {
    process.env.HTTPS_PROXY = "http://proxy:3128";
    expect(detectProxyUrl("https://api.example.com/v1")).toBe("http://proxy:3128");
  });

  it("prefers HTTPS_PROXY over HTTP_PROXY for https targets", () => {
    process.env.HTTPS_PROXY = "http://https-proxy:3128";
    process.env.HTTP_PROXY = "http://http-proxy:3128";
    expect(detectProxyUrl("https://api.example.com/v1")).toBe("http://https-proxy:3128");
  });

  it("falls back to HTTP_PROXY for https targets when HTTPS_PROXY unset", () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    process.env.HTTP_PROXY = "http://fallback:3128";
    expect(detectProxyUrl("https://api.example.com/v1")).toBe("http://fallback:3128");
  });

  it("returns HTTP_PROXY for http targets", () => {
    process.env.HTTP_PROXY = "http://proxy:3128";
    expect(detectProxyUrl("http://api.example.com/v1")).toBe("http://proxy:3128");
  });

  it("returns undefined when no proxy env vars set", () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    expect(detectProxyUrl("https://api.example.com/v1")).toBeUndefined();
  });

  it("returns undefined when NO_PROXY is *", () => {
    process.env.HTTPS_PROXY = "http://proxy:3128";
    process.env.NO_PROXY = "*";
    expect(detectProxyUrl("https://api.example.com/v1")).toBeUndefined();
  });

  it("excludes exact hostname matches in NO_PROXY", () => {
    process.env.HTTPS_PROXY = "http://proxy:3128";
    process.env.NO_PROXY = "api.example.com";
    expect(detectProxyUrl("https://api.example.com/v1")).toBeUndefined();
  });

  it("excludes subdomain matches in NO_PROXY", () => {
    process.env.HTTPS_PROXY = "http://proxy:3128";
    process.env.NO_PROXY = "example.com";
    expect(detectProxyUrl("https://api.example.com/v1")).toBeUndefined();
  });

  it("handles leading-dot NO_PROXY entries (curl convention)", () => {
    process.env.HTTPS_PROXY = "http://proxy:3128";
    process.env.NO_PROXY = ".example.com";
    // Leading dot should match both example.com itself and subdomains
    expect(detectProxyUrl("https://example.com/v1")).toBeUndefined();
    expect(detectProxyUrl("https://api.example.com/v1")).toBeUndefined();
  });

  it("does not match partial domain names in NO_PROXY", () => {
    process.env.HTTPS_PROXY = "http://proxy:3128";
    process.env.NO_PROXY = "ample.com";
    // "example.com" should NOT match "ample.com" — requires full segment match
    expect(detectProxyUrl("https://example.com/v1")).toBe("http://proxy:3128");
  });

  it("handles comma-separated NO_PROXY with spaces", () => {
    process.env.HTTPS_PROXY = "http://proxy:3128";
    process.env.NO_PROXY = " localhost , example.com , 127.0.0.1 ";
    expect(detectProxyUrl("https://example.com/v1")).toBeUndefined();
    expect(detectProxyUrl("https://other.com/v1")).toBe("http://proxy:3128");
  });

  it("is case-insensitive for NO_PROXY matching", () => {
    process.env.HTTPS_PROXY = "http://proxy:3128";
    process.env.NO_PROXY = "Example.COM";
    expect(detectProxyUrl("https://api.example.com/v1")).toBeUndefined();
  });

  it("reads lowercase env vars", () => {
    process.env.https_proxy = "http://lowercase:3128";
    delete process.env.HTTPS_PROXY;
    expect(detectProxyUrl("https://api.example.com/v1")).toBe("http://lowercase:3128");
  });
});

// ── decodeChunked ───────────────────────────────────────────────────

describe("decodeChunked", () => {
  it("decodes a single chunk", () => {
    const encoded = Buffer.from("5\r\nhello\r\n0\r\n\r\n");
    expect(decodeChunked(encoded).toString()).toBe("hello");
  });

  it("decodes multiple chunks", () => {
    const encoded = Buffer.from("5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n");
    expect(decodeChunked(encoded).toString()).toBe("hello world");
  });

  it("handles hex chunk sizes", () => {
    const data = "a".repeat(255);
    const encoded = Buffer.from(`ff\r\n${data}\r\n0\r\n\r\n`);
    expect(decodeChunked(encoded).toString()).toBe(data);
  });

  it("returns empty buffer for zero-length chunked body", () => {
    const encoded = Buffer.from("0\r\n\r\n");
    expect(decodeChunked(encoded).length).toBe(0);
  });

  it("returns empty buffer for empty input", () => {
    expect(decodeChunked(Buffer.alloc(0)).length).toBe(0);
  });

  it("preserves binary data", () => {
    const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f]);
    const encoded = Buffer.concat([Buffer.from("4\r\n"), binary, Buffer.from("\r\n0\r\n\r\n")]);
    expect(decodeChunked(encoded)).toEqual(binary);
  });
});
