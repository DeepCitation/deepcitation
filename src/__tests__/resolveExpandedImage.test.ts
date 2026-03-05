/**
 * Tests for resolveExpandedImage() — fallback resolver
 * for the expanded page viewer's image source.
 *
 * Security model: each source is validated with isValidProofImageSrc() before use.
 * Trusted: HTTPS from api.deepcitation.com / cdn.deepcitation.com / proof.deepcitation.com,
 *          localhost (dev), same-origin relative paths, safe raster data URIs.
 * Rejected: SVG data URIs, javascript: URIs, arbitrary HTTPS hosts, relative paths with `..` traversal.
 * Invalid sources are skipped and the next tier is tried.
 * Correctness: validates cascade priority (matchPage -> proofImage -> proofPage.url (derived) -> webCapture).
 */

import { describe, expect, it } from "@jest/globals";
import { resolveExpandedImage } from "../react/EvidenceTray";
import type { Verification } from "../types/verification";

// Representative image URLs for tests
const TRUSTED_IMG = "https://api.deepcitation.com/proof/img.png";
const TRUSTED_CDN_IMG = "https://cdn.deepcitation.com/proof/page1.avif";
const TRUSTED_PROOF_IMG = "https://proof.deepcitation.com/p/abc123?format=avif&view=page";

// Same-origin relative paths — allowed (served from current host)
const RELATIVE_PATH_IMG = "/demo/legal/page-1.avif";

// Localhost — allowed (dev environment)
const LOCALHOST_IMG = "http://localhost:3000/proof/img.png";
// Untrusted external host — rejected even over HTTPS
const UNTRUSTED_HTTPS_IMG = "https://evil.example.com/proof/img.png";
// Dangerous data URI types — rejected
const SVG_DATA_URI = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=";
const JAVASCRIPT_URI = "javascript:alert(1)";
// Path traversal — rejected even though it starts with /
const TRAVERSAL_PATH = "/demo/../../etc/passwd";
// URL-encoded path traversal — %2e%2e decodes to ..
const ENCODED_TRAVERSAL_PATH = "/demo/%2e%2e/%2e%2e/etc/passwd";
// Protocol-relative URL — rejected (resolves to external host)
const PROTOCOL_RELATIVE_URL = "//evil.com/proof/img.avif";
// Unicode fullwidth dots — rejected (U+FF0E lookalike for .)
const UNICODE_FULLWIDTH_TRAVERSAL = "/demo/\uFF0E\uFF0E/\uFF0E\uFF0E/secret";
// Unicode one dot leader — rejected (U+2024 lookalike)
const UNICODE_ONE_DOT_LEADER = "/demo/\u2024\u2024/secret";
// Double-encoded traversal — %25 = %, so %252e = %2e after first decode
const DOUBLE_ENCODED_TRAVERSAL = "/demo/%252e%252e/%252e%252e/etc/passwd";
// Triple-encoded traversal — tests iterative decoding thoroughly
const TRIPLE_ENCODED_TRAVERSAL = "/demo/%25252e%25252e/etc/passwd";
// Null byte injection — C truncation attack
const NULL_BYTE_PATH = "/safe/path\0../../etc/passwd";
const ENCODED_NULL_BYTE = "/safe/path%00../../etc/passwd";

