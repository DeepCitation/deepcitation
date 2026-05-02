import { describe, expect, test } from "bun:test";
import { computeExpandedPageFittedZoom } from "../react/evidence/expandedPageViewportGeometry";

describe("computeExpandedPageFittedZoom", () => {
  test("fits the expanded page to the measured scroll container width", () => {
    const result = computeExpandedPageFittedZoom({
      contentReady: true,
      width: 1224,
      containerWidth: 697,
    });

    expect(result?.readable).toBeCloseTo(665 / 1224, 5);
    expect(result?.floor).toBe(0.5);
  });

  test("fits below the usual readable zoom floor when the page would otherwise be clipped", () => {
    const result = computeExpandedPageFittedZoom({
      contentReady: true,
      width: 2000,
      containerWidth: 697,
    });

    expect(result?.readable).toBeCloseTo(665 / 2000, 5);
    expect(result?.floor).toBeCloseTo(665 / 2000, 5);
  });

  test("returns null until the page and container have measurable dimensions", () => {
    expect(
      computeExpandedPageFittedZoom({
        contentReady: false,
        width: 1224,
        containerWidth: 697,
      }),
    ).toBeNull();
    expect(
      computeExpandedPageFittedZoom({
        contentReady: true,
        width: null,
        containerWidth: 697,
      }),
    ).toBeNull();
    expect(
      computeExpandedPageFittedZoom({
        contentReady: true,
        width: 1224,
        containerWidth: null,
      }),
    ).toBeNull();
  });
});
