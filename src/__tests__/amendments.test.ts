import { describe, expect, it } from "bun:test";
import type { Citation } from "../types/citation";
import { computeAmendments } from "../utils/amendments";

const baseCitation: Citation = {
  type: "document",
  sourceContext: "The total revenue was $1.2M",
  sourceMatch: "total revenue",
  pageNumber: 3,
  lineIds: [10, 11],
  reasoning: "Annual report figure",
  citationNumber: 1,
};

describe("computeAmendments", () => {
  it("returns empty array when citations are identical", () => {
    expect(computeAmendments(baseCitation, { ...baseCitation })).toEqual([]);
  });

  it("detects sourceContext change", () => {
    const next = { ...baseCitation, sourceContext: "Total revenue was $1.2 million" };
    const amendments = computeAmendments(baseCitation, next);
    expect(amendments).toEqual([
      {
        field: "sourceContext",
        previousValue: "The total revenue was $1.2M",
        newValue: "Total revenue was $1.2 million",
      },
    ]);
  });

  it("detects multiple field changes", () => {
    const next = { ...baseCitation, sourceMatch: "revenue", pageNumber: 5 };
    const amendments = computeAmendments(baseCitation, next);
    expect(amendments).toHaveLength(2);
    expect(amendments.map(a => a.field)).toEqual(["sourceMatch", "pageNumber"]);
  });

  it("detects lineIds array change", () => {
    const next = { ...baseCitation, lineIds: [10, 12] };
    const amendments = computeAmendments(baseCitation, next);
    expect(amendments).toEqual([{ field: "lineIds", previousValue: [10, 11], newValue: [10, 12] }]);
  });

  it("treats identical arrays as equal", () => {
    const next = { ...baseCitation, lineIds: [10, 11] };
    expect(computeAmendments(baseCitation, next)).toEqual([]);
  });

  it("detects undefined to value transition", () => {
    const prev = { ...baseCitation, reasoning: undefined } as Citation;
    const amendments = computeAmendments(prev, baseCitation);
    expect(amendments).toEqual([{ field: "reasoning", previousValue: undefined, newValue: "Annual report figure" }]);
  });

  it("detects value to undefined transition", () => {
    const next = { ...baseCitation, reasoning: undefined } as Citation;
    const amendments = computeAmendments(baseCitation, next);
    expect(amendments).toEqual([{ field: "reasoning", previousValue: "Annual report figure", newValue: undefined }]);
  });
});
