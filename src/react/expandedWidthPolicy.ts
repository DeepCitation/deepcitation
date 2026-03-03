import {
  EXPANDED_IMAGE_SHELL_PX,
  POPOVER_WIDTH,
  POPOVER_WIDTH_DEFAULT_PX,
  POPOVER_WIDTH_MIN_PX,
  SUMMARY_IMAGE_SHELL_PX,
  VIEWPORT_MARGIN_PX,
} from "./constants.js";

/**
 * Mid-width fallback for expanded states when the rendered image width is not yet known.
 * Keeps the popover comfortably wider than summary mode without jumping to full viewport width.
 */
export const EXPANDED_POPOVER_MID_WIDTH = `min(calc(100dvw - 2rem), clamp(${POPOVER_WIDTH_MIN_PX}px, 62dvw, 720px))`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getMaxUsableWidthPx(viewportWidth: number): number {
  return Math.max(0, viewportWidth - 2 * VIEWPORT_MARGIN_PX);
}

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
 * Predicts the expanded popover width in pixels for positioning decisions.
 * Mirrors the CSS width policy used by getExpandedPopoverWidth().
 */
export function getExpandedPopoverWidthPx(expandedImageWidth: number | null, viewportWidth: number): number {
  const maxUsableWidth = getMaxUsableWidthPx(viewportWidth);
  if (maxUsableWidth <= 0) return 0;
  if (maxUsableWidth <= POPOVER_WIDTH_MIN_PX) return maxUsableWidth;

  if (expandedImageWidth === null || !Number.isFinite(expandedImageWidth) || expandedImageWidth <= 0) {
    // mid width fallback: min(maxUsableWidth, clamp(320, 62vw, 720))
    const midWidth = clamp(0.62 * viewportWidth, POPOVER_WIDTH_MIN_PX, 720);
    return Math.min(maxUsableWidth, midWidth);
  }

  const contentWidth = Math.round(expandedImageWidth) + EXPANDED_IMAGE_SHELL_PX;
  // max(320, min(contentWidth, maxUsableWidth))
  return Math.max(POPOVER_WIDTH_MIN_PX, Math.min(contentWidth, maxUsableWidth));
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

/**
 * Predicts summary popover width in pixels for positioning decisions.
 * Uses the same intent as getSummaryPopoverWidth() without needing measured DOM.
 */
export function getSummaryPopoverWidthPx(keyholeDisplayedWidth: number | null, viewportWidth: number): number {
  const maxUsableWidth = getMaxUsableWidthPx(viewportWidth);
  if (maxUsableWidth <= 0) return 0;
  if (maxUsableWidth <= POPOVER_WIDTH_MIN_PX) return maxUsableWidth;

  if (keyholeDisplayedWidth === null || !Number.isFinite(keyholeDisplayedWidth) || keyholeDisplayedWidth <= 0) {
    return Math.min(maxUsableWidth, POPOVER_WIDTH_DEFAULT_PX);
  }

  const contentWidth = Math.round(keyholeDisplayedWidth) + SUMMARY_IMAGE_SHELL_PX;
  return clamp(contentWidth, POPOVER_WIDTH_MIN_PX, Math.min(POPOVER_WIDTH_DEFAULT_PX, maxUsableWidth));
}
