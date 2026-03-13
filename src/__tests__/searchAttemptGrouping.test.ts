import { describe, expect, it } from "@jest/globals";
import { groupSearchAttempts } from "../react/searchAttemptGrouping";
import type { SearchAttempt } from "../types/search";

function attempt(overrides: Partial<SearchAttempt>): SearchAttempt {
  return {
    method: "exact_line_match",
    success: false,
    searchPhrase: "",
    ...overrides,
  };
}

describe("searchAttemptGrouping", () => {
  it("deduplicates method retries that differ only by punctuation/formatting", () => {
    const attempts: SearchAttempt[] = [
      attempt({ searchPhrase: "100,000 users before Demo Day.", pageSearched: 1, method: "exact_line_match" }),
      attempt({ searchPhrase: "100000 users before demo day", pageSearched: 1, method: "current_page" }),
      attempt({ searchPhrase: "100,000   users before  Demo Day", pageSearched: 1, method: "adjacent_pages" }),
    ];

    const grouped = groupSearchAttempts(attempts);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.duplicateCount).toBe(3);
  });

  it("keeps the same phrase separate across different pages", () => {
    const attempts: SearchAttempt[] = [
      attempt({ searchPhrase: "Revenue increased by 15%", pageSearched: 3 }),
      attempt({ searchPhrase: "Revenue increased by 15%", pageSearched: 4 }),
    ];

    const grouped = groupSearchAttempts(attempts);
    expect(grouped).toHaveLength(2);
  });

  it("keeps different phrases that normalize to empty separate", () => {
    const attempts: SearchAttempt[] = [
      attempt({ searchPhrase: "!!!", pageSearched: 1 }),
      attempt({ searchPhrase: "???", pageSearched: 1 }),
    ];

    const grouped = groupSearchAttempts(attempts);
    expect(grouped).toHaveLength(2);
  });

  it("groups identical phrases that normalize to empty", () => {
    const attempts: SearchAttempt[] = [
      attempt({ searchPhrase: "!!!", pageSearched: 1 }),
      attempt({ searchPhrase: "!!!", pageSearched: 1 }),
    ];

    const grouped = groupSearchAttempts(attempts);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.duplicateCount).toBe(2);
  });

  it("prefers a successful duplicate as the representative row", () => {
    const attempts: SearchAttempt[] = [
      attempt({ searchPhrase: "alpha", pageSearched: 2, success: false }),
      attempt({ searchPhrase: "alpha", pageSearched: 2, success: true, method: "anchor_text_fallback" }),
    ];

    const grouped = groupSearchAttempts(attempts);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.duplicateCount).toBe(2);
    expect(grouped[0]?.attempt.success).toBe(true);
    expect(grouped[0]?.attempt.method).toBe("anchor_text_fallback");
  });
});
