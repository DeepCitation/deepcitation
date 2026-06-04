import { describe, expect, it } from "bun:test";
import {
  computeEvidenceCropLayout,
  computeEvidenceKeyholeEdgeGutter,
  computeEvidenceKeyholeZoom,
  computeEvidenceScrollTarget,
  projectEvidenceItemToImageRect,
  selectEvidenceAnnotationScrollItem,
  selectEvidenceKeyholeFrameItem,
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

describe("computeEvidenceKeyholeZoom", () => {
  it("zooms a full page render into a readable keyhole band", () => {
    const zoom = computeEvidenceKeyholeZoom({
      imageNaturalWidth: 612,
      imageNaturalHeight: 792,
      viewportWidth: 640,
      contextHeight: 34,
    });

    expect(zoom).toBeGreaterThan(1);
    expect(zoom).toBeCloseTo(640 / 612, 5);
  });

  it("keeps tiny page renders from staying as unreadable thumbnails", () => {
    const zoom = computeEvidenceKeyholeZoom({
      imageNaturalWidth: 180,
      imageNaturalHeight: 240,
      viewportWidth: 320,
      contextHeight: 8,
    });

    expect(zoom).toBeGreaterThan(2);
    expect(zoom).toBeLessThanOrEqual(6);
  });

  it("does not shrink to fit wide context rows into the keyhole", () => {
    const zoom = computeEvidenceKeyholeZoom({
      imageNaturalWidth: 1094,
      imageNaturalHeight: 1500,
      viewportWidth: 320,
      contextHeight: 12,
    });

    expect(zoom).toBeCloseTo(32 / 12, 5);
  });
});

describe("computeEvidenceKeyholeEdgeGutter", () => {
  it("adds enough trailing scroll range to frame citations at image edges", () => {
    expect(computeEvidenceKeyholeEdgeGutter({ viewportWidth: 320, viewportHeight: 120 })).toEqual({
      width: 160,
      height: 60,
    });
  });

  it("does not emit invalid gutter dimensions before layout is measured", () => {
    expect(computeEvidenceKeyholeEdgeGutter({ viewportWidth: 0, viewportHeight: Number.NaN })).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe("selectEvidenceKeyholeFrameItem", () => {
  const wideSourceContextDeepItem = {
    x: 100,
    y: 520,
    width: 500,
    height: 80,
    text: "fatigue panic attacks self harm bangvious",
  };
  const wideSourceMatchDeepItems = [
    {
      x: 100,
      y: 520,
      width: 140,
      height: 20,
      text: "fatigue",
    },
  ];

  it("aims at the source context while the context fits in the keyhole viewport", () => {
    const item = selectEvidenceKeyholeFrameItem({
      sourceContextDeepItem: wideSourceContextDeepItem,
      sourceMatchDeepItems: wideSourceMatchDeepItems,
      renderScale: { x: 1, y: 1 },
      zoom: 1,
      viewportWidth: 640,
    });

    expect(item).toBe(wideSourceContextDeepItem);
  });

  it("aims at the claim-match item when readable zoom makes a wide context overflow", () => {
    const item = selectEvidenceKeyholeFrameItem({
      sourceContextDeepItem: wideSourceContextDeepItem,
      sourceMatchDeepItems: wideSourceMatchDeepItems,
      renderScale: { x: 1, y: 1 },
      zoom: 2,
      viewportWidth: 640,
    });

    expect(item).toBe(wideSourceMatchDeepItems[0]);
  });

  it("aims at the first match item for top-left anchored unsure matches", () => {
    const item = selectEvidenceKeyholeFrameItem({
      sourceContextDeepItem: wideSourceContextDeepItem,
      sourceMatchDeepItems: wideSourceMatchDeepItems,
      renderScale: { x: 1, y: 1 },
      zoom: 1,
      viewportWidth: 640,
      preferFirstMatch: true,
    });

    expect(item).toBe(wideSourceMatchDeepItems[0]);
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

describe("computeEvidenceCropLayout", () => {
  it("returns the crop, bracket, spotlight, and anchor highlight rectangles for server bitmap rendering", () => {
    const layout = computeEvidenceCropLayout({
      sourceContextDeepItem,
      sourceMatchDeepItems,
      renderScale: { x: 1, y: 1 },
      imageNaturalWidth: 800,
      imageNaturalHeight: 1000,
      padding: 60,
    });

    expect(layout).not.toBeNull();
    expect(layout?.cropRect).toEqual({ x: 40, y: 420, width: 620, height: 200 });
    expect(layout?.sourceContextRect).toEqual({ x: 100, y: 480, width: 500, height: 80 });
    expect(layout?.bracketRect).toEqual({ x: 58, y: 58, width: 504, height: 84 });
    expect(layout?.spotlightRect).toEqual({ x: 28, y: 28, width: 564, height: 144 });
    expect(layout?.anchorHighlightRects).toEqual([{ x: 58, y: 58, width: 84, height: 24 }]);
  });

  it("applies viewBoxOriginY once when computing crop-relative PDF rectangles", () => {
    const layout = computeEvidenceCropLayout({
      sourceContextDeepItem: { x: 50, y: 613, width: 200, height: 11 },
      renderScale: { x: 2.083, y: 2.083 },
      imageNaturalWidth: 898,
      imageNaturalHeight: 1352,
      viewBoxOriginY: 3.84,
      padding: 60,
    });

    expect(layout).not.toBeNull();
    expect(layout?.sourceContextRect.x).toBeCloseTo(104.15, 2);
    expect(layout?.sourceContextRect.y).toBeCloseTo(83.12, 2);
    expect(layout?.cropRect.x).toBe(44);
    expect(layout?.cropRect.y).toBe(23);
    expect(layout?.bracketRect.x).toBeCloseTo(58.15, 2);
    expect(layout?.bracketRect.y).toBeCloseTo(58.12, 2);
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

  it("uses the canonical keyhole top-left inset by default", () => {
    const target = computeEvidenceScrollTarget({
      item: { x: 100, y: 700, width: 600, height: 300 },
      renderScale: { x: 1, y: 1 },
      imageNaturalWidth: 800,
      imageNaturalHeight: 1000,
      zoom: 1,
      viewportWidth: 320,
      viewportHeight: 120,
      anchorTopLeft: true,
    });

    expect(target).toEqual({ scrollLeft: 88, scrollTop: 288 });
  });
});
