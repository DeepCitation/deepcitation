import { EXPANDED_ZOOM_MIN } from "../constants.js";

// Same value as CANVAS_PADDING_PX in ExpandedPageViewport.tsx — intentionally kept
// separate because this file computes zoom ratios (page fits inside the container)
// while the viewport file uses it for canvas layout. They can diverge independently.
const CANVAS_PADDING_PX = 16;

export function computeExpandedPageFittedZoom(args: {
  contentReady: boolean;
  width: number | null;
  containerWidth: number | null;
}): { readable: number; floor: number } | null {
  const { contentReady, width, containerWidth } = args;
  if (!contentReady || !width || width <= 0 || !containerWidth || containerWidth <= 0) return null;
  const pad = CANVAS_PADDING_PX * 2;
  // fitZoomW can go below EXPANDED_MIN_READABLE_ZOOM intentionally: when the
  // container is narrower than the page, we allow a sub-0.5 fitted zoom so the
  // page fills rather than overflows. The user can zoom in manually after.
  const fitZoomW = Math.max(0.1, (containerWidth - pad) / width);
  return {
    readable: Math.min(1, fitZoomW),
    floor: Math.min(EXPANDED_ZOOM_MIN, Math.min(1, fitZoomW)),
  };
}
