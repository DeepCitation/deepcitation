import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeWindowOpen, sanitizeUrl } from "../react/urlUtils.js";

describe("sanitizeUrl", () => {
  // Safe protocols
  it("allows https URLs", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("allows http URLs", () => {
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("allows https URLs with paths and query strings", () => {
    const url = "https://example.com/path?q=test&page=1#section";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("preserves the original URL string exactly", () => {
    const url = "https://Example.COM/Path";
    expect(sanitizeUrl(url)).toBe(url);
  });

  // Dangerous protocols
  it("blocks javascript: protocol", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("blocks javascript: with encoded characters", () => {
    expect(sanitizeUrl("javascript:alert('xss')")).toBeNull();
  });

  it("blocks data: protocol", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("blocks data: with base64", () => {
    expect(sanitizeUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBeNull();
  });

  it("blocks vbscript: protocol", () => {
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("blocks file: protocol", () => {
    expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
  });

  it("blocks blob: protocol", () => {
    expect(sanitizeUrl("blob:http://example.com/uuid")).toBeNull();
  });

  it("blocks ftp: protocol", () => {
    expect(sanitizeUrl("ftp://example.com/file")).toBeNull();
  });

  // Malformed URLs
  it("returns null for empty string", () => {
    expect(sanitizeUrl("")).toBeNull();
  });

  it("returns null for non-URL strings", () => {
    expect(sanitizeUrl("not a url")).toBeNull();
  });

  it("returns null for protocol-relative URLs without base", () => {
    expect(sanitizeUrl("//example.com/path")).toBeNull();
  });

  it("returns null for just a domain without protocol", () => {
    expect(sanitizeUrl("example.com")).toBeNull();
  });
});

describe("safeWindowOpen", () => {
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openSpy = vi.fn();
    // Create a minimal window mock for the Node test environment
    vi.stubGlobal("window", { open: openSpy });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens safe https URLs", () => {
    safeWindowOpen("https://example.com");
    expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
  });

  it("opens safe http URLs", () => {
    safeWindowOpen("http://example.com");
    expect(openSpy).toHaveBeenCalledWith("http://example.com", "_blank", "noopener,noreferrer");
  });

  it("does not open javascript: URLs", () => {
    safeWindowOpen("javascript:alert(1)");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("does not open data: URLs", () => {
    safeWindowOpen("data:text/html,<script>alert(1)</script>");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("does not open malformed URLs", () => {
    safeWindowOpen("not a url");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("does not open empty strings", () => {
    safeWindowOpen("");
    expect(openSpy).not.toHaveBeenCalled();
  });
});
