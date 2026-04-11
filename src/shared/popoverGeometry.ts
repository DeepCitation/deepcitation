/**
 * Pure popover positioning functions.
 *
 * All inputs/outputs are plain numbers — no DOM, no React.
 * Testable with `bun test` without JSDOM.
 */

/**
 * Minimum space (px) required on the preferred side before flipping.
 * Accommodates the typical summary popover height.
 */
const MIN_SPACE_PX = 200;

/** Default viewport edge padding (px). */
export const GEOMETRY_VIEWPORT_MARGIN = 16;

/**
 * Determine which side (top/bottom) to lock the popover on.
 *
 * @param triggerBottom - Bottom edge of the trigger in viewport coords
 * @param triggerTop - Top edge of the trigger in viewport coords
 * @param viewportHeight - Viewport height (window.innerHeight)
 * @param preferredSide - Consumer's preferred side
 * @param threshold - Minimum space required on preferred side (default 200px)
 */
export function lockSide(
  triggerBottom: number,
  triggerTop: number,
  viewportHeight: number,
  preferredSide: "top" | "bottom",
  threshold = MIN_SPACE_PX,
): "top" | "bottom" {
  const spaceBelow = viewportHeight - triggerBottom;
  const spaceAbove = triggerTop;
  if (preferredSide === "bottom") {
    return spaceBelow >= threshold ? "bottom" : "top";
  }
  return spaceAbove >= threshold ? "top" : "bottom";
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compute horizontal align offset to center popover on trigger,
 * clamped to viewport edges.
 *
 * @param viewportWidth - Visible viewport width (clientWidth, not innerWidth)
 * @param triggerLeft - Left edge of trigger in viewport coords
 * @param triggerWidth - Width of trigger element
 * @param popoverWidth - Current or projected popover width
 * @param padding - Viewport edge padding (default 16px)
 * @returns Pixel offset from trigger's left edge
 */
export function alignOffset(
  viewportWidth: number,
  triggerLeft: number,
  triggerWidth: number,
  popoverWidth: number,
  padding = GEOMETRY_VIEWPORT_MARGIN,
): number {
  const triggerCenter = triggerLeft + triggerWidth / 2;
  const centeredLeft = triggerCenter - popoverWidth / 2;
  const minLeft = padding;
  const maxLeft = viewportWidth - padding - popoverWidth;
  const desiredLeft = maxLeft < minLeft ? minLeft : clampNum(centeredLeft, minLeft, maxLeft);
  return desiredLeft - triggerLeft;
}

/**
 * Compute vertical sideOffset for expanded-page mode.
 * Positions popover flush to viewport edge (1rem margin).
 *
 * @param side - Locked popover side
 * @param triggerTop - Top edge of trigger in viewport coords
 * @param triggerBottom - Bottom edge of trigger in viewport coords
 * @param viewportHeight - Viewport height (clientHeight)
 * @param padding - Viewport edge padding (default 16px)
 * @returns Pixel offset, or undefined if not in expanded-page mode
 */
export function expandedPageOffset(
  side: "top" | "bottom",
  triggerTop: number,
  triggerBottom: number,
  viewportHeight: number,
  padding = GEOMETRY_VIEWPORT_MARGIN,
): number {
  return side === "bottom" ? padding - triggerBottom : triggerTop - (viewportHeight - padding);
}

/**
 * Compute corrective translate to keep an element within viewport bounds.
 *
 * @param elRect - Element's current bounding rect
 * @param viewportWidth - Visible viewport width
 * @param viewportHeight - Window inner height
 * @param skipVertical - When true, only compute horizontal correction
 * @param padding - Viewport edge padding (default 16px for horizontal, 0 for vertical)
 * @returns {dx, dy} correction offsets in pixels
 */
export function guardClamp(
  elRect: { top: number; left: number; right: number; bottom: number },
  viewportWidth: number,
  viewportHeight: number,
  skipVertical = false,
  padding = GEOMETRY_VIEWPORT_MARGIN,
): { dx: number; dy: number } {
  let dx = 0;
  if (elRect.left < padding) {
    dx = padding - elRect.left;
  } else if (elRect.right > viewportWidth - padding) {
    dx = viewportWidth - padding - elRect.right;
  }

  let dy = 0;
  if (!skipVertical) {
    if (elRect.top < 0) {
      dy = -elRect.top;
    } else if (elRect.bottom > viewportHeight) {
      dy = viewportHeight - elRect.bottom;
    }
  }

  return { dx, dy };
}