describe("resolveExpandedImage", () => {
  describe("null/undefined handling", () => {
    it("returns null for null verification", () => {
      expect(resolveExpandedImage(null)).toBeNull();
    });

    it("returns null for undefined verification", () => {
      expect(resolveExpandedImage(undefined)).toBeNull();
    });

    it("returns null for verification with no image sources", () => {
      const verification: Verification = {
        status: "found",
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });
  });

  describe("cascade priority", () => {
    it("prefers matchPage over proofImage and evidenceSnippet", () => {
      const verification: Verification = {
        status: "found",
        document: { verifiedPageNumber: 1 },
        assets: {
          pageRenders: [
            {
              pageNumber: 1,
              isMatchPage: true,
              imageUrl: TRUSTED_IMG,
              dimensions: { width: 800, height: 1200 },
              highlightBox: { x: 10, y: 20, width: 100, height: 50 },
            },
          ],
          proofImage: { url: TRUSTED_CDN_IMG },
          evidenceSnippet: { src: TRUSTED_IMG },
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result to be non-null");
      expect(result.src).toBe(TRUSTED_IMG);
      expect(result.dimensions).toEqual({ width: 800, height: 1200 });
      expect(result.highlightBox).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it("falls back to proofImage when no matchPage exists", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            {
              pageNumber: 1,
              isMatchPage: false,
              imageUrl: TRUSTED_IMG,
              dimensions: { width: 800, height: 1200 },
            },
          ],
          proofImage: { url: TRUSTED_CDN_IMG },
          evidenceSnippet: { src: TRUSTED_IMG },
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.src).toBe(TRUSTED_CDN_IMG);
      expect(result.dimensions).toBeNull();
      expect(result.highlightBox).toBeNull();
    });

    it("returns null when only evidenceSnippet is present (tier 4 removed)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: TRUSTED_IMG,
            dimensions: { width: 600, height: 900 },
          },
        },
      };

      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("falls back to proofImage when matchPage has no imageUrl", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            {
              pageNumber: 1,
              isMatchPage: true,
              // no imageUrl field
              imageUrl: "" as unknown as string,
              dimensions: { width: 800, height: 1200 },
            },
          ],
          proofImage: { url: TRUSTED_CDN_IMG },
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.src).toBe(TRUSTED_CDN_IMG);
    });
  });

  describe("security: validation filters out dangerous sources", () => {
    it("accepts localhost matchPage source (dev environment)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            { pageNumber: 1, isMatchPage: true, imageUrl: LOCALHOST_IMG, dimensions: { width: 1, height: 1 } },
          ],
        },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(LOCALHOST_IMG);
    });

    it("returns null when only evidenceSnippet has data:image/png URI (tier 4 removed)", () => {
      const pngDataUri = "data:image/png;base64,iVBORw0KGgo=";
      const verification: Verification = {
        status: "found",
        assets: { evidenceSnippet: { src: pngDataUri } },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects untrusted HTTPS host — skips tier and returns null when no valid fallback", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            { pageNumber: 1, isMatchPage: true, imageUrl: UNTRUSTED_HTTPS_IMG, dimensions: { width: 1, height: 1 } },
          ],
        },
      };
      // tier 1 (untrusted host) is skipped; no valid fallback exists
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects SVG data URI — skips tier and returns null when no valid fallback", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            { pageNumber: 1, isMatchPage: true, imageUrl: SVG_DATA_URI, dimensions: { width: 1, height: 1 } },
          ],
        },
      };
      // SVG data URI skipped; no valid fallback exists
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects javascript: URI — returns null when no valid fallback", () => {
      const verification: Verification = {
        status: "found",
        assets: { proofImage: { url: JAVASCRIPT_URI } },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("returns null when proofImage is untrusted and no other valid sources exist", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          proofImage: { url: UNTRUSTED_HTTPS_IMG },
          evidenceSnippet: { src: TRUSTED_IMG },
        },
      };
      // evidenceSnippet is not a fallback for expanded view
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("returns valid matchPage source when all tiers present", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            { pageNumber: 1, isMatchPage: true, imageUrl: LOCALHOST_IMG, dimensions: { width: 1, height: 1 } },
          ],
          proofImage: { url: UNTRUSTED_HTTPS_IMG },
          evidenceSnippet: { src: SVG_DATA_URI },
        },
      };
      // localhost matchPage wins (valid tier 1)
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(LOCALHOST_IMG);
    });

    it("accepts proof.deepcitation.com as matchPage source (tier 1)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            {
              pageNumber: 1,
              isMatchPage: true,
              imageUrl: TRUSTED_PROOF_IMG,
              dimensions: { width: 800, height: 1200 },
            },
          ],
        },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(TRUSTED_PROOF_IMG);
    });

    it("accepts relative path as matchPage imageUrl — relative paths are valid sources", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            { pageNumber: 1, isMatchPage: true, imageUrl: RELATIVE_PATH_IMG, dimensions: { width: 800, height: 1200 } },
          ],
        },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(RELATIVE_PATH_IMG);
    });

    it("rejects relative path with .. traversal", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: TRAVERSAL_PATH,
          },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects URL-encoded path traversal (%2e%2e)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: ENCODED_TRAVERSAL_PATH,
          },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects protocol-relative URL (//evil.com)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            { pageNumber: 1, isMatchPage: true, imageUrl: PROTOCOL_RELATIVE_URL, dimensions: { width: 1, height: 1 } },
          ],
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects Unicode fullwidth dots (U+FF0E) traversal", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: UNICODE_FULLWIDTH_TRAVERSAL,
          },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects Unicode one dot leader (U+2024) lookalike", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: UNICODE_ONE_DOT_LEADER,
          },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects double-encoded path traversal (%252e%252e)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: DOUBLE_ENCODED_TRAVERSAL,
          },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects triple-encoded path traversal (%25252e%25252e)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: TRIPLE_ENCODED_TRAVERSAL,
          },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects null byte injection (literal \\0)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: NULL_BYTE_PATH,
          },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects URL-encoded null byte (%00)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: ENCODED_NULL_BYTE,
          },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });
  });

  describe("URL citation screenshot (tier 3 — webCapture.src)", () => {
    it("converts raw base64 string to data:image/jpeg;base64, URI", () => {
      const rawBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const verification: Verification = {
        status: "found",
        assets: { webCapture: { src: rawBase64 } },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(`data:image/jpeg;base64,${rawBase64}`);
      expect(result?.dimensions).toBeNull();
      expect(result?.highlightBox).toBeNull();
      expect(result?.textItems).toEqual([]);
    });

    it("accepts full data URI string as-is", () => {
      const dataUri = "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
      const verification: Verification = {
        status: "found",
        assets: { webCapture: { src: dataUri } },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(dataUri);
    });

    it("returns null when URL screenshot is an SVG data URI (no tier 4 fallback)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          webCapture: { src: SVG_DATA_URI },
        },
      };
      // SVG data URI is rejected by isValidProofImageSrc; no valid fallback
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("confirms cascade: matchPage > proofImage > webCapture (tier 3 reached when 1-2 invalid)", () => {
      const rawBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
      // tier 1 invalid, tier 2 invalid — should land on tier 3 (web capture)
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            { pageNumber: 1, isMatchPage: true, imageUrl: UNTRUSTED_HTTPS_IMG, dimensions: { width: 1, height: 1 } },
          ],
          proofImage: { url: UNTRUSTED_HTTPS_IMG },
          webCapture: { src: rawBase64 },
          evidenceSnippet: { src: TRUSTED_IMG },
        },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(`data:image/jpeg;base64,${rawBase64}`);
    });
  });

  describe("tier 2c — proofPage.url derived full-page PNG", () => {
    it("derives full-page PNG from proofPage.url by appending ?view=page&format=png", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          proofPage: { url: "https://api.deepcitation.com/proof/test123" },
        },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe("https://api.deepcitation.com/proof/test123?view=page&format=png");
      expect(result?.dimensions).toBeNull();
      expect(result?.highlightBox).toBeNull();
      expect(result?.textItems).toEqual([]);
    });

    it("merges view/format into existing proofPage.url query string", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          proofPage: { url: "https://api.deepcitation.com/proof/test123?highlight=true" },
        },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toContain("view=page");
      expect(result?.src).toContain("format=png");
      expect(result?.src).toContain("highlight=true");
    });

    it("rejects proofPage.url on untrusted host — falls through to null", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          proofPage: { url: "https://evil.example.com/proof/test123" },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("falls through on malformed proofPage.url", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          proofPage: { url: "://invalid-url" },
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("falls through untrusted proofPage.url to valid webCapture", () => {
      const rawBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
      const verification: Verification = {
        status: "found",
        assets: {
          proofPage: { url: "https://evil.example.com/proof/test123" },
          webCapture: { src: rawBase64 },
        },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(`data:image/jpeg;base64,${rawBase64}`);
    });

    it("proofImage (tier 2) takes priority over proofPage.url (tier 2c)", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          proofImage: { url: TRUSTED_CDN_IMG },
          proofPage: { url: "https://api.deepcitation.com/proof/test123" },
        },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(TRUSTED_CDN_IMG);
    });
  });

  describe("optional fields", () => {
    it("defaults highlightBox to null when matchPage has none", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            {
              pageNumber: 1,
              isMatchPage: true,
              imageUrl: TRUSTED_IMG,
              dimensions: { width: 800, height: 1200 },
            },
          ],
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.highlightBox).toBeNull();
    });

    it("defaults textItems to empty array when matchPage has none", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            {
              pageNumber: 1,
              isMatchPage: true,
              imageUrl: TRUSTED_IMG,
              dimensions: { width: 800, height: 1200 },
            },
          ],
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.textItems).toEqual([]);
    });

    it("passes through textItems from matchPage", () => {
      const textItems = [{ text: "hello", x: 0, y: 0, width: 50, height: 12 }];
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [
            {
              pageNumber: 1,
              isMatchPage: true,
              imageUrl: TRUSTED_IMG,
              dimensions: { width: 800, height: 1200 },
              textItems,
            },
          ],
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.textItems).toEqual(textItems);
    });

    it("returns null when only evidenceSnippet is present, even without dimensions", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          evidenceSnippet: {
            src: TRUSTED_IMG,
          },
        },
      };

      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("returns empty pageRenders array gracefully", () => {
      const verification: Verification = {
        status: "found",
        assets: {
          pageRenders: [],
          proofImage: { url: TRUSTED_CDN_IMG },
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.src).toBe(TRUSTED_CDN_IMG);
    });
  });
});
