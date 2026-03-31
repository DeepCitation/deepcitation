import { describe, expect, test } from "@jest/globals";
import { computeAnnotationOriginPercent, computeAnnotationScrollTarget, toPercentRect } from "../react/overlayGeometry";

// Helper: a standard annotation item and rendering context for tests.
// Represents text near the center of a 1000×1400 PDF page rendered to a
// 2000×2800 image (renderScale = 2× in both axes).
const RENDER_SCALE = { x: 2, y: 2 };
const IMAGE_W = 2000;
const IMAGE_H = 2800;

// PDF coords: x=200, y=1000 (bottom-up), width=300, height=20
// Image coords after y-flip: pixelX=400, pixelY=2800-2000=800, pixelW=600, pixelH=40
// Center: (700, 820)
const ITEM = { x: 200, y: 1000, width: 300, height: 20 };

// =========================================================================
// computeAnnotationScrollTarget
// =========================================================================

describe("computeAnnotationScrollTarget", () => {
  test("centers annotation in viewport (standard case)", () => {
    const containerW = 800;
    const containerH = 600;
    const zoom = 0.5;

    // Zoomed center: (700 * 0.5, 820 * 0.5) = (350, 410)
    // Raw scroll: (350 - 400, 410 - 300) = (-50, 110)
    // Max scroll: (2000*0.5 - 800, 2800*0.5 - 600) = (200, 800)
    // Clamped: (0, 110)
    const result = computeAnnotationScrollTarget(ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, zoom, containerW, containerH);
    expect(result).not.toBeNull();
    expect(result?.scrollLeft).toBe(0); // clamped from -50
    expect(result?.scrollTop).toBe(110);
  });

  test("clamps to 0 when annotation is near top-left", () => {
    // Item at top-left of image: PDF coords (0, 1400) → image (0, 0)
    const topLeftItem = { x: 0, y: 1400, width: 50, height: 10 };
    const result = computeAnnotationScrollTarget(topLeftItem, RENDER_SCALE, IMAGE_W, IMAGE_H, 1, 800, 600);
    expect(result).not.toBeNull();
    expect(result?.scrollLeft).toBe(0);
    expect(result?.scrollTop).toBe(0);
  });

  test("clamps to max scroll when annotation is near bottom-right", () => {
    // Item at bottom-right: PDF coords (900, 10) → image (1800, 2780)
    const bottomRightItem = { x: 900, y: 10, width: 100, height: 10 };
    const zoom = 1;
    const containerW = 800;
    const containerH = 600;

    const result = computeAnnotationScrollTarget(
      bottomRightItem,
      RENDER_SCALE,
      IMAGE_W,
      IMAGE_H,
      zoom,
      containerW,
      containerH,
    );
    expect(result).not.toBeNull();
    // Max scroll: (2000 - 800, 2800 - 600) = (1200, 2200)
    expect(result?.scrollLeft).toBe(1200);
    expect(result?.scrollTop).toBe(2200);
  });

  test("returns null for zero renderScale", () => {
    const result = computeAnnotationScrollTarget(ITEM, { x: 0, y: 2 }, IMAGE_W, IMAGE_H, 1, 800, 600);
    expect(result).toBeNull();
  });

  test("returns null for zero zoom", () => {
    const result = computeAnnotationScrollTarget(ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, 0, 800, 600);
    expect(result).toBeNull();
  });

  test("returns null for negative zoom", () => {
    const result = computeAnnotationScrollTarget(ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, -1, 800, 600);
    expect(result).toBeNull();
  });

  test("returns null for zero container dimensions", () => {
    expect(computeAnnotationScrollTarget(ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, 1, 0, 600)).toBeNull();
    expect(computeAnnotationScrollTarget(ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, 1, 800, 0)).toBeNull();
  });

  test("returns null for NaN inputs", () => {
    expect(computeAnnotationScrollTarget(ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, NaN, 800, 600)).toBeNull();
    expect(computeAnnotationScrollTarget(ITEM, { x: NaN, y: 2 }, IMAGE_W, IMAGE_H, 1, 800, 600)).toBeNull();
    expect(computeAnnotationScrollTarget(ITEM, RENDER_SCALE, NaN, IMAGE_H, 1, 800, 600)).toBeNull();
  });

  test("returns null for Infinity inputs", () => {
    expect(computeAnnotationScrollTarget(ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, Infinity, 800, 600)).toBeNull();
  });

  test("no-op when image fits entirely in container (scroll = 0,0)", () => {
    // Container is larger than image × zoom → maxScroll = 0 in both axes
    const result = computeAnnotationScrollTarget(ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H, 0.1, 2000, 2000);
    expect(result).not.toBeNull();
    expect(result?.scrollLeft).toBe(0);
    expect(result?.scrollTop).toBe(0);
  });

  test("handles PDF y-axis flip correctly", () => {
    // Item at PDF y=1400 (top of page) → imageY = 2800 - 2800 = 0 (top of image)
    const topItem = { x: 500, y: 1400, width: 100, height: 10 };
    const result = computeAnnotationScrollTarget(topItem, RENDER_SCALE, IMAGE_W, IMAGE_H, 1, 800, 600);
    expect(result).not.toBeNull();
    // imageY = 2800 - 1400*2 = 0, center = 0 + 20/2 = 10
    // scrollTop = 10 - 300 = -290, clamped to 0
    expect(result?.scrollTop).toBe(0);
  });
});

