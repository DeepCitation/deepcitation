import { describe, expect, test } from "bun:test";
import {
  computeEvidenceCropLayout,
  computeEvidenceScrollTarget,
  projectEvidenceItemToImageRect,
  resolveGeometryProjection,
} from "../drawing";
import { computeAnnotationOriginPercent, computeAnnotationScrollTarget, toPercentRect } from "../react/overlayGeometry";

// A 1000×1400-point page rendered to a 2000×2800 image (renderScale 2×).
const RENDER_SCALE = { x: 2, y: 2 };
const IMAGE_W = 2000;
const IMAGE_H = 2800;

// The same physical line of text expressed in each space.
// Bottom-left: y = 1000 measured up from the page bottom.
// Canonical (top-left): the box top edge sits 400 pt below the page top
// (1400 - 1000 = 400), so the two payloads must project to the same pixel row.
const LEGACY_ITEM = { x: 200, y: 1000, width: 300, height: 20 };
const CANONICAL_ITEM = { x: 200, y: 400, width: 300, height: 20 };

// =========================================================================
// resolveGeometryProjection
// =========================================================================

describe("resolveGeometryProjection", () => {
  test("canonical-v1 selects the no-flip path and forces viewBoxOriginY to 0", () => {
    expect(resolveGeometryProjection({ geometrySpace: "canonical-v1" })).toEqual({
      coordinateOrigin: "image",
      viewBoxOriginY: 0,
    });
  });

  test("canonical-v1 wins over conflicting legacy fields", () => {
    expect(
      resolveGeometryProjection({
        geometrySpace: "canonical-v1",
        coordinateOrigin: "pdf",
        viewBoxOriginY: 36,
      }),
    ).toEqual({ coordinateOrigin: "image", viewBoxOriginY: 0 });
  });

  test("pdf-scale1-bottom-left selects the flip path even when the legacy field says image", () => {
    expect(
      resolveGeometryProjection({
        geometrySpace: "pdf-scale1-bottom-left",
        coordinateOrigin: "image",
        viewBoxOriginY: 36,
      }),
    ).toEqual({ coordinateOrigin: "pdf", viewBoxOriginY: 36 });
  });

  test("an absent tag falls through to the legacy fields", () => {
    expect(resolveGeometryProjection({ coordinateOrigin: "image", viewBoxOriginY: 12 })).toEqual({
      coordinateOrigin: "image",
      viewBoxOriginY: 12,
    });
  });

  test("an absent tag with no legacy fields keeps today's defaults", () => {
    expect(resolveGeometryProjection({})).toEqual({ coordinateOrigin: "pdf", viewBoxOriginY: 0 });
  });
});

// =========================================================================
// projectEvidenceItemToImageRect
// =========================================================================

describe("projectEvidenceItemToImageRect — legacy payloads", () => {
  test("an untagged payload projects exactly as it did before the tag existed", () => {
    const rect = projectEvidenceItemToImageRect({
      item: LEGACY_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
    });
    // Historical formula: y = imageHeight - (item.y - viewBoxOriginY) * scaleY
    expect(rect).toEqual({ x: 400, y: 800, width: 600, height: 40 });
  });

  test("an untagged payload still honours viewBoxOriginY", () => {
    const rect = projectEvidenceItemToImageRect({
      item: LEGACY_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      viewBoxOriginY: 100,
    });
    expect(rect?.y).toBe(IMAGE_H - (1000 - 100) * 2);
  });

  test("passing geometrySpace: undefined changes nothing", () => {
    const withField = projectEvidenceItemToImageRect({
      item: LEGACY_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      coordinateOrigin: "pdf",
      viewBoxOriginY: 100,
      geometrySpace: undefined,
    });
    const withoutField = projectEvidenceItemToImageRect({
      item: LEGACY_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      coordinateOrigin: "pdf",
      viewBoxOriginY: 100,
    });
    expect(withField).toEqual(withoutField);
  });

  test("an explicit pdf-scale1-bottom-left tag matches the untagged projection", () => {
    const tagged = projectEvidenceItemToImageRect({
      item: LEGACY_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      viewBoxOriginY: 100,
      geometrySpace: "pdf-scale1-bottom-left",
    });
    expect(tagged).toEqual({ x: 400, y: IMAGE_H - (1000 - 100) * 2, width: 600, height: 40 });
  });
});

