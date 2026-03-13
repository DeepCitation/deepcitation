import { describe, expect, it } from "@jest/globals";
import { expandRange } from "../utils/rangeExpansion.js";

describe("expandRange", () => {
  it("expands a small range fully", () => {
    expect(expandRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns single element when start === end", () => {
    expect(expandRange(7, 7)).toEqual([7]);
  });

  it("returns [start] when start > end", () => {
    expect(expandRange(10, 5)).toEqual([10]);
  });

  it("expands range at the MAX_RANGE_SIZE boundary (1000) fully", () => {
    const result = expandRange(1, 1000);
    expect(result).toHaveLength(1000);
    expect(result[0]).toBe(1);
    expect(result[999]).toBe(1000);
  });

  it("samples a large range (> 1000) to ~50 points", () => {
    const result = expandRange(1, 5000);
    expect(result.length).toBeGreaterThanOrEqual(3); // at least start, one sample, end
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result[0]).toBe(1);
    expect(result[result.length - 1]).toBe(5000);
  });

  it("returns sorted values for sampled ranges", () => {
    const result = expandRange(1, 10000);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1]);
    }
  });
});