// =========================================================================
// computeAnnotationOriginPercent
// =========================================================================

describe("computeAnnotationOriginPercent", () => {
  test("returns correct center percentages", () => {
    // Center in image coords: (700, 820) out of (2000, 2800)
    // → xPercent = 35%, yPercent ≈ 29.29%
    const result = computeAnnotationOriginPercent(ITEM, RENDER_SCALE, IMAGE_W, IMAGE_H);
    expect(result).not.toBeNull();
    expect(result?.xPercent).toBeCloseTo(35, 5);
    expect(result?.yPercent).toBeCloseTo(29.2857, 2);
  });

  test("clamps to 0-100 range for items at edges", () => {
    // Item at very bottom-right of image
    const edgeItem = { x: 990, y: 5, width: 100, height: 10 };
    const result = computeAnnotationOriginPercent(edgeItem, RENDER_SCALE, IMAGE_W, IMAGE_H);
    expect(result).not.toBeNull();
    expect(result?.xPercent).toBeLessThanOrEqual(100);
    expect(result?.yPercent).toBeLessThanOrEqual(100);
    expect(result?.xPercent).toBeGreaterThanOrEqual(0);
    expect(result?.yPercent).toBeGreaterThanOrEqual(0);
  });

  test("returns null for zero renderScale", () => {
    expect(computeAnnotationOriginPercent(ITEM, { x: 0, y: 2 }, IMAGE_W, IMAGE_H)).toBeNull();
  });

  test("returns null for zero image dimensions", () => {
    expect(computeAnnotationOriginPercent(ITEM, RENDER_SCALE, 0, IMAGE_H)).toBeNull();
    expect(computeAnnotationOriginPercent(ITEM, RENDER_SCALE, IMAGE_W, 0)).toBeNull();
  });

  test("returns null for NaN renderScale", () => {
    expect(computeAnnotationOriginPercent(ITEM, { x: NaN, y: 2 }, IMAGE_W, IMAGE_H)).toBeNull();
  });

  test("center point at 50%/50% for centered annotation", () => {
    // Item centered exactly in the middle of the image
    // Image is 1000×1000, renderScale 1×1
    // PDF coords: x=400, y=550 (bottom-up), width=200, height=100
    // imageX = 400, imageY = 1000 - 550 = 450, w=200, h=100
    // center = (500, 500) → 50%, 50%
    const centeredItem = { x: 400, y: 550, width: 200, height: 100 };
    const result = computeAnnotationOriginPercent(centeredItem, { x: 1, y: 1 }, 1000, 1000);
    expect(result).not.toBeNull();
    expect(result?.xPercent).toBeCloseTo(50, 5);
    expect(result?.yPercent).toBeCloseTo(50, 5);
  });
});

// =========================================================================
// Image coordinate origin (top-down Y) — origin = "image"
// =========================================================================

describe("image coordinate origin (top-down Y)", () => {
  // Image OCR coords: y increases downward (y=0 at top).
  // 795×491 image, renderScale 1×1 — matches the medicalDemo fixture.
  const IMG_W = 795;
  const IMG_H = 491;
  const IDENTITY = { x: 1, y: 1 };

  test("toPercentRect places item at correct position (no Y-flip)", () => {
    // "DOE JOHN" at y=370 in a 491px image → ~75.4% from top
    const item = { x: 296, y: 370, width: 72, height: 44 };
    const rect = toPercentRect(item, IDENTITY, IMG_W, IMG_H, "image");
    expect(rect).not.toBeNull();
    // top ≈ 370/491 * 100 ≈ 75.36%
    expect(parseFloat(rect?.top ?? "")).toBeCloseTo(75.356, 1);
    // left ≈ 296/795 * 100 ≈ 37.23%
    expect(parseFloat(rect?.left ?? "")).toBeCloseTo(37.233, 1);
  });

  test("toPercentRect with PDF origin flips Y (would be wrong for image coords)", () => {
    const item = { x: 296, y: 370, width: 72, height: 44 };
    const rect = toPercentRect(item, IDENTITY, IMG_W, IMG_H, "pdf");
    expect(rect).not.toBeNull();
    // PDF flip: top = (491 - 370) / 491 * 100 ≈ 24.64% — wrong for top-down image coords
    expect(parseFloat(rect?.top ?? "")).toBeCloseTo(24.643, 1);
  });

  test("computeAnnotationScrollTarget uses top-down Y for image origin", () => {
    // Item near bottom of a 795×491 image
    const item = { x: 296, y: 370, width: 72, height: 44 };
    const result = computeAnnotationScrollTarget(item, IDENTITY, IMG_W, IMG_H, 1, 400, 300, "image");
    expect(result).not.toBeNull();
    // Center: (296+36, 370+22) = (332, 392)
    // Raw scrollTop = 392 - 150 = 242, max = 491-300 = 191, clamped to 191
    expect(result?.scrollTop).toBe(191);
  });

  test("computeAnnotationOriginPercent uses top-down Y for image origin", () => {
    const item = { x: 296, y: 370, width: 72, height: 44 };
    const result = computeAnnotationOriginPercent(item, IDENTITY, IMG_W, IMG_H, "image");
    expect(result).not.toBeNull();
    // centerY = 370 + 22 = 392 → 392/491 * 100 ≈ 79.84%
    expect(result?.yPercent).toBeCloseTo(79.837, 1);
  });

  test("defaults to PDF origin when origin parameter is omitted", () => {
    const item = { x: 296, y: 370, width: 72, height: 44 };
    const withDefault = toPercentRect(item, IDENTITY, IMG_W, IMG_H);
    const withPdf = toPercentRect(item, IDENTITY, IMG_W, IMG_H, "pdf");
    expect(withDefault).toEqual(withPdf);
  });
});

