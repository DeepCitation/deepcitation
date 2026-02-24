/**
 * Tests for buildSearchSummary() — computes human-readable search summaries
 * for not-found citation states.
 *
 * Key behaviors:
 * - Collects unique pages from both pageSearched and foundLocation.page
 * - Formats page range as "page N" or "pages N-M"
 * - Detects full document scans via searchScope === "document"
 * - Surfaces closest match text from verification or failed attempts
 * - Groups attempts by distinct searchPhrase (query-centric)
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
      expect(summary.queryGroups).toEqual([]);
      expect(summary.distinctQueries).toBe(0);
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

  // =========================================================================
  // Query grouping tests
  // =========================================================================

  describe("queryGroups — grouping by searchPhrase", () => {
    it("groups same phrase across multiple attempts into 1 group", () => {
      const attempts = [
        attempt({ searchPhrase: "Revenue increased by 15%", method: "exact_line_match", pageSearched: 4 }),
        attempt({ searchPhrase: "Revenue increased by 15%", method: "current_page", pageSearched: 4 }),
        attempt({ searchPhrase: "Revenue increased by 15%", method: "adjacent_pages", pageSearched: 5 }),
      ];
      const summary = buildSearchSummary(attempts);
      expect(summary.queryGroups).toHaveLength(1);
      expect(summary.distinctQueries).toBe(1);
      expect(summary.queryGroups[0].attemptCount).toBe(3);
      expect(summary.queryGroups[0].searchPhrase).toBe("Revenue increased by 15%");
    });

    it("creates separate groups for different phrases", () => {
      const attempts = [
        attempt({ searchPhrase: "Revenue increased by 15% in Q4 2024.", pageSearched: 4 }),
        attempt({ searchPhrase: "increased by 15%", method: "anchor_text_fallback", searchPhraseType: "anchor_text" }),
      ];
      const summary = buildSearchSummary(attempts);
      expect(summary.queryGroups).toHaveLength(2);
      expect(summary.distinctQueries).toBe(2);
      expect(summary.queryGroups[0].searchPhrase).toBe("Revenue increased by 15% in Q4 2024.");
      expect(summary.queryGroups[1].searchPhrase).toBe("increased by 15%");
    });

    it("preserves first-occurrence order", () => {
      const attempts = [
        attempt({ searchPhrase: "alpha" }),
        attempt({ searchPhrase: "beta" }),
        attempt({ searchPhrase: "alpha" }),
        attempt({ searchPhrase: "gamma" }),
      ];
      const summary = buildSearchSummary(attempts);
      expect(summary.queryGroups.map(g => g.searchPhrase)).toEqual(["alpha", "beta", "gamma"]);
    });
  });

  describe("queryGroups — phraseType and phraseLabel", () => {
    it("derives full_phrase from searchPhraseType field", () => {
      const attempts = [attempt({ searchPhrase: "test", searchPhraseType: "full_phrase" })];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.phraseType).toBe("full_phrase");
      expect(group.phraseLabel).toBe("Full phrase");
    });

    it("derives anchor_text from searchPhraseType field", () => {
      const attempts = [attempt({ searchPhrase: "test", searchPhraseType: "anchor_text" })];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.phraseType).toBe("anchor_text");
      expect(group.phraseLabel).toBe("Anchor text");
    });

    it("infers fragment type from method name", () => {
      const attempts = [attempt({ searchPhrase: "Revenue", method: "first_half_fallback" })];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.phraseType).toBe("fragment");
      expect(group.phraseLabel).toBe("First half");
    });

    it("infers anchor_text from anchor_text_fallback method", () => {
      const attempts = [attempt({ searchPhrase: "15%", method: "anchor_text_fallback" })];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.phraseType).toBe("anchor_text");
      expect(group.phraseLabel).toBe("Anchor text");
    });

    it("defaults to full_phrase when no hint is available", () => {
      const attempts = [attempt({ searchPhrase: "test" })];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.phraseType).toBe("full_phrase");
      expect(group.phraseLabel).toBe("Full phrase");
    });
  });

  describe("queryGroups — methods and locations", () => {
    it("deduplicates methods within a group", () => {
      const attempts = [
        attempt({ searchPhrase: "A", method: "current_page", pageSearched: 3 }),
        attempt({ searchPhrase: "A", method: "current_page", pageSearched: 4 }),
        attempt({ searchPhrase: "A", method: "adjacent_pages", pageSearched: 5 }),
      ];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.methodsTried).toEqual(["current_page", "adjacent_pages"]);
    });

    it("collects and sorts pages per group", () => {
      const attempts = [
        attempt({ searchPhrase: "A", pageSearched: 5 }),
        attempt({ searchPhrase: "A", pageSearched: 2 }),
        attempt({ searchPhrase: "A", pageSearched: 7 }),
      ];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.locations.pages).toEqual([2, 5, 7]);
    });

    it("detects doc scan within a group", () => {
      const attempts = [
        attempt({ searchPhrase: "A", pageSearched: 2 }),
        attempt({ searchPhrase: "A", searchScope: "document" }),
      ];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.locations.includesDocScan).toBe(true);
    });
  });

  describe("queryGroups — variations", () => {
    it("merges variations across attempts in same group (deduplicated)", () => {
      const attempts = [
        attempt({ searchPhrase: "A", searchVariations: ["$4.89", "4.89"] }),
        attempt({ searchPhrase: "A", searchVariations: ["4.89", "$4.89 USD"] }),
      ];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.variations).toEqual(["$4.89", "4.89", "$4.89 USD"]);
    });

    it("captures variationTypeLabel from first attempt that has it", () => {
      const attempts = [
        attempt({ searchPhrase: "A" }),
        attempt({ searchPhrase: "A", variationType: "currency" }),
      ];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.variationTypeLabel).toBe("Price formats");
    });
  });

  describe("queryGroups — rejected matches", () => {
    it("collects rejected matches per group (deduplicated)", () => {
      const attempts = [
        attempt({ searchPhrase: "A", matchedText: "close match", occurrencesFound: 3 }),
        attempt({ searchPhrase: "A", matchedText: "close match" }), // duplicate
        attempt({ searchPhrase: "A", matchedText: "another match" }),
      ];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.rejectedMatches).toHaveLength(2);
      expect(group.rejectedMatches[0]).toEqual({ text: "close match", occurrences: 3 });
      expect(group.rejectedMatches[1]).toEqual({ text: "another match", occurrences: undefined });
    });

    it("does not collect successful attempts as rejected", () => {
      const attempts = [attempt({ searchPhrase: "A", success: true, matchedText: "exact match" })];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.rejectedMatches).toHaveLength(0);
    });
  });

  describe("queryGroups — edge cases", () => {
    it("handles empty searchPhrase", () => {
      const attempts = [attempt({ searchPhrase: "" })];
      const summary = buildSearchSummary(attempts);
      expect(summary.queryGroups).toHaveLength(1);
      expect(summary.queryGroups[0].searchPhrase).toBe("");
    });

    it("handles single attempt", () => {
      const attempts = [attempt({ searchPhrase: "only one", pageSearched: 1 })];
      const summary = buildSearchSummary(attempts);
      expect(summary.queryGroups).toHaveLength(1);
      expect(summary.distinctQueries).toBe(1);
      expect(summary.queryGroups[0].attemptCount).toBe(1);
    });

    it("handles all-same-phrase attempts", () => {
      const attempts = Array.from({ length: 5 }, () => attempt({ searchPhrase: "same" }));
      const summary = buildSearchSummary(attempts);
      expect(summary.queryGroups).toHaveLength(1);
      expect(summary.queryGroups[0].attemptCount).toBe(5);
    });

    it("handles all-different-phrase attempts", () => {
      const attempts = [
        attempt({ searchPhrase: "alpha" }),
        attempt({ searchPhrase: "beta" }),
        attempt({ searchPhrase: "gamma" }),
      ];
      const summary = buildSearchSummary(attempts);
      expect(summary.queryGroups).toHaveLength(3);
      expect(summary.distinctQueries).toBe(3);
      summary.queryGroups.forEach(g => expect(g.attemptCount).toBe(1));
    });
  });
});
