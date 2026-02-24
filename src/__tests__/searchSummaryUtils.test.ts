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
import { buildIntentSummary, buildSearchSummary, deriveContextWindow } from "../react/searchSummaryUtils";
import type { DeepTextItem } from "../types/boxes";
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

    it("infers anchor_text from keyspan_fallback method", () => {
      const attempts = [attempt({ searchPhrase: "span text", method: "keyspan_fallback" })];
      const group = buildSearchSummary(attempts).queryGroups[0];
      expect(group.phraseType).toBe("anchor_text");
      expect(group.phraseLabel).toBe("Anchor text");
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
      const attempts = [attempt({ searchPhrase: "A" }), attempt({ searchPhrase: "A", variationType: "currency" })];
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

// =============================================================================
// deriveContextWindow tests
// =============================================================================

function textItem(text: string): DeepTextItem {
  return { x: 0, y: 0, width: 100, height: 12, text };
}

describe("deriveContextWindow", () => {
  it("returns null when textItems is undefined", () => {
    expect(deriveContextWindow("hello", undefined)).toBeNull();
  });

  it("returns null when textItems is empty", () => {
    expect(deriveContextWindow("hello", [])).toBeNull();
  });

  it("returns null when matchedText is empty", () => {
    expect(deriveContextWindow("", [textItem("hello world")])).toBeNull();
  });

  it("returns null when match not found in text", () => {
    expect(deriveContextWindow("xyz", [textItem("hello world")])).toBeNull();
  });

  it("finds match and provides context from single text item", () => {
    const items = [textItem("The quick brown fox jumps over the lazy dog near the river")];
    const result = deriveContextWindow("fox jumps", items);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.contextText).toContain("fox jumps");
    const match = result.contextText.slice(result.matchStart, result.matchEnd);
    expect(match).toBe("fox jumps");
  });

  it("provides surrounding words as context", () => {
    const items = [textItem("word1 word2 word3 word4 word5 TARGET word6 word7 word8 word9 word10")];
    const result = deriveContextWindow("TARGET", items);
    expect(result).not.toBeNull();
    if (result == null) return;
    // Should include some words before and after
    expect(result.contextText.length).toBeGreaterThan("TARGET".length);
    expect(result.matchStart).toBeGreaterThan(0);
  });

  it("concatenates multiple text items with spaces", () => {
    const items = [textItem("hello"), textItem("world"), textItem("foo")];
    const result = deriveContextWindow("world", items);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.contextText).toContain("world");
  });

  it("performs case-insensitive match", () => {
    const items = [textItem("The Revenue increased by 15%")];
    const result = deriveContextWindow("revenue increased", items);
    expect(result).not.toBeNull();
    if (result == null) return;
    // matchedText indices should point to the original casing in contextText
    const match = result.contextText.slice(result.matchStart, result.matchEnd);
    expect(match.toLowerCase()).toBe("revenue increased");
  });

  it("handles match at the beginning of text", () => {
    const items = [textItem("Revenue increased by 15% in Q4")];
    const result = deriveContextWindow("Revenue", items);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.matchStart).toBe(0);
  });

  it("handles match at the end of text", () => {
    const items = [textItem("The total was Q4")];
    const result = deriveContextWindow("Q4", items);
    expect(result).not.toBeNull();
    if (result == null) return;
    const match = result.contextText.slice(result.matchStart, result.matchEnd);
    expect(match).toBe("Q4");
  });
});

// =============================================================================
// buildIntentSummary tests
// =============================================================================

