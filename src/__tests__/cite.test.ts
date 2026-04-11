import { describe, expect, it } from "@jest/globals";
import { extractMarkersFromBody, findAnchorWithFallback, getAllLines, toCompactPageId } from "../cli/cite.js";
import type { LineMap } from "../cli/hydrate.js";

// ── toCompactPageId ──────────────────────────────────────────────

describe("toCompactPageId", () => {
  it("converts verbose page id to compact", () => {
    expect(toCompactPageId("page_number_3_index_2")).toBe("3_2");
  });

  it("returns input unchanged if not matching pattern", () => {
    expect(toCompactPageId("some_other_format")).toBe("some_other_format");
  });
});

// ── extractMarkersFromBody ───────────────────────────────────────

describe("extractMarkersFromBody", () => {
  it("extracts simple cite markers", () => {
    const body = "The [Discount Rate](cite:1) is applied.";
    const markers = extractMarkersFromBody(body);
    expect(markers).toEqual([{ id: 1, claimText: "Discount Rate" }]);
  });

  it("extracts multiple markers sorted by id", () => {
    const body = "The [Rate](cite:2) and [Price](cite:1) are related.";
    const markers = extractMarkersFromBody(body);
    expect(markers).toEqual([
      { id: 1, claimText: "Price" },
      { id: 2, claimText: "Rate" },
    ]);
  });

  it("deduplicates by id — first occurrence wins", () => {
    const body = "[Discount Rate](cite:1) again [DR](cite:1)";
    const markers = extractMarkersFromBody(body);
    expect(markers).toHaveLength(1);
    expect(markers[0].claimText).toBe("Discount Rate");
  });

  it("extracts double-quoted anchor hint", () => {
    const body = '[terminates](cite:3 "automatically terminate")';
    const markers = extractMarkersFromBody(body);
    expect(markers).toEqual([{ id: 3, claimText: "terminates", anchorHint: "automatically terminate" }]);
  });

  it("extracts single-quoted anchor hint", () => {
    const body = "[terminates](cite:3 'automatically terminate')";
    const markers = extractMarkersFromBody(body);
    expect(markers).toEqual([{ id: 3, claimText: "terminates", anchorHint: "automatically terminate" }]);
  });

  it("handles double-quoted anchor with escaped quotes", () => {
    const body = '[amount](cite:4 "the \\"Purchase Amount\\"")';
    const markers = extractMarkersFromBody(body);
    expect(markers).toHaveLength(1);
    expect(markers[0].anchorHint).toBe('the \\"Purchase Amount\\"');
  });

  it("handles single-quoted anchor with escaped quotes", () => {
    const body = "[amount](cite:4 'the \\'Purchase Amount\\'')";
    const markers = extractMarkersFromBody(body);
    expect(markers).toHaveLength(1);
    expect(markers[0].anchorHint).toBe("the \\'Purchase Amount\\'");
  });

  it("handles mixed formats in same body", () => {
    const body =
      "The [Discount Rate](cite:1) and [terminates](cite:2 'automatically terminate') and [converts](cite:3 \"auto convert\")";
    const markers = extractMarkersFromBody(body);
    expect(markers).toHaveLength(3);
    expect(markers[0]).toEqual({ id: 1, claimText: "Discount Rate" });
    expect(markers[1]).toEqual({ id: 2, claimText: "terminates", anchorHint: "automatically terminate" });
    expect(markers[2]).toEqual({ id: 3, claimText: "converts", anchorHint: "auto convert" });
  });

  it("returns empty array for body with no markers", () => {
    expect(extractMarkersFromBody("No citations here.")).toEqual([]);
  });

  it("ignores extra text in parens that is not a quoted anchor", () => {
    const body = "[declare War](cite:12 some extra stuff)";
    const markers = extractMarkersFromBody(body);
    expect(markers).toEqual([{ id: 12, claimText: "declare War" }]);
  });

  // Strategy 2c: **bold** [N] format
  it("extracts **bold** [N] markers as fallback", () => {
    const body = "The **Discount Rate** [1] is applied to the **conversion price** [2].";
    const markers = extractMarkersFromBody(body);
    expect(markers).toEqual([
      { id: 1, claimText: "Discount Rate" },
      { id: 2, claimText: "conversion price" },
    ]);
  });

  it("prefers [text](cite:N) over **bold** [N] when both present", () => {
    const body = "The [Discount Rate](cite:1) and **conversion price** [2].";
    const markers = extractMarkersFromBody(body);
    // cite:N format found, so **bold** [N] fallback is NOT used
    expect(markers).toEqual([{ id: 1, claimText: "Discount Rate" }]);
  });

  it("deduplicates **bold** [N] markers by id", () => {
    const body = "**Rate** [1] then **Rate** [1] again";
    const markers = extractMarkersFromBody(body);
    expect(markers).toHaveLength(1);
    expect(markers[0].claimText).toBe("Rate");
  });
});

