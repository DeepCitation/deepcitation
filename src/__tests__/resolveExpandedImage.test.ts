/**
 * Tests for resolveExpandedImage() — fallback resolver
 * for the expanded page viewer's image source.
 */

import { describe, expect, it } from "bun:test";
import { resolveExpandedImage } from "../react/EvidenceTray";
import type { Verification } from "../types/verification";

// Representative image URLs for tests
const TRUSTED_IMG = "https://api.deepcitation.com/proof/img.png";
const TRUSTED_CDN_IMG = "https://cdn.deepcitation.com/proof/page1.avif";

// Same-origin relative paths — allowed (served from current host)
const RELATIVE_PATH_IMG = "/demo/legal/page-1.avif";

// Localhost — allowed (dev environment)
const LOCALHOST_IMG = "http://localhost:3000/proof/img.png";
// Untrusted external host — rejected even over HTTPS
const UNTRUSTED_HTTPS_IMG = "https://evil.example.com/proof/img.png";
// Dangerous data URI types — rejected
const SVG_DATA_URI = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=";
const JAVASCRIPT_URI = "javascript:alert(1)";

const basePage = {
  pageNumber: 1,
  imageUrl: TRUSTED_CDN_IMG,
  dimensions: { width: 800, height: 1200 },
};

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
      expect(resolveExpandedImage(verification, [])).toBeNull();
    });
  });

  describe("cascade priority", () => {
    it("prefers the verified page image when present", () => {
      const verification: Verification = {
        status: "found",
        document: {
          verifiedPageNumber: 1,
          highlightBox: { x: 10, y: 20, width: 100, height: 50 },
        },
      };

      const result = resolveExpandedImage(verification, [basePage]);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result to be non-null");
      expect(result.src).toBe(TRUSTED_CDN_IMG);
      expect(result.dimensions).toEqual({ width: 800, height: 1200 });
      expect(result.highlightBox).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it("falls back to the first page image when no match page exists", () => {
      const verification: Verification = {
        status: "found",
        document: { verifiedPageNumber: 99 },
      };

      const result = resolveExpandedImage(verification, [basePage]);
      expect(result).not.toBeNull();
      if (!result) throw new Error("Expected result");
      expect(result.src).toBe(TRUSTED_CDN_IMG);
      expect(result.dimensions).toEqual({ width: 800, height: 1200 });
    });

    it("returns null when no valid page images are available", () => {
      const verification: Verification = {
        status: "found",
      };

      const result = resolveExpandedImage(verification, [{ ...basePage, imageUrl: UNTRUSTED_HTTPS_IMG }]);
      expect(result).toBeNull();
    });
  });

  describe("isMatchPage vs pageNumber search priority", () => {
    it("prefers isMatchPage:true over pageNumber match when both exist", () => {
      const matchPage = {
        pageNumber: 3,
        imageUrl: TRUSTED_IMG,
        dimensions: { width: 400, height: 600 },
        isMatchPage: true as const,
      };
      const pageByNumber = { pageNumber: 1, imageUrl: TRUSTED_CDN_IMG, dimensions: { width: 800, height: 1200 } };
      const verification: Verification = {
        status: "found",
        document: { verifiedPageNumber: 1 },
      };

      const result = resolveExpandedImage(verification, [pageByNumber, matchPage]);
      expect(result?.src).toBe(TRUSTED_IMG); // isMatchPage wins over pageNumber match
    });

    it("falls back to pageNumber match when no isMatchPage page exists", () => {
      const page1 = { pageNumber: 1, imageUrl: TRUSTED_CDN_IMG, dimensions: { width: 800, height: 1200 } };
      const page2 = { pageNumber: 2, imageUrl: TRUSTED_IMG, dimensions: { width: 400, height: 600 } };
      const verification: Verification = {
        status: "found",
        document: { verifiedPageNumber: 2 },
      };

      const result = resolveExpandedImage(verification, [page1, page2]);
      expect(result?.src).toBe(TRUSTED_IMG); // pageNumber 2 matched
    });
  });

  describe("override merge priority (document vs pageImage metadata)", () => {
    const pageWithMetadata = {
      pageNumber: 1,
      imageUrl: TRUSTED_CDN_IMG,
      dimensions: { width: 800, height: 1200 },
      highlightBox: { x: 1, y: 1, width: 10, height: 10 },
      renderScale: { x: 0.5, y: 0.5 },
      textItems: [{ text: "from-page", pageIndex: 0, lineIndex: 0, box: { x: 0, y: 0, width: 10, height: 10 } }],
      isMatchPage: true as const,
    };

    it("verification.document.highlightBox overrides pageImage.highlightBox", () => {
      const docHighlight = { x: 50, y: 60, width: 200, height: 80 };
      const verification: Verification = {
        status: "found",
        document: { verifiedPageNumber: 1, highlightBox: docHighlight },
      };

      const result = resolveExpandedImage(verification, [pageWithMetadata]);
      expect(result?.highlightBox).toEqual(docHighlight);
    });

    it("verification.document.renderScale overrides pageImage.renderScale", () => {
      const docScale = { x: 2.0, y: 2.0 };
      const verification: Verification = {
        status: "found",
        document: { verifiedPageNumber: 1, renderScale: docScale },
      };

      const result = resolveExpandedImage(verification, [pageWithMetadata]);
      expect(result?.renderScale).toEqual(docScale);
    });

    it("falls back to pageImage.highlightBox when document has no highlightBox", () => {
      const verification: Verification = {
        status: "found",
        document: { verifiedPageNumber: 1 },
      };

      const result = resolveExpandedImage(verification, [pageWithMetadata]);
      expect(result?.highlightBox).toEqual(pageWithMetadata.highlightBox);
    });

    it("falls back to pageImage.renderScale when document has no renderScale", () => {
      const verification: Verification = {
        status: "found",
        document: { verifiedPageNumber: 1 },
      };

      const result = resolveExpandedImage(verification, [pageWithMetadata]);
      expect(result?.renderScale).toEqual(pageWithMetadata.renderScale);
    });

    it("fallback page (non-match) does NOT apply document overrides", () => {
      // When falling back to anyPage (not a match), toExpandedImageSource is called without overrides.
      // page has no highlightBox itself, so the result is null — not the document's highlightBox.
      // Using a page without highlightBox makes this explicit: if overrides were (wrongly) applied,
      // result.highlightBox would be { x: 50, y: 60, width: 200, height: 80 } instead of null.
      const page = { pageNumber: 99, imageUrl: TRUSTED_CDN_IMG, dimensions: { width: 800, height: 1200 } };
      const verification: Verification = {
        status: "found",
        document: { verifiedPageNumber: 1, highlightBox: { x: 50, y: 60, width: 200, height: 80 } },
      };

      const result = resolveExpandedImage(verification, [page]); // no match for page 1, falls to anyPage
      expect(result?.src).toBe(TRUSTED_CDN_IMG);
      expect(result?.highlightBox).toBeNull(); // document.highlightBox NOT applied on anyPage fallback
    });
  });

  describe("security validation", () => {
    it("rejects untrusted hosts", () => {
      const verification: Verification = { status: "found" };
      const result = resolveExpandedImage(verification, [{ ...basePage, imageUrl: UNTRUSTED_HTTPS_IMG }]);
      expect(result).toBeNull();
    });

    it("accepts localhost and relative paths", () => {
      const verification: Verification = { status: "found" };
      const resultRelative = resolveExpandedImage(verification, [{ ...basePage, imageUrl: RELATIVE_PATH_IMG }]);
      expect(resultRelative?.src).toBe(RELATIVE_PATH_IMG);

      const resultLocalhost = resolveExpandedImage(verification, [{ ...basePage, imageUrl: LOCALHOST_IMG }]);
      expect(resultLocalhost?.src).toBe(LOCALHOST_IMG);
    });

    it("rejects dangerous URIs in page images", () => {
      const verification: Verification = { status: "found" };
      expect(resolveExpandedImage(verification, [{ ...basePage, imageUrl: SVG_DATA_URI }])).toBeNull();
      expect(resolveExpandedImage(verification, [{ ...basePage, imageUrl: JAVASCRIPT_URI }])).toBeNull();
    });
  });
});
