import type React from "react";
import type { DeepTextItem } from "../types/boxes.js";
import {
  ANCHOR_HIGHLIGHT_COLOR,
  CITATION_BRACKET_AMBER,
  CITATION_BRACKET_BLUE,
  CITATION_BRACKET_BORDER_WIDTH,
  getCitationBracketWidth,
  MIN_WORD_DIFFERENCE,
  SPOTLIGHT_OVERLAY_COLOR,
} from "./constants.js";

/** Count whitespace-delimited words in a string. */
function wordCount(s: string): number {
  const trimmed = s.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Converts a DeepTextItem (PDF coords) to percentage-based CSS position
 * relative to the image's natural dimensions.
 *
 * PDF y-axis is bottom-up; image y-axis is top-down, so we flip:
 *   imageY = imageNaturalHeight − (item.y × renderScale.y)
 */
function toPercentRect(
  item: DeepTextItem,
  renderScale: { x: number; y: number },
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): { left: string; top: string; width: string; height: string } {
  const imgX = item.x * renderScale.x;
  const imgY = imageNaturalHeight - item.y * renderScale.y;
  const imgW = item.width * renderScale.x;
  const imgH = item.height * renderScale.y;
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
      {showAnchor && (
        <div
          style={{
            position: "absolute",
            ...toPercentRect(anchorTextDeepItem, renderScale, imageNaturalWidth, imageNaturalHeight),
            backgroundColor: ANCHOR_HIGHLIGHT_COLOR,
            ...NONE,
          }}
        />
      )}
    </div>
  );
}
