import type React from "react";
import {
  ANCHOR_HIGHLIGHT_COLOR,
  BOX_PADDING,
  CITATION_LINE_BORDER_WIDTH,
  computeKeySpanHighlight,
  getBracketWidth,
  OVERLAY_COLOR,
  OVERLAY_COLOR_LIGHT,
  SPOTLIGHT_BORDER_RADIUS,
  SPOTLIGHT_PADDING,
} from "../drawing/citationDrawing.js";
import type { DeepTextItem } from "../types/boxes.js";
import {
  ERROR_COLOR_DEFAULT,
  ERROR_COLOR_VAR,
  HITBOX_EXTEND_8,
  PARTIAL_COLOR_DEFAULT,
  PARTIAL_COLOR_VAR,
  VERIFIED_COLOR_DEFAULT,
  VERIFIED_COLOR_VAR,
} from "./constants.js";
import { useTranslation } from "./i18n.js";
import { CloseIcon } from "./icons.js";
import { type CoordinateOrigin, toPercentRect } from "./overlayGeometry.js";

// Hoisted bracket color strings — all inputs are static module-level constants,
// so these never change and avoid per-render string allocations during zoom/pan.
const VERIFIED_BRACKET_COLOR = `var(${VERIFIED_COLOR_VAR}, ${VERIFIED_COLOR_DEFAULT})`;
const PARTIAL_BRACKET_COLOR = `var(${PARTIAL_COLOR_VAR}, ${PARTIAL_COLOR_DEFAULT})`;
const ERROR_BRACKET_COLOR = `var(${ERROR_COLOR_VAR}, ${ERROR_COLOR_DEFAULT})`;

const NONE: React.CSSProperties = { pointerEvents: "none" };

/** Dismiss button size in px (matches Tailwind `size-7` = 1.75rem = 28px). */
const DISMISS_BUTTON_SIZE_PX = 28;
const DISMISS_BUTTON_HALF_PX = DISMISS_BUTTON_SIZE_PX / 2;

/** An additional highlight region for partial match locations. */
export interface AdditionalHighlight {
  /** Text item with position coordinates from OCR/PDF extraction */
  deepItem: DeepTextItem;
  /** Bracket color scheme — "amber" for proximate, "muted" for distal */
  color?: "amber" | "muted";
}

/**
 * Render bracket marks for an additional (secondary) highlight.
 * No spotlight — only the primary match gets the dimming overlay.
 */
function SecondaryBrackets({
  deepItem,
  renderScale,
  imageNaturalWidth,
  imageNaturalHeight,
  color = "amber",
  coordinateOrigin,
}: {
  deepItem: DeepTextItem;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  color?: "amber" | "muted";
  coordinateOrigin?: CoordinateOrigin;
}) {
  const rect = toPercentRect(deepItem, renderScale, imageNaturalWidth, imageNaturalHeight, coordinateOrigin);
  if (!rect) return null;

  // amber → partial-match color; muted → verified color at lower opacity (distal supporting evidence)
  const bracketColor = color === "muted" ? VERIFIED_BRACKET_COLOR : PARTIAL_BRACKET_COLOR;
  const opacity = color === "muted" ? 0.35 : 0.5;

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

  const heightPx = deepItem.height * renderScale.y;
  const bracketW = getBracketWidth(heightPx);

  return (
    <>
      {/* Left bracket [ */}
      <div
        data-dc-secondary-bracket-left=""
        style={{
          position: "absolute",
          ...bracketRect,
          width: `${bracketW}px`,
          borderLeft: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          borderTop: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          borderBottom: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          opacity,
          ...NONE,
        }}
      />
      {/* Right bracket ] */}
      <div
        data-dc-secondary-bracket-right=""
        style={{
          position: "absolute",
          top: bracketRect.top,
          left: `calc(${bracketRect.left} + ${bracketRect.width} - ${bracketW}px)`,
          width: `${bracketW}px`,
          height: bracketRect.height,
          borderRight: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          borderTop: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          borderBottom: `${CITATION_LINE_BORDER_WIDTH}px solid ${bracketColor}`,
          opacity,
          ...NONE,
        }}
      />
    </>
  );
}

