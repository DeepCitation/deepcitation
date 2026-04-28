import { EXPANDED_PAGE_CANVAS_PADDING_PX, EXPANDED_ZOOM_MIN } from "../constants.js";

export function computeExpandedPageFittedZoom(args: {
  contentReady: boolean;
  width: number | null;
  containerWidth: number | null;
}): { readable: number; floor: number } | null {
  const { contentReady, width, containerWidth } = args;
  if (!contentReady || !width || width <= 0 || !containerWidth || containerWidth <= 0) return null;
  const pad = EXPANDED_PAGE_CANVAS_PADDING_PX * 2;
  // `readable` intentionally omits the EXPANDED_MIN_READABLE_ZOOM (0.5) floor:
  // when fitZoomW < EXPANDED_MIN_READABLE_ZOOM, the page is wider than the container
  // at that zoom level — clamping up to 0.5 would force horizontal clipping on first
  // open. Fit-to-width takes priority so the full page is visible without scrolling.
  // For pages that fit at ≥ 0.5 zoom, fitZoomW already satisfies the floor naturally.
  const fitZoomW = Math.max(0.1, (containerWidth - pad) / width);
  return {
    readable: Math.min(1, fitZoomW),
    floor: Math.min(EXPANDED_ZOOM_MIN, Math.min(1, fitZoomW)),
  };
}