describe("projectEvidenceItemToImageRect — canonical payloads", () => {
  test("canonical geometry projects top-left with no flip", () => {
    const rect = projectEvidenceItemToImageRect({
      item: CANONICAL_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      geometrySpace: "canonical-v1",
    });
    expect(rect).toEqual({ x: 400, y: 800, width: 600, height: 40 });
  });

  test("the canonical payload lands on the same pixels as the legacy payload", () => {
    const legacy = projectEvidenceItemToImageRect({
      item: LEGACY_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
    });
    const canonical = projectEvidenceItemToImageRect({
      item: CANONICAL_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      geometrySpace: "canonical-v1",
    });
    expect(canonical).toEqual(legacy);
  });

  test("canonical geometry ignores a stale viewBoxOriginY on the same payload", () => {
    const rect = projectEvidenceItemToImageRect({
      item: CANONICAL_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      coordinateOrigin: "pdf",
      viewBoxOriginY: 36,
      geometrySpace: "canonical-v1",
    });
    expect(rect?.y).toBe(800);
  });
});

// =========================================================================
// Downstream consumers
// =========================================================================

describe("toPercentRect", () => {
  test("legacy and canonical payloads produce the same percentages", () => {
    const legacy = toPercentRect(LEGACY_ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H);
    const canonical = toPercentRect(
      CANONICAL_ITEM,
      RENDER_SCALE,
      IMAGE_W,
      IMAGE_H,
      undefined,
      undefined,
      "canonical-v1",
    );
    expect(legacy).toEqual({
      left: "20%",
      top: `${(800 / IMAGE_H) * 100}%`,
      width: "30%",
      height: `${(40 / IMAGE_H) * 100}%`,
    });
    expect(canonical).toEqual(legacy);
  });

  test("the tag wins when a legacy origin is also passed", () => {
    const tagged = toPercentRect(CANONICAL_ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, "pdf", 36, "canonical-v1");
    const untagged = toPercentRect(CANONICAL_ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, "image", 0);
    expect(tagged).toEqual(untagged);
  });
});

describe("computeAnnotationScrollTarget", () => {
  const ZOOM = 0.5;
  const CONTAINER_W = 800;
  const CONTAINER_H = 600;

  test("legacy and canonical payloads scroll to the same place", () => {
    const legacy = computeAnnotationScrollTarget(
      LEGACY_ITEM,
      RENDER_SCALE,
      IMAGE_W,
      IMAGE_H,
      ZOOM,
      CONTAINER_W,
      CONTAINER_H,
    );
    const canonical = computeAnnotationScrollTarget(
      CANONICAL_ITEM,
      RENDER_SCALE,
      IMAGE_W,
      IMAGE_H,
      ZOOM,
      CONTAINER_W,
      CONTAINER_H,
      undefined,
      undefined,
      "center",
      "canonical-v1",
    );
    expect(legacy).toEqual({ scrollLeft: 0, scrollTop: 110 });
    expect(canonical).toEqual(legacy);
  });
});

describe("computeAnnotationOriginPercent", () => {
  test("legacy and canonical payloads share a transform origin", () => {
    const legacy = computeAnnotationOriginPercent(LEGACY_ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H);
    const canonical = computeAnnotationOriginPercent(
      CANONICAL_ITEM,
      RENDER_SCALE,
      IMAGE_W,
      IMAGE_H,
      undefined,
      undefined,
      "canonical-v1",
    );
    expect(legacy).toEqual({ xPercent: 35, yPercent: (820 / IMAGE_H) * 100 });
    expect(canonical).toEqual(legacy);
  });
});