/**
 * CSS-based citation annotation overlay for the full-page proof viewer.
 * Renders a spotlight (dim everything except the match region), bracket marks,
 * and an optional anchor-text highlight — matching the backend-drawn annotations.
 *
 * Supports optional additional highlights for partial match locations.
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
  additionalHighlights,
  onDismiss,
  isDark,
  coordinateOrigin,
}: {
  phraseMatchDeepItem: DeepTextItem;
  renderScale: { x: number; y: number };
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  highlightColor?: string | null;
  anchorTextDeepItem?: DeepTextItem | null;
  anchorText?: string | null;
  fullPhrase?: string | null;
  /** Additional bracket pairs for partial match locations (no spotlight). */
  additionalHighlights?: AdditionalHighlight[];
  /** When provided, renders a dismiss button at the spotlight top-right corner. */
  onDismiss?: () => void;
  /** When true, uses a light overlay for dark page content. */
  isDark?: boolean;
  /** Coordinate origin convention for DeepTextItem positions. Defaults to "pdf". */
  coordinateOrigin?: CoordinateOrigin;
}) {
  const t = useTranslation();

  const rect = toPercentRect(phraseMatchDeepItem, renderScale, imageNaturalWidth, imageNaturalHeight, coordinateOrigin);
  // Bail out if geometry is invalid (zero dimensions, NaN, Infinity, etc.)
  if (!rect) return null;

  // All bracket colors resolve through --dc-* tokens so a host override to any
  // one token automatically keeps brackets, status indicators, and quote borders in sync.
  const bracketColor =
    highlightColor === "amber"
      ? PARTIAL_BRACKET_COLOR
      : highlightColor === "red"
        ? ERROR_BRACKET_COLOR
        : VERIFIED_BRACKET_COLOR;

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
    borderRadius: `${SPOTLIGHT_BORDER_RADIUS}px`,
  };

  const anchorRect =
    showKeySpanHighlight && anchorTextDeepItem
      ? toPercentRect(anchorTextDeepItem, renderScale, imageNaturalWidth, imageNaturalHeight, coordinateOrigin)
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
          boxShadow: `0 0 0 9999px ${isDark ? OVERLAY_COLOR_LIGHT : OVERLAY_COLOR}`,
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

      {/* Additional highlights for partial match locations */}
      {additionalHighlights?.map(h => (
        <SecondaryBrackets
          key={`additional-${h.deepItem.x}-${h.deepItem.y}-${h.color ?? "amber"}`}
          deepItem={h.deepItem}
          renderScale={renderScale}
          imageNaturalWidth={imageNaturalWidth}
          imageNaturalHeight={imageNaturalHeight}
          color={h.color}
          coordinateOrigin={coordinateOrigin}
        />
      ))}

      {/* Dismiss button — straddles the top-right corner of the spotlight cutout */}
      {onDismiss && (
        <button
          type="button"
          tabIndex={0}
          data-dc-overlay-dismiss=""
          onClick={e => {
            e.stopPropagation();
            onDismiss();
          }}
          style={{
            position: "absolute",
            top: `max(0px, calc(${spotlightRect.top} - ${DISMISS_BUTTON_HALF_PX}px))`,
            left: `min(calc(100% - ${DISMISS_BUTTON_SIZE_PX}px), calc(${spotlightRect.left} + ${spotlightRect.width} - ${DISMISS_BUTTON_HALF_PX}px))`,
            pointerEvents: "auto",
          }}
          className={`size-7 flex items-center justify-center rounded-full backdrop-blur-sm transition-colors shadow-md cursor-pointer ${isDark ? "bg-white/50 text-black/90 hover:bg-white/70 active:bg-white/80" : "bg-black/50 text-white/90 hover:bg-black/70 active:bg-black/80"} ${HITBOX_EXTEND_8}`}
          aria-label={t("aria.hideOverlay")}
        >
          <span className="size-4.5 flex items-center justify-center">
            <CloseIcon />
          </span>
        </button>
      )}
    </div>
  );
}
