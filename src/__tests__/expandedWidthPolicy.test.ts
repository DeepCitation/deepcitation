import { describe, expect, it } from "@jest/globals";
import { EXPANDED_IMAGE_SHELL_PX, POPOVER_WIDTH, POPOVER_WIDTH_MIN_PX } from "../react/constants.js";
import {
  EXPANDED_POPOVER_MID_WIDTH,
  getExpandedPopoverWidth,
  getSummaryPopoverWidth,
} from "../react/expandedWidthPolicy.js";

describe("expandedWidthPolicy", () => {
  it("returns responsive mid-width fallback when width is null", () => {
    expect(getExpandedPopoverWidth(null)).toBe(EXPANDED_POPOVER_MID_WIDTH);
  });

  it("returns responsive mid-width fallback for invalid widths", () => {
    expect(getExpandedPopoverWidth(Number.NaN)).toBe(EXPANDED_POPOVER_MID_WIDTH);
    expect(getExpandedPopoverWidth(Number.POSITIVE_INFINITY)).toBe(EXPANDED_POPOVER_MID_WIDTH);
    expect(getExpandedPopoverWidth(0)).toBe(EXPANDED_POPOVER_MID_WIDTH);
    expect(getExpandedPopoverWidth(-20)).toBe(EXPANDED_POPOVER_MID_WIDTH);
  });

  it("returns image-derived width expression for known width", () => {
    const width = 623;
    expect(getExpandedPopoverWidth(width)).toBe(
      `max(${POPOVER_WIDTH_MIN_PX}px, min(${width + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem)))`,
    );
  });

  it("rounds fractional image widths for stable CSS output", () => {
    expect(getExpandedPopoverWidth(600.6)).toBe(
      `max(${POPOVER_WIDTH_MIN_PX}px, min(${Math.round(600.6) + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem)))`,
    );
  });

  it("guarantees POPOVER_WIDTH_MIN_PX minimum even for very small image widths", () => {
    // When the image is tiny (e.g. on a narrow viewport), the max() ensures
    // the popover never shrinks below POPOVER_WIDTH_MIN_PX.
    const tinyWidth = 50;
    const result = getExpandedPopoverWidth(tinyWidth);
    expect(result).toMatch(new RegExp(`^max\\(${POPOVER_WIDTH_MIN_PX}px,`));
    expect(result).toContain(`${tinyWidth + EXPANDED_IMAGE_SHELL_PX}px`);
  });

  it("includes viewport cap for large image widths", () => {
    // Very wide images should be capped at calc(100dvw - 2rem) to prevent overflow.
    const wideWidth = 2000;
    const result = getExpandedPopoverWidth(wideWidth);
    expect(result).toContain("calc(100dvw - 2rem)");
    expect(result).toContain(`${wideWidth + EXPANDED_IMAGE_SHELL_PX}px`);
  });
});

describe("getSummaryPopoverWidth", () => {
  it("returns POPOVER_WIDTH for null/invalid keyhole width", () => {
    expect(getSummaryPopoverWidth(null)).toBe(POPOVER_WIDTH);
    expect(getSummaryPopoverWidth(0)).toBe(POPOVER_WIDTH);
    expect(getSummaryPopoverWidth(-10)).toBe(POPOVER_WIDTH);
    expect(getSummaryPopoverWidth(Number.NaN)).toBe(POPOVER_WIDTH);
  });

  it("returns clamp expression for valid keyhole width", () => {
    const result = getSummaryPopoverWidth(360);
    expect(result).toBe(`clamp(${POPOVER_WIDTH_MIN_PX}px, 392px, ${POPOVER_WIDTH})`);
  });

  it("rounds fractional keyhole widths", () => {
    const result = getSummaryPopoverWidth(100.7);
    // 101 + 32 = 133
    expect(result).toBe(`clamp(${POPOVER_WIDTH_MIN_PX}px, 133px, ${POPOVER_WIDTH})`);
  });
});
