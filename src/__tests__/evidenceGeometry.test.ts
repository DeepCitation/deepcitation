import { describe, expect, it } from "bun:test";
import {
  computeEvidenceScrollTarget,
  projectEvidenceItemToImageRect,
  selectEvidenceAnnotationScrollItem,
  selectEvidenceKeyholeScrollItem,
} from "../drawing";

const sourceContextDeepItem = {
  x: 100,
  y: 520,
  width: 500,
  height: 80,
  text: "fatigue panic attacks self harm bangvious",
};

const sourceMatchDeepItems = [
  {
    x: 100,
    y: 520,
    width: 80,
    height: 20,
    text: "fatigue",
  },
];

describe("selectEvidenceAnnotationScrollItem", () => {
  it("aims at sourceMatch when the renderer will highlight the anchor text", () => {
    const item = selectEvidenceAnnotationScrollItem({
      sourceContextDeepItem,
      sourceMatchDeepItems,
      verifiedSourceMatch: "fatigue",
      verifiedSourceContext: "fatigue panic attacks self harm bangvious",
    });

    expect(item).toBe(sourceMatchDeepItems[0]);
  });

  it("falls back to sourceContext when sourceMatch should not be highlighted", () => {
    const item = selectEvidenceAnnotationScrollItem({
      sourceContextDeepItem,
      sourceMatchDeepItems,
      verifiedSourceMatch: null,
      verifiedSourceContext: "fatigue panic attacks self harm bangvious",
    });

    expect(item).toBe(sourceContextDeepItem);
  });

  it("uses phrase text for strategy-overridden verifications", () => {
    const item = selectEvidenceAnnotationScrollItem({
      sourceContextDeepItem,
      sourceMatchDeepItems,
      verifiedSourceMatch: "fatigue",
      verifiedSourceContext: "fatigue",
    });

    expect(item).toBe(sourceMatchDeepItems[0]);
  });
});

describe("selectEvidenceKeyholeScrollItem", () => {
  it("prefers the first sourceMatch item when the keyhole is aiming a crop", () => {
    const item = selectEvidenceKeyholeScrollItem({
      sourceContextDeepItem,
      sourceMatchDeepItems,
    });

    expect(item).toBe(sourceMatchDeepItems[0]);
  });

  it("falls back to the sourceContext item when no sourceMatch item exists", () => {
    const item = selectEvidenceKeyholeScrollItem({
      sourceContextDeepItem,
      sourceMatchDeepItems: null,
    });

    expect(item).toBe(sourceContextDeepItem);
  });
});

describe("projectEvidenceItemToImageRect", () => {
  it("applies PDF y-axis projection and viewBoxOriginY correction once", () => {
    const rect = projectEvidenceItemToImageRect({
      item: { x: 50, y: 613, width: 200, height: 11 },
      renderScale: { x: 2.083, y: 2.083 },
      imageNaturalWidth: 898,
      imageNaturalHeight: 1352,
      coordinateOrigin: "pdf",
      viewBoxOriginY: 3.84,
    });

    expect(rect).not.toBeNull();
    expect(rect?.x).toBeCloseTo(104.15, 2);
    expect(rect?.y).toBeCloseTo(83.12, 2);
    expect(rect?.width).toBeCloseTo(416.6, 2);
    expect(rect?.height).toBeCloseTo(22.91, 2);
  });
});

describe("computeEvidenceScrollTarget", () => {
  it("can aim horizontally at an anchor while vertically centering the larger context", () => {
    const target = computeEvidenceScrollTarget({
      item: { x: 100, y: 520, width: 80, height: 20 },
      verticalItem: { x: 100, y: 520, width: 500, height: 80 },
      renderScale: { x: 1, y: 1 },
      imageNaturalWidth: 800,
      imageNaturalHeight: 1000,
      zoom: 1,
      viewportWidth: 320,
      viewportHeight: 120,
    });

    expect(target).toEqual({ scrollLeft: 0, scrollTop: 460 });
  });

  it("uses trailing gutter so edge citations can be framed", () => {
    const target = computeEvidenceScrollTarget({
      item: { x: 100, y: 10, width: 100, height: 10 },
      renderScale: { x: 1, y: 1 },
      imageNaturalWidth: 1000,
      imageNaturalHeight: 1000,
      zoom: 1,
      viewportWidth: 320,
      viewportHeight: 120,
      edgeGutterHeight: 60,
    });

    expect(target?.scrollTop).toBe(935);
  });

  it("can anchor an unsure match to its top-left corner", () => {
    const target = computeEvidenceScrollTarget({
      item: { x: 100, y: 700, width: 600, height: 300 },
      renderScale: { x: 1, y: 1 },
      imageNaturalWidth: 800,
      imageNaturalHeight: 1000,
      zoom: 1,
      viewportWidth: 320,
      viewportHeight: 120,
      anchorTopLeft: true,
      topLeftPaddingPx: 12,
    });

    expect(target).toEqual({ scrollLeft: 88, scrollTop: 288 });
  });
});
