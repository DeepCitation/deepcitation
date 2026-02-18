/**
 * Tests for buildSearchSummary() — computes human-readable search summaries
 * for not-found citation states.
 *
 * Key behaviors:
 * - Collects unique pages from both pageSearched and foundLocation.page
 * - Formats page range as "page N" or "pages N-M"
 * - Detects full document scans via searchScope === "document"
 * - Surfaces closest match text from verification or failed attempts
 */

import { describe, expect, it } from "@jest/globals";
import { buildSearchSummary } from "../react/searchSummaryUtils";
import type { SearchAttempt } from "../types/search";
import type { Verification } from "../types/verification";

// Minimal valid SearchAttempt for tests
function attempt(overrides: Partial<SearchAttempt>): SearchAttempt {
  return {
    method: "exact_line_match",
    success: false,
    searchPhrase: "test phrase",
    ...overrides,
  };
}

describe("buildSearchSummary", () => {
  describe("empty / zero-attempt cases", () => {
    it("returns zero totals and empty pageRange for no attempts", () => {
      const summary = buildSearchSummary([]);
      expect(summary.totalAttempts).toBe(0);
      expect(summary.pageRange).toBe("");
      expect(summary.includesFullDocScan).toBe(false);
      expect(summary.closestMatch).toBeUndefined();
    });

    it("returns correct totalAttempts", () => {
      const attempts = [attempt({ pageSearched: 1 }), attempt({ pageSearched: 1 }), attempt({ pageSearched: 1 })];
      expect(buildSearchSummary(attempts).totalAttempts).toBe(3);
    });
  });

  describe("page range formatting", () => {
    it("formats single page as 'page N'", () => {
      const summary = buildSearchSummary([attempt({ pageSearched: 3 })]);
      expect(summary.pageRange).toBe("page 3");
    });

    it("formats multiple pages as 'pages N-M' (sorted)", () => {
      const attempts = [attempt({ pageSearched: 5 }), attempt({ pageSearched: 2 }), attempt({ pageSearched: 4 })];
      const summary = buildSearchSummary(attempts);
      expect(summary.pageRange).toBe("pages 2-5");
    });

    it("deduplicates repeated pageSearched values", () => {
      const attempts = [attempt({ pageSearched: 2 }), attempt({ pageSearched: 2 }), attempt({ pageSearched: 2 })];
      const summary = buildSearchSummary(attempts);
      expect(summary.pageRange).toBe("page 2");
    });

    it("returns empty pageRange when no pageSearched is set", () => {
      const summary = buildSearchSummary([attempt({ searchScope: "document" })]);
      expect(summary.pageRange).toBe("");
    });
  });

  describe("adjacent_pages: foundLocation.page dedup", () => {
    it("includes foundLocation.page in the page range", () => {
      // adjacent_pages finds text on page 3 when we searched page 2
      const attempts = [
        attempt({
          method: "adjacent_pages",
          success: true,
          pageSearched: 2,
          foundLocation: { page: 3 },
        }),
      ];
      const summary = buildSearchSummary(attempts);
      expect(summary.pageRange).toBe("pages 2-3");
    });

    it("deduplicates when foundLocation.page equals pageSearched", () => {
      const attempts = [
        attempt({
          method: "current_page",
          success: false,
          pageSearched: 2,
          foundLocation: { page: 2 },
        }),
      ];
      const summary = buildSearchSummary(attempts);
      expect(summary.pageRange).toBe("page 2");
    });

    it("collects foundLocation.page across multiple attempts", () => {
      const attempts = [
        attempt({ pageSearched: 2, foundLocation: { page: 4 } }),
        attempt({ pageSearched: 3, foundLocation: { page: 5 } }),
      ];
      const summary = buildSearchSummary(attempts);
      expect(summary.pageRange).toBe("pages 2-5");
    });

    it("ignores null foundLocation", () => {
      const attempts = [attempt({ pageSearched: 2 })];
      // No foundLocation — should just be page 2
      const summary = buildSearchSummary(attempts);
      expect(summary.pageRange).toBe("page 2");
    });
  });

  describe("full document scan detection", () => {
    it("sets includesFullDocScan when any attempt has searchScope 'document'", () => {
      const attempts = [attempt({ pageSearched: 2 }), attempt({ searchScope: "document" })];
      expect(buildSearchSummary(attempts).includesFullDocScan).toBe(true);
    });

    it("does not set includesFullDocScan for page-scoped searches", () => {
      const attempts = [
        attempt({ pageSearched: 1, searchScope: "page" }),
        attempt({ pageSearched: 2, searchScope: "line" }),
      ];
      expect(buildSearchSummary(attempts).includesFullDocScan).toBe(false);
    });
  });

  describe("closestMatch", () => {
    it("uses verifiedMatchSnippet from verification when present", () => {
      const verification: Verification = {
        status: "not_found",
        verifiedMatchSnippet: "the quick brown fox",
        document: { verifiedPageNumber: 5 },
      };
      const summary = buildSearchSummary([], verification);
      expect(summary.closestMatch?.text).toBe("the quick brown fox");
      expect(summary.closestMatch?.page).toBe(5);
    });

    it("falls back to matchedText on a failed attempt", () => {
      const attempts = [attempt({ success: false, matchedText: "close but not quite" })];
      const summary = buildSearchSummary(attempts);
      expect(summary.closestMatch?.text).toBe("close but not quite");
    });

    it("takes the first failed matchedText when multiple exist", () => {
      const attempts = [
        attempt({ success: false, matchedText: "first match", pageSearched: 1 }),
        attempt({ success: false, matchedText: "second match", pageSearched: 2 }),
      ];
      const summary = buildSearchSummary(attempts);
      expect(summary.closestMatch?.text).toBe("first match");
      expect(summary.closestMatch?.page).toBe(1);
    });

    it("prefers verifiedMatchSnippet over attempt matchedText", () => {
      const verification: Verification = {
        status: "not_found",
        verifiedMatchSnippet: "from verification",
      };
      const attempts = [attempt({ success: false, matchedText: "from attempt" })];
      const summary = buildSearchSummary(attempts, verification);
      expect(summary.closestMatch?.text).toBe("from verification");
    });

    it("returns undefined closestMatch when nothing is available", () => {
      const summary = buildSearchSummary([attempt({ success: false })]);
      expect(summary.closestMatch).toBeUndefined();
    });
  });
});
