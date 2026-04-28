import { EXPANDED_ZOOM_MIN } from "../constants.js";

const CANVAS_PADDING_PX = 16;

export function computeExpandedPageFittedZoom(args: {
  contentReady: boolean;
  width: number | null;
  containerWidth: number | null;
}): { readable: number; floor: number } | null {
  const { contentReady, width, containerWidth } = args;
  if (!contentReady || !width || width <= 0 || !containerWidth || containerWidth <= 0) return null;
  const pad = CANVAS_PADDING_PX * 2;
  const fitZoomW = Math.max(0.1, (containerWidth - pad) / width);
  return {
    readable: Math.min(1, fitZoomW),
    floor: Math.min(EXPANDED_ZOOM_MIN, Math.min(1, fitZoomW)),
  };
}