describe("buildIntentSummary", () => {
  it("returns null when verification has no citation fullPhrase", () => {
    const result = buildIntentSummary({ status: "not_found" }, []);
    expect(result).toBeNull();
  });

  it("returns not_found outcome for not_found status", () => {
    const verification: Verification = {
      status: "not_found",
      citation: { type: "document", fullPhrase: "Revenue increased by 15%", pageNumber: 4 },
    };
    const result = buildIntentSummary(verification, [attempt({ searchPhrase: "Revenue increased by 15%" })]);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.outcome).toBe("not_found");
    expect(result.fullPhrase).toBe("Revenue increased by 15%");
    expect(result.snippets).toHaveLength(0);
  });

  it("returns exact_match for exact_full_phrase matchedVariation", () => {
    const verification: Verification = {
      status: "found",
      citation: { type: "document", fullPhrase: "Revenue increased by 15%", pageNumber: 4 },
    };
    const result = buildIntentSummary(verification, [
      attempt({
        searchPhrase: "Revenue increased by 15%",
        success: true,
        matchedVariation: "exact_full_phrase",
        matchedText: "Revenue increased by 15%",
      }),
    ]);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.outcome).toBe("exact_match");
    expect(result.snippets).toHaveLength(0);
  });

  it("returns exact_match for found status without displacement", () => {
    const verification: Verification = {
      status: "found",
      citation: { type: "document", fullPhrase: "Test phrase", pageNumber: 1 },
    };
    const result = buildIntentSummary(verification, [
      attempt({ searchPhrase: "Test phrase", success: true, matchedText: "Test phrase" }),
    ]);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.outcome).toBe("exact_match");
  });

  it("returns related_found for partial match statuses", () => {
    const verification: Verification = {
      status: "found_on_other_page",
      citation: { type: "document", fullPhrase: "Revenue increased by 15%", pageNumber: 4 },
    };
    const result = buildIntentSummary(verification, [
      attempt({
        searchPhrase: "Revenue increased by 15%",
        success: true,
        matchedText: "Revenue increased",
        method: "adjacent_pages",
        foundLocation: { page: 6 },
        expectedLocation: { page: 4 },
      }),
    ]);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.outcome).toBe("related_found");
    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].matchedText).toBe("Revenue increased");
    expect(result.snippets[0].isProximate).toBe(false); // adjacent_pages = distal
  });

  it("classifies proximate methods correctly", () => {
    const verification: Verification = {
      status: "found_on_other_line",
      citation: { type: "document", fullPhrase: "Test", pageNumber: 4 },
    };
    const result = buildIntentSummary(verification, [
      attempt({
        searchPhrase: "Test",
        success: true,
        matchedText: "Test",
        method: "current_page",
        pageSearched: 4,
      }),
    ]);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.snippets[0].isProximate).toBe(true);
  });

  it("classifies distal methods correctly", () => {
    const verification: Verification = {
      status: "partial_text_found",
      citation: { type: "document", fullPhrase: "Test", pageNumber: 4 },
    };
    const result = buildIntentSummary(verification, [
      attempt({
        searchPhrase: "Test",
        success: true,
        matchedText: "Test",
        method: "regex_search",
        foundLocation: { page: 8 },
        expectedLocation: { page: 4 },
      }),
    ]);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.snippets[0].isProximate).toBe(false);
  });

  it("falls back to verifiedMatchSnippet when no successful attempts", () => {
    const verification: Verification = {
      status: "found_anchor_text_only",
      citation: { type: "document", fullPhrase: "Test phrase here", pageNumber: 4 },
      verifiedMatchSnippet: "snippet from verification",
      document: { verifiedPageNumber: 4 },
    };
    const result = buildIntentSummary(verification, []);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.outcome).toBe("related_found");
    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].matchedText).toBe("snippet from verification");
    expect(result.snippets[0].page).toBe(4);
  });

  it("uses matchedText as context fallback when textItems unavailable", () => {
    const verification: Verification = {
      status: "partial_text_found",
      citation: { type: "document", fullPhrase: "Revenue increased by 15%", pageNumber: 4 },
    };
    const result = buildIntentSummary(verification, [
      attempt({
        searchPhrase: "Revenue increased by 15%",
        success: true,
        matchedText: "Revenue increased",
        method: "current_page",
      }),
    ]);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.snippets[0].contextText).toBe("Revenue increased");
    expect(result.snippets[0].matchStart).toBe(0);
    expect(result.snippets[0].matchEnd).toBe("Revenue increased".length);
  });

  it("tracks totalAttempts correctly", () => {
    const verification: Verification = {
      status: "not_found",
      citation: { type: "document", fullPhrase: "Test", pageNumber: 1 },
    };
    const attempts = [
      attempt({ searchPhrase: "Test" }),
      attempt({ searchPhrase: "Test" }),
      attempt({ searchPhrase: "Test" }),
    ];
    const result = buildIntentSummary(verification, attempts);
    expect(result).not.toBeNull();
    if (result == null) return;
    expect(result.totalAttempts).toBe(3);
  });
});