describe("computeEvidenceScrollTarget", () => {
  test("the tag overrides a conflicting coordinateOrigin", () => {
    const tagged = computeEvidenceScrollTarget({
      item: LEGACY_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      zoom: 1,
      viewportWidth: 800,
      viewportHeight: 600,
      coordinateOrigin: "image",
      geometrySpace: "pdf-scale1-bottom-left",
    });
    const legacyEquivalent = computeEvidenceScrollTarget({
      item: LEGACY_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      zoom: 1,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(tagged).toEqual(legacyEquivalent);
  });
});

describe("keyhole snippet detection", () => {
  // EvidenceKeyhole decides "is this evidence image a snippet rather than the
  // full page?" by projecting the anchor and checking whether it lands outside
  // the image. That test has to hold in both spaces, since the projection —
  // not a hand-rolled flip — now answers it.
  const SNIPPET_H = 354;

  test("a full-page bottom-left anchor lands outside a snippet-sized image", () => {
    const rect = projectEvidenceItemToImageRect({
      item: LEGACY_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: 976,
      imageNaturalHeight: SNIPPET_H,
    });
    expect(rect).not.toBeNull();
    expect(rect?.y).toBeLessThan(0);
  });

  test("a full-page canonical anchor also lands outside a snippet-sized image", () => {
    const rect = projectEvidenceItemToImageRect({
      item: CANONICAL_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: 976,
      imageNaturalHeight: SNIPPET_H,
      geometrySpace: "canonical-v1",
    });
    expect(rect).not.toBeNull();
    expect(rect?.y).toBeGreaterThan(SNIPPET_H);
  });

  test("a canonical anchor on a full-page image stays inside the image", () => {
    const rect = projectEvidenceItemToImageRect({
      item: CANONICAL_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      geometrySpace: "canonical-v1",
    });
    expect(rect?.y).toBeGreaterThanOrEqual(0);
    expect(rect?.y).toBeLessThanOrEqual(IMAGE_H);
  });
});

describe("computeEvidenceCropLayout", () => {
  test("legacy and canonical payloads crop the same region", () => {
    const legacy = computeEvidenceCropLayout({
      sourceContextDeepItem: LEGACY_ITEM,
      sourceMatchDeepItems: [{ ...LEGACY_ITEM, width: 80 }],
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      padding: 24,
    });
    const canonical = computeEvidenceCropLayout({
      sourceContextDeepItem: CANONICAL_ITEM,
      sourceMatchDeepItems: [{ ...CANONICAL_ITEM, width: 80 }],
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      padding: 24,
      geometrySpace: "canonical-v1",
    });
    expect(legacy).not.toBeNull();
    expect(canonical).toEqual(legacy);
  });

  test("canonical geometry does not fall back to the flip when viewBoxOriginY is present", () => {
    const canonical = computeEvidenceCropLayout({
      sourceContextDeepItem: CANONICAL_ITEM,
      renderScale: RENDER_SCALE,
      imageNaturalWidth: IMAGE_W,
      imageNaturalHeight: IMAGE_H,
      viewBoxOriginY: 36,
      padding: 24,
      geometrySpace: "canonical-v1",
    });
    expect(canonical?.sourceContextRect.y).toBe(800);
  });
});

describe("degenerate geometry", () => {
  // The two former hand-rolled flips (useImageDarkness, EvidenceKeyhole's
  // snippet heuristic) now route through this projection, so they inherit its
  // guard: a non-positive or non-finite renderScale yields null rather than a
  // coordinate derived from it. Callers must treat null as "cannot project"
  // (no darkness probe, snippet fallback), not as a projected value of 0.
  test.each([
    ["zero scale", { x: 0, y: 0 }],
    ["negative scale", { x: -1, y: -1 }],
    ["non-finite scale", { x: Number.NaN, y: Number.NaN }],
  ])("returns null for %s instead of a bogus rect", (_label, renderScale) => {
    expect(
      projectEvidenceItemToImageRect({
        item: LEGACY_ITEM,
        renderScale,
        imageNaturalWidth: IMAGE_W,
        imageNaturalHeight: IMAGE_H,
      }),
    ).toBeNull();
  });

  test("returns null when the image has no natural size yet", () => {
    expect(
      projectEvidenceItemToImageRect({
        item: CANONICAL_ITEM,
        renderScale: RENDER_SCALE,
        imageNaturalWidth: 0,
        imageNaturalHeight: 0,
        geometrySpace: "canonical-v1",
      }),
    ).toBeNull();
  });
});