// =========================================================================
// viewBoxOriginY correction — pages where CropBox doesn't start at y=0
// =========================================================================

describe("viewBoxOriginY correction", () => {
  // Simulates Brown v. Board PDF: viewBox [0, 3.84, 431.04, 652.8]
  // Page height = 648.96 points, rendered at 150 DPI (renderScale ≈ 2.083)
  const VB_ORIGIN_Y = 3.84;
  const PAGE_HEIGHT = 648.96;
  const SCALE = { x: 2.083, y: 2.083 };
  const IMG_W = Math.round(431.04 * 2.083); // ≈ 898
  const IMG_H = Math.round(PAGE_HEIGHT * 2.083); // ≈ 1352

  test("toPercentRect shifts highlight down when viewBoxOriginY > 0", () => {
    // Text at y=613 in absolute PDF space (near top of page)
    const item = { x: 50, y: 613, width: 200, height: 11 };

    const withoutFix = toPercentRect(item, SCALE, IMG_W, IMG_H, "pdf", 0);
    const withFix = toPercentRect(item, SCALE, IMG_W, IMG_H, "pdf", VB_ORIGIN_Y);

    expect(withoutFix).not.toBeNull();
    expect(withFix).not.toBeNull();
    if (!withoutFix || !withFix) return;

    // The fix should shift the highlight DOWN (larger top%) by viewBoxOriginY * scale pixels
    const topWithout = parseFloat(withoutFix.top);
    const topWith = parseFloat(withFix.top);
    expect(topWith).toBeGreaterThan(topWithout);

    // The shift should be approximately viewBoxOriginY * scale / imageHeight * 100
    const expectedShift = ((VB_ORIGIN_Y * SCALE.y) / IMG_H) * 100;
    expect(topWith - topWithout).toBeCloseTo(expectedShift, 1);
  });

  test("viewBoxOriginY=0 produces same result as default", () => {
    const item = { x: 50, y: 613, width: 200, height: 11 };
    const defaultResult = toPercentRect(item, SCALE, IMG_W, IMG_H, "pdf");
    const zeroResult = toPercentRect(item, SCALE, IMG_W, IMG_H, "pdf", 0);
    expect(defaultResult).toEqual(zeroResult);
  });

  test("viewBoxOriginY does not affect image-origin coordinates", () => {
    const item = { x: 50, y: 100, width: 200, height: 11 };
    const without = toPercentRect(item, SCALE, IMG_W, IMG_H, "image", 0);
    const with_ = toPercentRect(item, SCALE, IMG_W, IMG_H, "image", VB_ORIGIN_Y);
    // Image coordinates don't use viewBoxOriginY
    expect(without).toEqual(with_);
  });

  test("computeAnnotationScrollTarget applies viewBoxOriginY correction", () => {
    const item = { x: 50, y: 613, width: 200, height: 11 };
    const without = computeAnnotationScrollTarget(item, SCALE, IMG_W, IMG_H, 1, 400, 300, "pdf", 0);
    const with_ = computeAnnotationScrollTarget(item, SCALE, IMG_W, IMG_H, 1, 400, 300, "pdf", VB_ORIGIN_Y);
    expect(without).not.toBeNull();
    expect(with_).not.toBeNull();
    if (!without || !with_) return;
    // With correction, scrollTop should be larger (highlight is lower on page)
    expect(with_.scrollTop).toBeGreaterThanOrEqual(without.scrollTop);
  });
});
