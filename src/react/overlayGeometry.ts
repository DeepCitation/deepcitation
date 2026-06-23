import type { CoordinateOrigin, ScrollAlignment } from "../drawing/evidenceGeometry.js";
import {
  computeEvidenceOriginPercent,
  computeEvidenceScrollTarget,
  isValidEvidenceGeometry,
  toEvidencePercentRect,
} from "../drawing/evidenceGeometry.js";
import type { DeepTextItem } from "../types/boxes.js";
import { safeSplit } from "../utils/regexSafety.js";

export type { CoordinateOrigin, ScrollAlignment } from "../drawing/evidenceGeometry.js";
export { START_ALIGNMENT_INSET_PX } from "../drawing/evidenceGeometry.js";

/** Count whitespace-delimited words in a string. */
export function wordCount(s: string): number {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;
  return safeSplit(trimmed, /\s+/).length;
}

/**
 * Validates that render scale and image dimensions are positive finite numbers.
 * Returns false if any value would cause division by zero or NaN propagation.
 */
export function isValidOverlayGeometry(
  renderScale: { x: number; y: number },
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): boolean {
  return isValidEvidenceGeometry(renderScale, imageNaturalWidth, imageNaturalHeight);
}

/**
 * Converts a DeepTextItem to percentage-based CSS position
 * relative to the image's natural dimensions.
 *
 * For PDF coordinates (`origin = "pdf"`, default): Y-axis is bottom-up,
 * so we flip: `imageY = imageNaturalHeight - (item.y * renderScale.y)`.
 *
 * For image coordinates (`origin = "image"`): Y-axis is already top-down,
 * so no flip: `imageY = item.y * renderScale.y`.
 *
 * All outputs are clamped to [0, 100]% to prevent overlays from bleeding
 * outside the image bounds due to rounding errors.
 */
export function toPercentRect(
  item: DeepTextItem,
  renderScale: { x: number; y: number },
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  origin: CoordinateOrigin = "pdf",
  viewBoxOriginY = 0,
): { left: string; top: string; width: string; height: string } | null {
  return toEvidencePercentRect({
    item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin: origin,
    viewBoxOriginY,
  });
}

/**
 * Computes the scroll position needed to position an annotation in a
 * scrollable container. Uses the same coordinate transform as `toPercentRect()`
 * (Y-axis flip for PDF, direct for image), then applies zoom and positions
 * according to the chosen alignment.
 *
 * Returns `null` for invalid inputs (zero dimensions, non-finite values, or
 * zero/negative zoom).
 */
export function computeAnnotationScrollTarget(
  item: DeepTextItem,
  renderScale: { x: number; y: number },
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  zoom: number,
  containerWidth: number,
  containerHeight: number,
  origin: CoordinateOrigin = "pdf",
  viewBoxOriginY = 0,
  alignX: ScrollAlignment = "center",
): { scrollLeft: number; scrollTop: number } | null {
  return computeEvidenceScrollTarget({
    item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    zoom,
    viewportWidth: containerWidth,
    viewportHeight: containerHeight,
    coordinateOrigin: origin,
    viewBoxOriginY,
    alignX,
  });
}

/**
 * Computes the annotation's center position as percentages of the image
 * dimensions. Used as CSS `transform-origin` so scale animations originate
 * from the annotation location.
 *
 * Returns `null` for invalid inputs.
 */
export function computeAnnotationOriginPercent(
  item: DeepTextItem,
  renderScale: { x: number; y: number },
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  origin: CoordinateOrigin = "pdf",
  viewBoxOriginY = 0,
): { xPercent: number; yPercent: number } | null {
  return computeEvidenceOriginPercent({
    item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin: origin,
    viewBoxOriginY,
  });
}