// ── getAllLines ───────────────────────────────────────────────────

describe("getAllLines", () => {
  it("flattens a LineMap into sorted entries", () => {
    const lineMap: LineMap = {
      qualified: new Map([
        ["page_number_1_index_0:5", "Line five text"],
        ["page_number_1_index_0:2", "Line two text"],
      ]),
      byId: new Map([
        [5, "Line five text"],
        [2, "Line two text"],
      ]),
    };
    const lines = getAllLines(lineMap);
    expect(lines).toHaveLength(2);
    expect(lines[0].lineId).toBe(2);
    expect(lines[1].lineId).toBe(5);
    expect(lines[0].pageId).toBe("page_number_1_index_0");
  });
});

// ── findAnchorWithFallback ───────────────────────────────────────

describe("findAnchorWithFallback", () => {
  const makeLines = (texts: string[]) =>
    texts.map((text, i) => ({
      lineId: i + 1,
      pageId: `page_number_1_index_0`,
      text,
    }));

  it("returns null for empty lines", () => {
    expect(findAnchorWithFallback("anything", [])).toBeNull();
  });

  it("strategy 1: finds exact multi-word match", () => {
    const lines = makeLines(["The Discount Rate is applied here"]);
    const result = findAnchorWithFallback("Discount Rate", lines);
    expect(result).not.toBeNull();
    expect(result?.verbatimAnchor).toBe("Discount Rate");
    expect(result?.lineId).toBe(1);
  });

  it("strategy 1: sliding window finds middle terms", () => {
    const lines = makeLines(["it ranks on par with other SAFEs"]);
    const result = findAnchorWithFallback("it ranks on par with other SAFEs", lines);
    expect(result).not.toBeNull();
    // Should find the full phrase or a long substring
    expect(result?.verbatimAnchor.length).toBeGreaterThan(5);
  });

  it("strategy 2: word-bag scoring finds best matching line", () => {
    const lines = makeLines([
      "unrelated text about something",
      "the outstanding indebtedness and creditor claims must be paid",
      "another line with random words",
    ]);
    const result = findAnchorWithFallback("outstanding indebtedness creditor claims", lines);
    expect(result).not.toBeNull();
    expect(result?.lineId).toBe(2);
  });

  it("strategy 3: single distinctive word fallback", () => {
    const lines = makeLines(["The Dissolution Event triggers payment"]);
    const result = findAnchorWithFallback("Dissolution", lines);
    expect(result).not.toBeNull();
    expect(result?.verbatimAnchor).toBe("Dissolution");
  });

  it("returns null when no words match", () => {
    const lines = makeLines(["completely unrelated evidence text"]);
    expect(findAnchorWithFallback("xyz quantum", lines)).toBeNull();
  });

  it("strategy 3: skips generic stopwords to avoid wrong-context matches", () => {
    const lines = makeLines([
      "Investor hereunder for its own account for investment, not as a nominee",
      "This is a forward-looking instrument for future equity",
    ]);
    // "investment" alone would match line 1 (wrong context), but it's a stopword
    // Should fall through to "forward-looking" or "instrument" which are distinctive
    const result = findAnchorWithFallback("forward-looking investment instrument", lines);
    // Should NOT match "investment" in the nominee clause
    if (result) {
      expect(result.verbatimAnchor).not.toBe("investment");
    }
  });

  it("strategy 3: skips 'voting' as generic stopword", () => {
    const lines = makeLines([
      "more than 50% of the outstanding voting securities of the Company",
      "not entitled, as a holder of this Safe, to vote",
    ]);
    // "voting" is a stopword — should not match the wrong passage
    const result = findAnchorWithFallback("no voting rights", lines);
    // If it matches, it should NOT be a single-word "voting" match to line 1
    if (result) {
      expect(result.lineId).not.toBe(1);
    }
  });
});
