import { describe, expect, test } from "bun:test";
import { computeKeyholeOffset } from "../react/computeKeyholeOffset";

describe("computeKeyholeOffset", () => {
  // =========================================================================
  // Image fits in container (no scrolling needed)
  // =========================================================================

  test("returns scrollLeft 0 with no fades when image fits in container", () => {
    const result = computeKeyholeOffset(300, 480, null);
    expect(result).toEqual({ scrollLeft: 0, fadeLeft: false, fadeRight: false });
  });

  test("returns scrollLeft 0 with no fades when image exactly matches container width", () => {
    const result = computeKeyholeOffset(480, 480, null);
    expect(result).toEqual({ scrollLeft: 0, fadeLeft: false, fadeRight: false });
  });

  test("ignores highlight box when image fits in container", () => {
    const result = computeKeyholeOffset(300, 480, { x: 100, width: 50 });
    expect(result).toEqual({ scrollLeft: 0, fadeLeft: false, fadeRight: false });
  });

  // =========================================================================
  // No highlight box — center image
  // =========================================================================

  test("centers image when no highlight box and image is wider", () => {
    const result = computeKeyholeOffset(1000, 480, null);
    // Center: (1000 - 480) / 2 = 260
    expect(result.scrollLeft).toBe(260);
    expect(result.fadeLeft).toBe(true);
    expect(result.fadeRight).toBe(true);
  });

  // =========================================================================
  // Highlight near the start (< 15% of width) — align left
  // =========================================================================

  test("aligns left when highlight is near the start of the image", () => {
    // Image 1000px, highlight at x=50, width=80 (right edge at 130, < 15% of 1000 = 150)
    const result = computeKeyholeOffset(1000, 480, { x: 50, width: 80 });
    expect(result.scrollLeft).toBe(0);
    expect(result.fadeLeft).toBe(false);
    expect(result.fadeRight).toBe(true);
  });

  test("aligns left when highlight starts at 0", () => {
    const result = computeKeyholeOffset(1000, 480, { x: 0, width: 100 });
    expect(result.scrollLeft).toBe(0);
    expect(result.fadeLeft).toBe(false);
    expect(result.fadeRight).toBe(true);
  });

  // =========================================================================
  // Highlight near the end (> 85% of width) — align right
  // =========================================================================

  test("aligns right when highlight is near the end of the image", () => {
    // Image 1000px, highlight at x=870, width=100 (right edge at 970, > 85% of 1000 = 850)
    const result = computeKeyholeOffset(1000, 480, { x: 870, width: 100 });
    // maxScroll = 1000 - 480 = 520
    expect(result.scrollLeft).toBe(520);
    expect(result.fadeLeft).toBe(true);
    expect(result.fadeRight).toBe(false);
  });

  // =========================================================================
  // Highlight in the middle — center on highlight
  // =========================================================================

  test("centers on highlight when it is in the middle of the image", () => {
    // Image 1000px, container 480px, highlight at x=400, width=100
    // highlightCenter = 450, scrollLeft = 450 - 240 = 210
    const result = computeKeyholeOffset(1000, 480, { x: 400, width: 100 });
    expect(result.scrollLeft).toBe(210);
    expect(result.fadeLeft).toBe(true);
    expect(result.fadeRight).toBe(true);
  });

  // =========================================================================
  // Clamping
  // =========================================================================

  test("clamps scrollLeft to 0 when centering would go negative", () => {
    // Image 600px, container 480px, highlight at x=0 width=100
    // highlightCenter = 50, scrollLeft = 50 - 240 = -190 → clamped to 0
    const result = computeKeyholeOffset(600, 480, { x: 0, width: 100 });
    expect(result.scrollLeft).toBe(0);
    expect(result.fadeLeft).toBe(false);
  });

  test("clamps scrollLeft to maxScroll when centering would exceed it", () => {
    // Image 600px, container 480px, highlight at x=550 width=40
    // highlightRight = 590 > 85% of 600 = 510 → align right
    // maxScroll = 600 - 480 = 120
    const result = computeKeyholeOffset(600, 480, { x: 550, width: 40 });
    expect(result.scrollLeft).toBe(120);
    expect(result.fadeRight).toBe(false);
  });

  // =========================================================================
  // Edge tolerance (2px threshold for fade flags)
  // =========================================================================

  test("fadeLeft is false when scrollLeft is within 2px of 0", () => {
    // Image barely wider than container
    const result = computeKeyholeOffset(484, 480, null);
    // Center: (484 - 480) / 2 = 2 → within 2px tolerance
    expect(result.fadeLeft).toBe(false);
  });

  test("fadeRight is false when scrollRight is within 2px of end", () => {
    // Image 484px, container 480px, centered → scrollLeft = 2
    // scrollLeft + clientWidth = 2 + 480 = 482, imageWidth - 2 = 482
    const result = computeKeyholeOffset(484, 480, null);
    expect(result.fadeRight).toBe(false);
  });
});
