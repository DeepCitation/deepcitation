/**
 * Tests for resolveExpandedImage() — the three-tier fallback resolver
 * for the expanded page viewer's image source.
 *
 * Security: validates that all sources pass isValidProofImageSrc() before use.
 * Correctness: validates cascade priority (matchPage → proofImageUrl → verificationImageSrc).
 */

import { describe, expect, it } from "@jest/globals";
import { resolveExpandedImage } from "../react/CitationComponent";
import type { Verification } from "../types/verification";

// Trusted image host for tests (matches TRUSTED_IMAGE_HOSTS in constants.ts)
const TRUSTED_IMG = "https://api.deepcitation.com/proof/img.png";
const TRUSTED_CDN_IMG = "https://cdn.deepcitation.com/proof/page1.avif";

// Untrusted sources that should be rejected
const UNTRUSTED_HTTP = "http://evil.com/image.png";
const UNTRUSTED_HTTPS = "https://evil.com/image.png";
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
      if (!result) throw new Error("Expected result");
      expect(result.dimensions).toBeNull();
      if (!result) throw new Error("Expected result");
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

  describe("security: image source validation", () => {
    it("rejects untrusted HTTP matchPage source", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            source: UNTRUSTED_HTTP,
          },
        ],
      };

      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects untrusted HTTPS matchPage source", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            source: UNTRUSTED_HTTPS,
          },
        ],
      };

      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects SVG data URI in matchPage source (XSS vector)", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            source: SVG_DATA_URI,
          },
        ],
      };

      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects javascript: URI in proofImageUrl", () => {
      const verification: Verification = {
        status: "found",
        proof: { proofImageUrl: JAVASCRIPT_URI },
      };

      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("rejects untrusted proofImageUrl and falls through to verificationImageSrc", () => {
      const verification: Verification = {
        status: "found",
        proof: { proofImageUrl: UNTRUSTED_HTTPS },
        document: {
          verificationImageSrc: TRUSTED_IMG,
          verifiedPageNumber: 1,
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.src).toBe(TRUSTED_IMG);
    });

    it("rejects all untrusted sources and returns null", () => {
      const verification: Verification = {
        status: "found",
        pages: [
          {
            pageNumber: 1,
            isMatchPage: true,
            source: UNTRUSTED_HTTPS,
          },
        ],
        proof: { proofImageUrl: UNTRUSTED_HTTP },
        document: {
          verificationImageSrc: SVG_DATA_URI,
          verifiedPageNumber: 1,
        },
      };

      expect(resolveExpandedImage(verification)).toBeNull();
    });

    it("accepts trusted data URI (e.g., data:image/png)", () => {
      const pngDataUri = "data:image/png;base64,iVBORw0KGgo=";
      const verification: Verification = {
        status: "found",
        document: {
          verificationImageSrc: pngDataUri,
          verifiedPageNumber: 1,
        },
      };

      const result = resolveExpandedImage(verification);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.src).toBe(pngDataUri);
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
