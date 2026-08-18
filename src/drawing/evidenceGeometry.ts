import type { DeepTextItem, ScreenBox } from "../types/boxes.js";
import type { GeometrySpace } from "../types/geometrySpace.js";
import { BOX_PADDING, isStrategyOverride, SPOTLIGHT_PADDING, shouldHighlightSourceMatch } from "./citationDrawing.js";

/**
 * @deprecated Prefer the `geometrySpace` tag on the verification payload, which
 * names the whole coordinate space instead of only its Y direction. Still
 * exported and honoured for payloads that predate the tag.
 */
export type CoordinateOrigin = "pdf" | "image";

/** Legacy origin fields resolved into the pair the projection math consumes. */
export interface ResolvedGeometryProjection {
  coordinateOrigin: CoordinateOrigin;
  viewBoxOriginY: number;
}

/**
 * Single decision point for "which way is up?" across every drawing surface.
 *
 * Precedence is `geometrySpace` first, legacy fields second:
 * - `"canonical-v1"` — already top-left with the viewBox offset removed at
 *   ingestion, so it takes the `"image"` (no-flip) path with `viewBoxOriginY`
 *   forced to 0, whatever the legacy fields say.
 * - `"pdf-scale1-bottom-left"` — bottom-left, so it takes the flip path.
 *   `viewBoxOriginY` still applies: the tag names the origin corner, not
 *   whether the page's viewBox offset was folded in.
 * - absent — the legacy fields decide, with today's defaults (`"pdf"`, 0). This
 *   is the fail-safe direction: an untagged payload projects byte-identically
 *   to how it projected before the tag existed.
 */
export function resolveGeometryProjection({
  geometrySpace,
  coordinateOrigin,
  viewBoxOriginY,
}: {
  geometrySpace?: GeometrySpace;
  coordinateOrigin?: CoordinateOrigin;
  viewBoxOriginY?: number;
}): ResolvedGeometryProjection {
  if (geometrySpace === "canonical-v1") {
    return { coordinateOrigin: "image", viewBoxOriginY: 0 };
  }
  if (geometrySpace === "pdf-scale1-bottom-left") {
    return { coordinateOrigin: "pdf", viewBoxOriginY: viewBoxOriginY ?? 0 };
  }
  return { coordinateOrigin: coordinateOrigin ?? "pdf", viewBoxOriginY: viewBoxOriginY ?? 0 };
}

export type ScrollAlignment = "center" | "start";

