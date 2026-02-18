/**
 * Tests for resolveExpandedImage() — the three-tier fallback resolver
 * for the expanded page viewer's image source.
 *
 * Security model: each source is validated with isValidProofImageSrc() before use.
 * Trusted: HTTPS from api.deepcitation.com / cdn.deepcitation.com, localhost (dev), safe raster data URIs.
 * Rejected: SVG data URIs, javascript: URIs, arbitrary HTTPS hosts.
 * Invalid sources are skipped and the next tier is tried.
 * Correctness: validates cascade priority (matchPage → proofImageUrl → verificationImageSrc).
 */

import { describe, expect, it } from "@jest/globals";
import { resolveExpandedImage } from "../react/CitationComponent";
import type { Verification } from "../types/verification";

// Representative image URLs for tests
const TRUSTED_IMG = "https://api.deepcitation.com/proof/img.png";
const TRUSTED_CDN_IMG = "https://cdn.deepcitation.com/proof/page1.avif";

// Localhost — allowed (dev environment)
const LOCALHOST_IMG = "http://localhost:3000/proof/img.png";
// Untrusted external host — rejected even over HTTPS
const UNTRUSTED_HTTPS_IMG = "https://evil.example.com/proof/img.png";
// Dangerous data URI types — rejected
const SVG_DATA_URI = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=";
const JAVASCRIPT_URI = "javascript:alert(1)";

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
