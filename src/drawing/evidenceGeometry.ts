import type { DeepTextItem, ScreenBox } from "../types/boxes.js";
import { isStrategyOverride, shouldHighlightSourceMatch } from "./citationDrawing.js";

export type CoordinateOrigin = "pdf" | "image";

export type ScrollAlignment = "center" | "start";

export const START_ALIGNMENT_INSET_PX = 24;

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
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
  coordinateOrigin = "pdf",
  viewBoxOriginY = 0,
}: {
  item: ScreenBox;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  coordinateOrigin?: CoordinateOrigin;
  viewBoxOriginY?: number;
}): ImageRect | null {
  if (!isValidEvidenceGeometry(renderScale, imageNaturalWidth, imageNaturalHeight)) {
    return null;
  }

  const x = item.x * renderScale.x;
  const y =
    coordinateOrigin === "image"
      ? item.y * renderScale.y
      : imageNaturalHeight - (item.y - viewBoxOriginY) * renderScale.y;

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
  coordinateOrigin = "pdf",
  viewBoxOriginY = 0,
}: {
  item: ScreenBox;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  coordinateOrigin?: CoordinateOrigin;
  viewBoxOriginY?: number;
}): { left: string; top: string; width: string; height: string } | null {
  const rect = projectEvidenceItemToImageRect({
    item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin,
    viewBoxOriginY,
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

export function computeEvidenceScrollTarget({
  item,
  verticalItem,
  renderScale,
  imageNaturalWidth,
  imageNaturalHeight,
  zoom,
  viewportWidth,
  viewportHeight,
  coordinateOrigin = "pdf",
  viewBoxOriginY = 0,
  alignX = "center",
  edgeGutterWidth = 0,
  edgeGutterHeight = 0,
  anchorTopLeft = false,
  topLeftPaddingPx = 0,
}: {
  item: ScreenBox;
  verticalItem?: ScreenBox | null;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  coordinateOrigin?: CoordinateOrigin;
  viewBoxOriginY?: number;
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
  });
  const verticalRect = projectEvidenceItemToImageRect({
    item: verticalItem ?? item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin,
    viewBoxOriginY,
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
  coordinateOrigin = "pdf",
  viewBoxOriginY = 0,
}: {
  item: ScreenBox;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  coordinateOrigin?: CoordinateOrigin;
  viewBoxOriginY?: number;
}): { xPercent: number; yPercent: number } | null {
  const rect = projectEvidenceItemToImageRect({
    item,
    renderScale,
    imageNaturalWidth,
    imageNaturalHeight,
    coordinateOrigin,
    viewBoxOriginY,
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
