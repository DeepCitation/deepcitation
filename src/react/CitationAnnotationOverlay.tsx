import type React from "react";
import type { DeepTextItem } from "../types/boxes.js";
import { safeSplit } from "../utils/regexSafety.js";
import {
  ANCHOR_HIGHLIGHT_COLOR,
  CITATION_BRACKET_AMBER,
  CITATION_BRACKET_BLUE,
  CITATION_BRACKET_BORDER_WIDTH,
  getCitationBracketWidth,
  MIN_WORD_DIFFERENCE,
  SPOTLIGHT_OVERLAY_COLOR,
} from "./constants.js";

/** @internal Exported for testing. Count whitespace-delimited words in a string. */
export function wordCount(s: string): number {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;
  return safeSplit(trimmed, /\s+/).length;
}

/** Clamp a number to the range [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * @internal Exported for testing.
 * Validates that render scale and image dimensions are positive finite numbers.
 * Returns false if any value would cause division by zero or NaN propagation.
 */
export function isValidOverlayGeometry(
  renderScale: { x: number; y: number },
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): boolean {
  return (
    Number.isFinite(renderScale.x) &&
    Number.isFinite(renderScale.y) &&
    renderScale.x > 0 &&
    renderScale.y > 0 &&
    Number.isFinite(imageNaturalWidth) &&
    Number.isFinite(imageNaturalHeight) &&
    imageNaturalWidth > 0 &&
    imageNaturalHeight > 0
  );
}

/**
 * Converts a DeepTextItem (PDF coords) to percentage-based CSS position
 * relative to the image's natural dimensions.
 *
 * PDF y-axis is bottom-up; image y-axis is top-down, so we flip:
 *   imageY = imageNaturalHeight − (item.y × renderScale.y)
 *
 * All outputs are clamped to [0, 100]% to prevent overlays from bleeding
 * outside the image bounds due to rounding errors in PDF coordinates.
 *
 * @internal Exported for testing.
 */
export function toPercentRect(
  item: DeepTextItem,
  renderScale: { x: number; y: number },
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): { left: string; top: string; width: string; height: string } | null {
  if (!isValidOverlayGeometry(renderScale, imageNaturalWidth, imageNaturalHeight)) {
    return null;
  }

  // Clamp edges independently so negative PDF coords don't shift the origin
  // while leaving the far edge unbounded.
  const rawX = item.x * renderScale.x;
  const rawY = imageNaturalHeight - item.y * renderScale.y;
  const rawW = item.width * renderScale.x;
  const rawH = item.height * renderScale.y;

  const imgX = clamp(rawX, 0, imageNaturalWidth);
  const imgRight = clamp(rawX + rawW, 0, imageNaturalWidth);
  const imgY = clamp(rawY, 0, imageNaturalHeight);
  const imgBottom = clamp(rawY + rawH, 0, imageNaturalHeight);

  const imgW = imgRight - imgX;
  const imgH = imgBottom - imgY;

  return {
    left: `${(imgX / imageNaturalWidth) * 100}%`,
    top: `${(imgY / imageNaturalHeight) * 100}%`,
    width: `${(imgW / imageNaturalWidth) * 100}%`,
    height: `${(imgH / imageNaturalHeight) * 100}%`,
  };
}

const NONE: React.CSSProperties = { pointerEvents: "none" };

/**
 * CSS-based citation annotation overlay for the full-page proof viewer.
 * Renders a spotlight (dim everything except the match region), bracket marks,
 * and an optional anchor-text highlight — matching the backend-drawn annotations.
 */
export function CitationAnnotationOverlay({
  phraseMatchDeepItem,
  renderScale,
  imageNaturalWidth,
  imageNaturalHeight,
  highlightColor,
  anchorTextDeepItem,
  anchorText,
  fullPhrase,
}: {
  phraseMatchDeepItem: DeepTextItem;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  highlightColor?: string | null;
  anchorTextDeepItem?: DeepTextItem | null;
  anchorText?: string | null;
  fullPhrase?: string | null;
}) {
  const rect = toPercentRect(phraseMatchDeepItem, renderScale, imageNaturalWidth, imageNaturalHeight);
  // Bail out if geometry is invalid (zero dimensions, NaN, Infinity, etc.)
  if (!rect) return null;

  const bracketColor = highlightColor === "amber" ? CITATION_BRACKET_AMBER : CITATION_BRACKET_BLUE;

  // Compute pixel height for bracket width calculation
  const heightPx = phraseMatchDeepItem.height * renderScale.y;
  const bracketW = getCitationBracketWidth(heightPx);

  // Determine if anchor text highlight should be shown
  const showAnchor =
    anchorTextDeepItem &&
    anchorText &&
    fullPhrase &&
    anchorTextDeepItem.text?.toLowerCase() !== phraseMatchDeepItem.text?.toLowerCase() &&
    wordCount(fullPhrase) - wordCount(anchorText) >= MIN_WORD_DIFFERENCE;

  const anchorRect = showAnchor
    ? toPercentRect(anchorTextDeepItem, renderScale, imageNaturalWidth, imageNaturalHeight)
    : null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        ...NONE,
      }}
    >
      {/* Spotlight: transparent cutout with massive box-shadow covering the rest */}
      <div
        style={{
          position: "absolute",
          ...rect,
          boxShadow: `0 0 0 9999px ${SPOTLIGHT_OVERLAY_COLOR}`,
          ...NONE,
        }}
      />

      {/* Left bracket [ */}
      <div
        style={{
          position: "absolute",
          ...rect,
          width: `${bracketW}px`,
          borderLeft: `${CITATION_BRACKET_BORDER_WIDTH}px solid ${bracketColor}`,
          borderTop: `${CITATION_BRACKET_BORDER_WIDTH}px solid ${bracketColor}`,
          borderBottom: `${CITATION_BRACKET_BORDER_WIDTH}px solid ${bracketColor}`,
          ...NONE,
        }}
      />

      {/* Right bracket ] — positioned at the right edge of the phrase box */}
      <div
        style={{
          position: "absolute",
          top: rect.top,
          left: `calc(${rect.left} + ${rect.width} - ${bracketW}px)`,
          width: `${bracketW}px`,
          height: rect.height,
          borderRight: `${CITATION_BRACKET_BORDER_WIDTH}px solid ${bracketColor}`,
          borderTop: `${CITATION_BRACKET_BORDER_WIDTH}px solid ${bracketColor}`,
          borderBottom: `${CITATION_BRACKET_BORDER_WIDTH}px solid ${bracketColor}`,
          ...NONE,
        }}
      />

      {/* Anchor text highlight (amber background) */}
      {anchorRect && (
        <div
          style={{
            position: "absolute",
            ...anchorRect,
            backgroundColor: ANCHOR_HIGHLIGHT_COLOR,
            ...NONE,
          }}
        />
      )}
    </div>
  );
}