export const START_ALIGNMENT_INSET_PX = 24;
export const DEFAULT_EVIDENCE_KEYHOLE_VIEWPORT_HEIGHT_PX = 120;
export const DEFAULT_EVIDENCE_KEYHOLE_TARGET_CONTEXT_HEIGHT_PX = 32;
export const DEFAULT_EVIDENCE_KEYHOLE_MAX_ZOOM = 6;
export const DEFAULT_EVIDENCE_KEYHOLE_MIN_EDGE_GUTTER_PX = 0;
export const DEFAULT_EVIDENCE_KEYHOLE_TOP_LEFT_PADDING_PX = 12;

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EvidenceCropLayout {
  /** Full-image rendered rectangle for the source context item. */
  sourceContextRect: ImageRect;
  /** Integer crop rectangle in full-image rendered coordinates. */
  cropRect: ImageRect;
  /** Source context rectangle after translating into crop-local coordinates. */
  sourceContextDrawRect: ImageRect;
  /** Crop-local bracket rectangle, including the canonical box padding. */
  bracketRect: ImageRect;
  /** Crop-local spotlight cutout rectangle, including the canonical spotlight padding. */
  spotlightRect: ImageRect;
  /** Crop-local amber anchor highlight rectangles, one per sourceMatch item. */
  anchorHighlightRects: ImageRect[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function isValidEvidenceGeometry(
  renderScale: { x: number; y: number },
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): boolean {
  return (
    isPositiveFinite(renderScale.x) &&
    isPositiveFinite(renderScale.y) &&
    isPositiveFinite(imageNaturalWidth) &&
    isPositiveFinite(imageNaturalHeight)
  );
}

export function projectEvidenceItemToImageRect({
  item,
  renderScale,
  imageNaturalWidth,
  imageNaturalHeight,
  coordinateOrigin,
  viewBoxOriginY,
  geometrySpace,
}: {
  item: ScreenBox;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  /** @deprecated Prefer `geometrySpace`; honoured only when no tag is present. */
  coordinateOrigin?: CoordinateOrigin;
  /** @deprecated Prefer `geometrySpace`; ignored for `"canonical-v1"` payloads. */
  viewBoxOriginY?: number;
  /** Coordinate space of `item`. Wins over the legacy fields when set. */
  geometrySpace?: GeometrySpace;
}): ImageRect | null {
  if (!isValidEvidenceGeometry(renderScale, imageNaturalWidth, imageNaturalHeight)) {
    return null;
  }

  const projection = resolveGeometryProjection({ geometrySpace, coordinateOrigin, viewBoxOriginY });
  const x = item.x * renderScale.x;
  const y =
    projection.coordinateOrigin === "image"
      ? item.y * renderScale.y
      : imageNaturalHeight - (item.y - projection.viewBoxOriginY) * renderScale.y;

  return {
    x,
    y,
    width: item.width * renderScale.x,
    height: item.height * renderScale.y,
  };
}

export function toEvidencePercentRect({
  item,
  renderScale,
  imageNaturalWidth,
  imageNaturalHeight,
  coordinateOrigin,
  viewBoxOriginY,
  geometrySpace,
}: {
  item: ScreenBox;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  /** @deprecated Prefer `geometrySpace`; honoured only when no tag is present. */
  coordinateOrigin?: CoordinateOrigin;
  /** @deprecated Prefer `geometrySpace`; ignored for `"canonical-v1"` payloads. */
  viewBoxOriginY?: number;
  /** Coordinate space of `item`. Wins over the legacy fields when set. */
  geometrySpace?: GeometrySpace;
}): { left: string; top: string; width: string; height: string } | null {
  const rect = projectEvidenceItemToImageRect({
    item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin,
    viewBoxOriginY,
    geometrySpace,
  });
  if (!rect) return null;

  const x = clamp(rect.x, 0, imageNaturalWidth);
  const right = clamp(rect.x + rect.width, 0, imageNaturalWidth);
  const y = clamp(rect.y, 0, imageNaturalHeight);
  const bottom = clamp(rect.y + rect.height, 0, imageNaturalHeight);

  return {
    left: `${(x / imageNaturalWidth) * 100}%`,
    top: `${(y / imageNaturalHeight) * 100}%`,
    width: `${((right - x) / imageNaturalWidth) * 100}%`,
    height: `${((bottom - y) / imageNaturalHeight) * 100}%`,
  };
}

function expandRect(rect: ImageRect, padding: number): ImageRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function clampCropLocalRect(rect: ImageRect, cropWidth: number, cropHeight: number): ImageRect {
  const x = clamp(rect.x, 0, cropWidth);
  const y = clamp(rect.y, 0, cropHeight);
  const right = clamp(rect.x + rect.width, 0, cropWidth);
  const bottom = clamp(rect.y + rect.height, 0, cropHeight);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

export function computeEvidenceCropLayout({
  sourceContextDeepItem,
  sourceMatchDeepItems,
  renderScale,
  imageNaturalWidth,
  imageNaturalHeight,
  cropBoundsWidth = imageNaturalWidth,
  cropBoundsHeight = imageNaturalHeight,
  coordinateOrigin,
  viewBoxOriginY,
  geometrySpace,
  padding,
  boxPadding = BOX_PADDING,
  spotlightPadding = SPOTLIGHT_PADDING,
}: {
  sourceContextDeepItem: ScreenBox;
  sourceMatchDeepItems?: readonly ScreenBox[] | null;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  cropBoundsWidth?: number;
  cropBoundsHeight?: number;
  /** @deprecated Prefer `geometrySpace`; honoured only when no tag is present. */
  coordinateOrigin?: CoordinateOrigin;
  /** @deprecated Prefer `geometrySpace`; ignored for `"canonical-v1"` payloads. */
  viewBoxOriginY?: number;
  /** Coordinate space of the deep items. Wins over the legacy fields when set. */
  geometrySpace?: GeometrySpace;
  padding: number;
  boxPadding?: number;
  spotlightPadding?: number;
}): EvidenceCropLayout | null {
  if (!Number.isFinite(padding) || padding < 0) return null;
  if (!Number.isFinite(boxPadding) || boxPadding < 0) return null;
  if (!Number.isFinite(spotlightPadding) || spotlightPadding < 0) return null;
  if (!isPositiveFinite(cropBoundsWidth) || !isPositiveFinite(cropBoundsHeight)) return null;

  const sourceContextRect = projectEvidenceItemToImageRect({
    item: sourceContextDeepItem,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin,
    viewBoxOriginY,
    geometrySpace,
  });
  if (!sourceContextRect) return null;

  const cropX = Math.max(0, Math.floor(sourceContextRect.x - padding));
  const cropY = Math.max(0, Math.floor(sourceContextRect.y - padding));
  const cropRight = Math.min(cropBoundsWidth, Math.ceil(sourceContextRect.x + sourceContextRect.width + padding));
  const cropBottom = Math.min(cropBoundsHeight, Math.ceil(sourceContextRect.y + sourceContextRect.height + padding));
  const cropRect = {
    x: cropX,
    y: cropY,
    width: Math.max(1, cropRight - cropX),
    height: Math.max(1, cropBottom - cropY),
  };

  const sourceContextDrawRect = {
    x: sourceContextRect.x - cropRect.x,
    y: sourceContextRect.y - cropRect.y,
    width: sourceContextRect.width,
    height: sourceContextRect.height,
  };
  const bracketRect = expandRect(sourceContextDrawRect, boxPadding);
  const spotlightRect = clampCropLocalRect(expandRect(bracketRect, spotlightPadding), cropRect.width, cropRect.height);

  const anchorHighlightRects =
    sourceMatchDeepItems?.flatMap(item => {
      const rect = projectEvidenceItemToImageRect({
        item,
        renderScale,
        imageNaturalWidth,
        imageNaturalHeight,
        coordinateOrigin,
        viewBoxOriginY,
        geometrySpace,
      });
      if (!rect) return [];
      return [
        clampCropLocalRect(
          expandRect(
            {
              x: rect.x - cropRect.x,
              y: rect.y - cropRect.y,
              width: rect.width,
              height: rect.height,
            },
            boxPadding,
          ),
          cropRect.width,
          cropRect.height,
        ),
      ];
    }) ?? [];

  return {
    sourceContextRect,
    cropRect,
    sourceContextDrawRect,
    bracketRect,
    spotlightRect,
    anchorHighlightRects,
  };
}

export function computeEvidenceKeyholeZoom({
  imageNaturalWidth,
  imageNaturalHeight,
  viewportWidth,
  viewportHeight = DEFAULT_EVIDENCE_KEYHOLE_VIEWPORT_HEIGHT_PX,
  contextHeight,
  targetContextHeight = DEFAULT_EVIDENCE_KEYHOLE_TARGET_CONTEXT_HEIGHT_PX,
  maxZoom = DEFAULT_EVIDENCE_KEYHOLE_MAX_ZOOM,
}: {
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  viewportWidth: number;
  viewportHeight?: number;
  contextHeight: number;
  targetContextHeight?: number;
  maxZoom?: number;
}): number {
  const widthFill =
    isPositiveFinite(viewportWidth) && isPositiveFinite(imageNaturalWidth) ? viewportWidth / imageNaturalWidth : 1;
  const heightFill =
    isPositiveFinite(viewportHeight) && isPositiveFinite(imageNaturalHeight) ? viewportHeight / imageNaturalHeight : 1;
  const contextHeightFill =
    isPositiveFinite(contextHeight) && isPositiveFinite(targetContextHeight) ? targetContextHeight / contextHeight : 1;
  const resolvedMaxZoom = isPositiveFinite(maxZoom) ? maxZoom : DEFAULT_EVIDENCE_KEYHOLE_MAX_ZOOM;

  return Math.min(resolvedMaxZoom, Math.max(widthFill, heightFill, contextHeightFill));
}

export function computeEvidenceKeyholeEdgeGutter({
  viewportWidth,
  viewportHeight = DEFAULT_EVIDENCE_KEYHOLE_VIEWPORT_HEIGHT_PX,
  minGutterPx = DEFAULT_EVIDENCE_KEYHOLE_MIN_EDGE_GUTTER_PX,
}: {
  viewportWidth: number;
  viewportHeight?: number;
  minGutterPx?: number;
}): { width: number; height: number } {
  const resolvedMinGutter = isNonNegativeFinite(minGutterPx) ? minGutterPx : 0;
  return {
    width: isPositiveFinite(viewportWidth) ? Math.max(resolvedMinGutter, viewportWidth / 2) : 0,
    height: isPositiveFinite(viewportHeight) ? Math.max(resolvedMinGutter, viewportHeight / 2) : 0,
  };
}

export function selectEvidenceKeyholeFrameItem<TItem extends ScreenBox>({
  sourceContextDeepItem,
  sourceMatchDeepItems,
  renderScale,
  zoom,
  viewportWidth,
  preferFirstMatch = false,
}: {
  sourceContextDeepItem: TItem;
  sourceMatchDeepItems?: readonly TItem[] | null;
  renderScale: { x: number; y: number };
  zoom: number;
  viewportWidth: number;
  preferFirstMatch?: boolean;
}): TItem {
  const firstMatchItem = sourceMatchDeepItems?.[0];
  if (
    !firstMatchItem ||
    !isPositiveFinite(viewportWidth) ||
    !isPositiveFinite(zoom) ||
    !isPositiveFinite(renderScale.x)
  ) {
    return sourceContextDeepItem;
  }

  if (preferFirstMatch) return firstMatchItem;

  const contextDisplayedWidth = sourceContextDeepItem.width * renderScale.x * zoom;
  return contextDisplayedWidth > viewportWidth ? firstMatchItem : sourceContextDeepItem;
}

export function computeEvidenceScrollTarget({
  item,
  verticalItem,
  renderScale,
  imageNaturalWidth,
  imageNaturalHeight,
  zoom,
  viewportWidth,
  viewportHeight,
  coordinateOrigin,
  viewBoxOriginY,
  geometrySpace,
  alignX = "center",
  edgeGutterWidth = 0,
  edgeGutterHeight = 0,
  anchorTopLeft = false,
  topLeftPaddingPx = DEFAULT_EVIDENCE_KEYHOLE_TOP_LEFT_PADDING_PX,
}: {
  item: ScreenBox;
  verticalItem?: ScreenBox | null;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  /** @deprecated Prefer `geometrySpace`; honoured only when no tag is present. */
  coordinateOrigin?: CoordinateOrigin;
  /** @deprecated Prefer `geometrySpace`; ignored for `"canonical-v1"` payloads. */
  viewBoxOriginY?: number;
  /** Coordinate space of `item` / `verticalItem`. Wins over the legacy fields when set. */
  geometrySpace?: GeometrySpace;
  alignX?: ScrollAlignment;
  edgeGutterWidth?: number;
  edgeGutterHeight?: number;
  anchorTopLeft?: boolean;
  topLeftPaddingPx?: number;
}): { scrollLeft: number; scrollTop: number } | null {
  if (!isValidEvidenceGeometry(renderScale, imageNaturalWidth, imageNaturalHeight)) return null;
  if (!isPositiveFinite(zoom) || !isPositiveFinite(viewportWidth) || !isPositiveFinite(viewportHeight)) return null;
  if (!isNonNegativeFinite(edgeGutterWidth) || !isNonNegativeFinite(edgeGutterHeight)) return null;
  if (!Number.isFinite(topLeftPaddingPx)) return null;

  const horizontalRect = projectEvidenceItemToImageRect({
    item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin,
    viewBoxOriginY,
    geometrySpace,
  });
  const verticalRect = projectEvidenceItemToImageRect({
    item: verticalItem ?? item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin,
    viewBoxOriginY,
    geometrySpace,
  });
  if (!horizontalRect || !verticalRect) return null;

  const maxScrollLeft = Math.max(0, imageNaturalWidth * zoom + edgeGutterWidth - viewportWidth);
  const maxScrollTop = Math.max(0, imageNaturalHeight * zoom + edgeGutterHeight - viewportHeight);

  if (anchorTopLeft) {
    return {
      scrollLeft: clamp(horizontalRect.x * zoom - topLeftPaddingPx, 0, maxScrollLeft),
      scrollTop: clamp(verticalRect.y * zoom - topLeftPaddingPx, 0, maxScrollTop),
    };
  }

  const rawScrollLeft =
    alignX === "start"
      ? horizontalRect.x * zoom - START_ALIGNMENT_INSET_PX
      : (horizontalRect.x + horizontalRect.width / 2) * zoom - viewportWidth / 2;
  const rawScrollTop = (verticalRect.y + verticalRect.height / 2) * zoom - viewportHeight / 2;

  return {
    scrollLeft: clamp(rawScrollLeft, 0, maxScrollLeft),
    scrollTop: clamp(rawScrollTop, 0, maxScrollTop),
  };
}

export function computeEvidenceOriginPercent({
  item,
  renderScale,
  imageNaturalWidth,
  imageNaturalHeight,
  coordinateOrigin,
  viewBoxOriginY,
  geometrySpace,
}: {
  item: ScreenBox;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  /** @deprecated Prefer `geometrySpace`; honoured only when no tag is present. */
  coordinateOrigin?: CoordinateOrigin;
  /** @deprecated Prefer `geometrySpace`; ignored for `"canonical-v1"` payloads. */
  viewBoxOriginY?: number;
  /** Coordinate space of `item`. Wins over the legacy fields when set. */
  geometrySpace?: GeometrySpace;
}): { xPercent: number; yPercent: number } | null {
  const rect = projectEvidenceItemToImageRect({
    item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin,
    viewBoxOriginY,
    geometrySpace,
  });
  if (!rect) return null;

  return {
    xPercent: clamp(((rect.x + rect.width / 2) / imageNaturalWidth) * 100, 0, 100),
    yPercent: clamp(((rect.y + rect.height / 2) / imageNaturalHeight) * 100, 0, 100),
  };
}

export function selectEvidenceAnnotationScrollItem({
  sourceContextDeepItem,
  sourceMatchDeepItems,
  verifiedSourceMatch,
  verifiedSourceContext,
}: {
  sourceContextDeepItem?: DeepTextItem | null;
  sourceMatchDeepItems?: readonly DeepTextItem[] | null;
  verifiedSourceMatch?: string | null;
  verifiedSourceContext?: string | null;
}): DeepTextItem | null {
  const phraseItem = sourceContextDeepItem ?? null;
  const anchorItem = sourceMatchDeepItems?.[0] ?? null;
  if (!phraseItem) return anchorItem;
  if (!anchorItem) return phraseItem;

  const anchorHighlightActive =
    shouldHighlightSourceMatch(verifiedSourceMatch, verifiedSourceContext) ||
    (isStrategyOverride(verifiedSourceMatch, verifiedSourceContext) &&
      shouldHighlightSourceMatch(verifiedSourceMatch, phraseItem.text));

  return anchorHighlightActive ? anchorItem : phraseItem;
}

export function selectEvidenceKeyholeScrollItem({
  sourceContextDeepItem,
  sourceMatchDeepItems,
}: {
  sourceContextDeepItem?: DeepTextItem | null;
  sourceMatchDeepItems?: readonly DeepTextItem[] | null;
}): DeepTextItem | null {
  return sourceMatchDeepItems?.[0] ?? sourceContextDeepItem ?? null;
}
