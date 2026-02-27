import { EXPANDED_IMAGE_SHELL_PX, POPOVER_WIDTH } from "./constants.js";

/**
 * Mid-width fallback for expanded states when the rendered image width is not yet known.
 * Keeps the popover comfortably wider than summary mode without jumping to full viewport width.
 */
export const EXPANDED_POPOVER_MID_WIDTH = `min(calc(100dvw - 2rem), clamp(${POPOVER_WIDTH}, 62dvw, 720px))`;

/**
 * Computes the expanded popover width expression from the reported displayed image width.
 * Falls back to a responsive mid-width when width is unknown or invalid.
 */
export function getExpandedPopoverWidth(expandedImageWidth: number | null): string {
  if (expandedImageWidth === null || !Number.isFinite(expandedImageWidth) || expandedImageWidth <= 0) {
    return EXPANDED_POPOVER_MID_WIDTH;
  }

  const roundedWidth = Math.round(expandedImageWidth);
  return `max(${POPOVER_WIDTH}, min(${roundedWidth + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem)))`;
}
