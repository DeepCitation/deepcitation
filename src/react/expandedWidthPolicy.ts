import { EXPANDED_IMAGE_SHELL_PX, POPOVER_WIDTH, POPOVER_WIDTH_MIN_PX, SUMMARY_IMAGE_SHELL_PX } from "./constants.js";

/**
 * Mid-width fallback for expanded states when the rendered image width is not yet known.
 * Keeps the popover comfortably wider than summary mode without jumping to full viewport width.
 */
export const EXPANDED_POPOVER_MID_WIDTH = `min(calc(100dvw - 2rem), clamp(${POPOVER_WIDTH_MIN_PX}px, 62dvw, 720px))`;

/**
 * Computes the expanded popover width expression from the reported displayed image width.
 * Falls back to a responsive mid-width when width is unknown or invalid.
 */
export function getExpandedPopoverWidth(expandedImageWidth: number | null): string {
  if (expandedImageWidth === null || !Number.isFinite(expandedImageWidth) || expandedImageWidth <= 0) {
    return EXPANDED_POPOVER_MID_WIDTH;
  }

  const roundedWidth = Math.round(expandedImageWidth);
  return `max(${POPOVER_WIDTH_MIN_PX}px, min(${roundedWidth + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem)))`;
}

/**
 * Computes the summary popover width expression from the keyhole image's displayed width.
 * When the keyhole is narrow, the popover shrinks to fit (floored at POPOVER_WIDTH_MIN_PX).
 * Text-only popovers (null width) keep the full POPOVER_WIDTH default.
 */
export function getSummaryPopoverWidth(keyholeDisplayedWidth: number | null): string {
  if (keyholeDisplayedWidth === null || !Number.isFinite(keyholeDisplayedWidth) || keyholeDisplayedWidth <= 0) {
    return POPOVER_WIDTH; // 480px default for text-only
  }
  const contentWidth = Math.round(keyholeDisplayedWidth) + SUMMARY_IMAGE_SHELL_PX;
  return `clamp(${POPOVER_WIDTH_MIN_PX}px, ${contentWidth}px, ${POPOVER_WIDTH})`;
}
