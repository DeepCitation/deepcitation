/**
 * Tests for resolveExpandedImage() — the three-tier fallback resolver
 * for the expanded page viewer's image source.
 *
 * Security model: each source is validated with isValidProofImageSrc() before use.
 * Trusted: HTTPS from api.deepcitation.com / cdn.deepcitation.com / proof.deepcitation.com,
 *          localhost (dev), same-origin relative paths, safe raster data URIs.
 * Rejected: SVG data URIs, javascript: URIs, arbitrary HTTPS hosts, relative paths with `..` traversal.
 * Invalid sources are skipped and the next tier is tried.
 * Correctness: validates cascade priority (matchPage → proofImageUrl → verificationImageSrc).
 */

import { describe, expect, it } from "@jest/globals";
import { resolveExpandedImage } from "../react/CitationComponent";
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
    it("prefers matchPage over proofImageUrl and verificationImageSrc", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            source: TRUSTED_IMG,
            dimensions: { width: 800, height: 1200 },
            highlightBox: { x: 10, y: 20, width: 100, height: 50 },
          },
        ],
        proof: { proofImageUrl: TRUSTED_CDN_IMG },
        document: {
          verificationImageSrc: TRUSTED_IMG,
          verifiedPageNumber: 1,
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result to be non-null");
      expect(result.src).toBe(TRUSTED_IMG);
      expect(result.dimensions).toEqual({ width: 800, height: 1200 });
      expect(result.highlightBox).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it("falls back to proofImageUrl when no matchPage exists", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: false,
            source: TRUSTED_IMG,
          },
        ],
        proof: { proofImageUrl: TRUSTED_CDN_IMG },
        document: {
          verificationImageSrc: TRUSTED_IMG,
          verifiedPageNumber: 1,
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.src).toBe(TRUSTED_CDN_IMG);
      expect(result.dimensions).toBeNull();
      expect(result.highlightBox).toBeNull();
    });

    it("falls back to verificationImageSrc when no matchPage or proofImageUrl", () => {
      const verification: Verification = {
        status: "found",
        document: {
          verificationImageSrc: TRUSTED_IMG,
          verificationImageDimensions: { width: 600, height: 900 },
          verifiedPageNumber: 1,
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.src).toBe(TRUSTED_IMG);
      if (!result) throw new Error("Expected result");
      expect(result.dimensions).toEqual({ width: 600, height: 900 });
      if (!result) throw new Error("Expected result");
      expect(result.highlightBox).toBeNull();
    });

    it("falls back to proofImageUrl when matchPage has no source", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            // no source field
          },
        ],
        proof: { proofImageUrl: TRUSTED_CDN_IMG },
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
        pages: [{ pageNumber: 1, isMatchPage: true, source: LOCALHOST_IMG }],
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(LOCALHOST_IMG);
    });

    it("accepts data:image/png URI", () => {
      const pngDataUri = "data:image/png;base64,iVBORw0KGgo=";
      const verification: Verification = {
        status: "found",
        document: { verificationImageSrc: pngDataUri, verifiedPageNumber: 1 },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(pngDataUri);
    });

    it("rejects untrusted HTTPS host — skips tier and falls through", () => {
      const verification: Verification = {
        status: "found",
        pages: [{ pageNumber: 1, isMatchPage: true, source: UNTRUSTED_HTTPS_IMG }],
        document: { verificationImageSrc: TRUSTED_IMG, verifiedPageNumber: 1 },
      };
      // tier 1 (untrusted host) is skipped; tier 3 (trusted) is used
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(TRUSTED_IMG);
    });

    it("rejects SVG data URI — skips tier and falls through", () => {
      const verification: Verification = {
        status: "found",
        pages: [{ pageNumber: 1, isMatchPage: true, source: SVG_DATA_URI }],
        document: { verificationImageSrc: TRUSTED_IMG, verifiedPageNumber: 1 },
      };
      // SVG data URI skipped; trusted verificationImageSrc used
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(TRUSTED_IMG);
    });

    it("rejects javascript: URI — returns null when no valid fallback", () => {
      const verification: Verification = {
        status: "found",
        proof: { proofImageUrl: JAVASCRIPT_URI },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("falls through from invalid proofImageUrl to valid verificationImageSrc", () => {
      const verification: Verification = {
        status: "found",
        proof: { proofImageUrl: UNTRUSTED_HTTPS_IMG },
        document: { verificationImageSrc: TRUSTED_IMG, verifiedPageNumber: 1 },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(TRUSTED_IMG);
    });

    it("returns valid matchPage source when all tiers present", () => {
      const verification: Verification = {
        status: "found",
        pages: [{ pageNumber: 1, isMatchPage: true, source: LOCALHOST_IMG }],
        proof: { proofImageUrl: UNTRUSTED_HTTPS_IMG },
        document: { verificationImageSrc: SVG_DATA_URI, verifiedPageNumber: 1 },
      };
      // localhost matchPage wins (valid tier 1)
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(LOCALHOST_IMG);
    });

    it("accepts proof.deepcitation.com as matchPage source (tier 1)", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            source: TRUSTED_PROOF_IMG,
            dimensions: { width: 800, height: 1200 },
          },
        ],
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(TRUSTED_PROOF_IMG);
    });

    it("accepts relative path as verificationImageSrc (tier 3)", () => {
      const verification: Verification = {
        status: "found",
        document: {
          verificationImageSrc: RELATIVE_PATH_IMG,
          verifiedPageNumber: 1,
        },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(RELATIVE_PATH_IMG);
    });

    it("rejects relative path with .. traversal", () => {
      const verification: Verification = {
        status: "found",
        document: {
          verificationImageSrc: TRAVERSAL_PATH,
          verifiedPageNumber: 1,
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects URL-encoded path traversal (%2e%2e)", () => {
      const verification: Verification = {
        status: "found",
        document: {
          verificationImageSrc: ENCODED_TRAVERSAL_PATH,
          verifiedPageNumber: 1,
        },
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects protocol-relative URL (//evil.com)", () => {
      const verification: Verification = {
        status: "found",
        pages: [{ pageNumber: 1, isMatchPage: true, source: PROTOCOL_RELATIVE_URL }],
      };
      expect(resolveExpandedImage(verification)).toBeNull();
    });
  });

  describe("URL citation screenshot (tier 3 — webPageScreenshotBase64)", () => {
    it("converts raw base64 string to data:image/jpeg;base64, URI", () => {
      const rawBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const verification: Verification = {
        status: "found",
        url: { webPageScreenshotBase64: rawBase64 },
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
        url: { webPageScreenshotBase64: dataUri },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(dataUri);
    });

    it("falls through to verificationImageSrc when URL screenshot is an SVG data URI", () => {
      const verification: Verification = {
        status: "found",
        url: { webPageScreenshotBase64: SVG_DATA_URI },
        document: { verificationImageSrc: TRUSTED_IMG, verifiedPageNumber: 1 },
      };
      // SVG data URI is rejected by isValidProofImageSrc; tier 4 (verificationImageSrc) is used
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(TRUSTED_IMG);
    });

    it("confirms cascade: matchPage > proofImageUrl > webPageScreenshotBase64 > verificationImageSrc", () => {
      const rawBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
      // tier 1 invalid, tier 2 invalid — should land on tier 3 (URL screenshot)
      const verification: Verification = {
        status: "found",
        pages: [{ pageNumber: 1, isMatchPage: true, source: UNTRUSTED_HTTPS_IMG }],
        proof: { proofImageUrl: UNTRUSTED_HTTPS_IMG },
        url: { webPageScreenshotBase64: rawBase64 },
        document: { verificationImageSrc: TRUSTED_IMG, verifiedPageNumber: 1 },
      };
      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(`data:image/jpeg;base64,${rawBase64}`);
    });
  });

  describe("optional fields", () => {
    it("defaults highlightBox to null when matchPage has none", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            source: TRUSTED_IMG,
            dimensions: { width: 800, height: 1200 },
            // no highlightBox
          },
        ],
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.highlightBox).toBeNull();
    });

    it("defaults textItems to empty array when matchPage has none", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            source: TRUSTED_IMG,
            // no textItems
          },
        ],
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
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            source: TRUSTED_IMG,
            textItems,
          },
        ],
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.textItems).toEqual(textItems);
    });

    it("defaults dimensions to null for verificationImageSrc without dimensions", () => {
      const verification: Verification = {
        status: "found",
        document: {
          verificationImageSrc: TRUSTED_IMG,
          verifiedPageNumber: 1,
          // no verificationImageDimensions
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.dimensions).toBeNull();
    });

    it("returns empty pages array gracefully", () => {
      const verification: Verification = {
        status: "found",
        pages: [],
        proof: { proofImageUrl: TRUSTED_CDN_IMG },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.src).toBe(TRUSTED_CDN_IMG);
    });
  });
});
