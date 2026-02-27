import { describe, expect, it } from "@jest/globals";
import { EXPANDED_IMAGE_SHELL_PX, POPOVER_WIDTH } from "../react/constants.js";
import { EXPANDED_POPOVER_MID_WIDTH, getExpandedPopoverWidth } from "../react/expandedWidthPolicy.js";

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
      `max(${POPOVER_WIDTH}, min(${width + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem)))`,
    );
  });

  it("rounds fractional image widths for stable CSS output", () => {
    expect(getExpandedPopoverWidth(600.6)).toBe(
      `max(${POPOVER_WIDTH}, min(${Math.round(600.6) + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem)))`,
    );
  });

  it("guarantees POPOVER_WIDTH minimum even for very small image widths", () => {
    // When the image is tiny (e.g. on a narrow viewport), the max() ensures
    // the popover never shrinks below POPOVER_WIDTH.
    const tinyWidth = 50;
    const result = getExpandedPopoverWidth(tinyWidth);
    expect(result).toMatch(new RegExp(`^max\\(${POPOVER_WIDTH.replace("(", "\\(").replace(")", "\\)")},`));
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
