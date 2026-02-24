import type React from "react";
import {
  ANCHOR_HIGHLIGHT_COLOR,
  BOX_PADDING,
  CITATION_LINE_BORDER_WIDTH,
  computeKeySpanHighlight,
  getBracketColor,
  getBracketWidth,
  OVERLAY_COLOR,
  SPOTLIGHT_PADDING,
} from "../drawing/citationDrawing.js";
import type { DeepTextItem } from "../types/boxes.js";
import { toPercentRect } from "./overlayGeometry.js";

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

  const bracketColor = getBracketColor((highlightColor as "blue" | "amber") ?? "blue");

  // Compute pixel height for bracket width calculation
  const heightPx = phraseMatchDeepItem.height * renderScale.y;
  const bracketW = getBracketWidth(heightPx);

  // Determine if anchor text highlight should be shown (uses canonical logic from drawing module)
  const { showKeySpanHighlight } = computeKeySpanHighlight(
    phraseMatchDeepItem,
    anchorTextDeepItem ? [anchorTextDeepItem] : undefined,
    anchorText,
    fullPhrase,
  );

  // Two padding levels matching the backend rendering:
  // 1. Bracket rect: text bbox + BOX_PADDING (2px) — small offset from text
  // 2. Spotlight rect: bracket rect + SPOTLIGHT_PADDING (24px) — creates the
  //    visible white gap between brackets and the dark overlay edge.
  //    Backend equivalent: VERIFICATION_IMAGE_PADDING_EXTRA (30px canvas space).
  const baseLeft = parseFloat(rect.left);
  const baseTop = parseFloat(rect.top);
  const baseWidth = parseFloat(rect.width);
  const baseHeight = parseFloat(rect.height);

  const bracketPadX = (BOX_PADDING / imageNaturalWidth) * 100;
  const bracketPadY = (BOX_PADDING / imageNaturalHeight) * 100;
  const bracketRect = {
    left: `${baseLeft - bracketPadX}%`,
    top: `${baseTop - bracketPadY}%`,
    width: `${baseWidth + 2 * bracketPadX}%`,
    height: `${baseHeight + 2 * bracketPadY}%`,
  };

  const spotlightPad = BOX_PADDING + SPOTLIGHT_PADDING;
  const spotPadX = (spotlightPad / imageNaturalWidth) * 100;
  const spotPadY = (spotlightPad / imageNaturalHeight) * 100;
  const spotlightRect = {
    left: `${baseLeft - spotPadX}%`,
    top: `${baseTop - spotPadY}%`,
    width: `${baseWidth + 2 * spotPadX}%`,
    height: `${baseHeight + 2 * spotPadY}%`,
  };

  const anchorRect =
    showKeySpanHighlight && anchorTextDeepItem
      ? toPercentRect(anchorTextDeepItem, renderScale, imageNaturalWidth, imageNaturalHeight)
      : null;

  return (
    <div
      data-dc-annotation-overlay=""
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        ...NONE,
      }}
    >
      {/* Spotlight: transparent cutout with massive box-shadow covering the rest */}
      <div
        data-dc-spotlight=""
        style={{
          position: "absolute",
          ...spotlightRect,
          boxShadow: `0 0 0 9999px ${OVERLAY_COLOR}`,
          ...NONE,
        }}
      />

      {/* Left bracket [ */}
      <div
        data-dc-bracket-left=""
        style={{
          position: "absolute",
          ...bracketRect,
          width: `${bracketW}px`,
          borderLeft: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          borderTop: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          borderBottom: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          ...NONE,
        }}
      />

      {/* Right bracket ] — positioned at the right edge of the bracket box */}
      <div
        data-dc-bracket-right=""
        style={{
          position: "absolute",
          top: bracketRect.top,
          left: `calc(${bracketRect.left} + ${bracketRect.width} - ${bracketW}px)`,
          width: `${bracketW}px`,
          height: bracketRect.height,
          borderRight: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          borderTop: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          borderBottom: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          ...NONE,
        }}
      />

      {/* Anchor text highlight (amber background) */}
      {anchorRect && (
        <div
          data-dc-anchor-highlight=""
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
