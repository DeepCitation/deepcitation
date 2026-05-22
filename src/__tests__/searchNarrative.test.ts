import { describe, expect, it } from "bun:test";
import { buildSearchNarrative } from "../analysis/narrative";
import type { SearchAttempt } from "../types/search";

describe("buildSearchNarrative", () => {
  describe("outcome derivation", () => {
    it("returns exact_match for 'found' status", () => {
      const attempts: SearchAttempt[] = [
        { method: "exact_line_match", success: true, searchPhrase: "hello world", pageSearched: 1 },
      ];
      const narrative = buildSearchNarrative(attempts, "found");
      expect(narrative.outcome).toBe("exact_match");
      expect(narrative.colorScheme).toBe("green");
    });

    it("returns partial_match for 'found_on_other_page'", () => {
      const attempts: SearchAttempt[] = [
        { method: "adjacent_pages", success: true, searchPhrase: "hello", pageSearched: 3 },
      ];
      const narrative = buildSearchNarrative(attempts, "found_on_other_page");
      expect(narrative.outcome).toBe("partial_match");
      expect(narrative.colorScheme).toBe("amber");
    });

    it("returns partial_match for 'found_context_missed_source_match'", () => {
      const attempts: SearchAttempt[] = [
        { method: "source_match_fallback", success: true, searchPhrase: "F43.10", pageSearched: 1 },
      ];
      const narrative = buildSearchNarrative(attempts, "found_context_missed_source_match");
      expect(narrative.outcome).toBe("partial_match");
      expect(narrative.colorScheme).toBe("amber");
      expect(narrative.outcomeSummary).toBe("Partial match");
    });

    it("returns not_found for 'not_found' status", () => {
      const attempts: SearchAttempt[] = [
        { method: "exact_line_match", success: false, searchPhrase: "missing text", pageSearched: 1 },
      ];
      const narrative = buildSearchNarrative(attempts, "not_found");
      expect(narrative.outcome).toBe("not_found");
      expect(narrative.colorScheme).toBe("red");
    });

    it("returns pending for null status", () => {
      const narrative = buildSearchNarrative([], null);
      expect(narrative.outcome).toBe("pending");
      expect(narrative.colorScheme).toBe("gray");
    });

    it("returns pending for 'loading' status", () => {
      const narrative = buildSearchNarrative([], "loading");
      expect(narrative.outcome).toBe("pending");
      expect(narrative.colorScheme).toBe("gray");
    });
  });

  describe("showAllRows", () => {
    it("is false for 'found' status (show only hit)", () => {
      const attempts: SearchAttempt[] = [
        { method: "exact_line_match", success: true, searchPhrase: "hello", pageSearched: 1 },
      ];
      const narrative = buildSearchNarrative(attempts, "found");
      expect(narrative.showAllRows).toBe(false);
      expect(narrative.rows.length).toBe(1);
      expect(narrative.rows[0].kind).toBe("success");
    });

    it("is true for 'not_found' status", () => {
      const attempts: SearchAttempt[] = [
        { method: "exact_line_match", success: false, searchPhrase: "missing", pageSearched: 1 },
        { method: "current_page", success: false, searchPhrase: "missing", pageSearched: 1 },
      ];
      const narrative = buildSearchNarrative(attempts, "not_found");
      expect(narrative.showAllRows).toBe(true);
    });

    it("is true for 'found_context_missed_source_match' so the partial search trail remains visible", () => {
      const attempts: SearchAttempt[] = [
        { method: "exact_line_match", success: false, searchPhrase: "diagnosis", pageSearched: 1 },
        {
          method: "source_match_fallback",
          success: true,
          searchPhrase: "F43.10",
          pageSearched: 1,
          foundLocation: { page: 1 },
        },
      ];
      const narrative = buildSearchNarrative(attempts, "found_context_missed_source_match");
      expect(narrative.showAllRows).toBe(true);
      expect(narrative.groupedAttemptCount).toBe(2);
      expect(narrative.rows.map(row => row.kind)).toEqual(["failure", "success"]);
    });

    it("is true for null status", () => {
      const narrative = buildSearchNarrative([], null);
      expect(narrative.showAllRows).toBe(true);
    });
  });

  describe("row construction", () => {
    it("orders failures before successes in show-all mode", () => {
      const attempts: SearchAttempt[] = [
        { method: "exact_line_match", success: true, searchPhrase: "hit", pageSearched: 1 },
        { method: "current_page", success: false, searchPhrase: "miss", pageSearched: 2 },
      ];
      const narrative = buildSearchNarrative(attempts, "found_on_other_page");
      const kinds = narrative.rows.map(r => r.kind);
      // Failures come first
      expect(kinds.indexOf("failure")).toBeLessThan(kinds.indexOf("success"));
    });

    it("marks unexpected hit when found on different page", () => {
      const attempts: SearchAttempt[] = [
        {
          method: "adjacent_pages",
          success: true,
          searchPhrase: "text",
          foundLocation: { page: 7 },
          pageSearched: 5,
        },
      ];
      const narrative = buildSearchNarrative(attempts, "found_on_other_page", 5);
      const successRow = narrative.rows.find(r => r.kind === "success");
      expect(successRow).toBeDefined();
      if (successRow?.kind === "success") {
        expect(successRow.isUnexpectedHit).toBe(true);
      }
    });

    it("builds collapsed_failure rows for not_found with page ranges", () => {
      const attempts: SearchAttempt[] = [
        { method: "exact_line_match", success: false, searchPhrase: "text", pageSearched: 1 },
        { method: "exact_line_match", success: false, searchPhrase: "text", pageSearched: 2 },
        { method: "exact_line_match", success: false, searchPhrase: "text", pageSearched: 3 },
      ];
      const narrative = buildSearchNarrative(attempts, "not_found");
      // Not-found grouping collapses by method category + phrase, so these should be one group
      expect(narrative.rows.length).toBe(1);
      expect(narrative.rows[0].kind).toBe("collapsed_failure");
    });
  });

  describe("outcomeSummary", () => {
    it("returns 'Exact match' for found with exact_source_context variation", () => {
      const attempts: SearchAttempt[] = [
        {
          method: "exact_line_match",
          success: true,
          searchPhrase: "hello",
          matchedVariation: "exact_source_context",
          pageSearched: 1,
        },
      ];
      const narrative = buildSearchNarrative(attempts, "found");
      expect(narrative.outcomeSummary).toBe("Exact match");
    });

    it("returns attempt count for not_found", () => {
      const attempts: SearchAttempt[] = [
        { method: "exact_line_match", success: false, searchPhrase: "missing", pageSearched: 1 },
      ];
      const narrative = buildSearchNarrative(attempts, "not_found");
      expect(narrative.outcomeSummary).toContain("1");
    });
  });

  describe("totalAttempts", () => {
    it("reflects the actual search attempt count", () => {
      const attempts: SearchAttempt[] = [
        { method: "exact_line_match", success: false, searchPhrase: "a", pageSearched: 1 },
        { method: "current_page", success: false, searchPhrase: "a", pageSearched: 1 },
        { method: "adjacent_pages", success: false, searchPhrase: "a", pageSearched: 2 },
      ];
      const narrative = buildSearchNarrative(attempts, "not_found");
      expect(narrative.totalAttempts).toBe(3);
    });
  });
});
