/**
 * Shared CSS design tokens and layout constants for DeepCitation React components.
 *
 * Security utilities have moved to `proofImageSecurity.ts`.
 * Keyhole geometry constants/helpers have moved to `keyholeGeometry.ts`.
 * Animation/transition timing constants have moved to `animationConstants.ts`.
 *
 * @packageDocumentation
 */

import type React from "react";
import { ANCHOR_HIGHLIGHT_COLOR } from "../drawing/citationDrawing.js";

export {
  ANIM_FAST_MS,
  ANIM_INSTANT_MS,
  ANIM_MEASURED_MS,
  ANIM_SLOW_MS,
  ANIM_STANDARD_MS,
  BLINK_ENTER_EASING,
  BLINK_ENTER_OPACITY_A,
  BLINK_ENTER_OPACITY_B,
  BLINK_ENTER_SCALE_A,
  BLINK_ENTER_SCALE_B,
  BLINK_ENTER_STEP_MS,
  BLINK_ENTER_TOTAL_MS,
  BLINK_ENTER_Y_A_PX,
  BLINK_ENTER_Y_B_PX,
  BLINK_EXIT_EASING,
  BLINK_EXIT_OPACITY,
  BLINK_EXIT_SCALE,
  BLINK_EXIT_TOTAL_MS,
  BLINK_EXIT_Y_PX,
  BLINK_ROW_ENTER_STEP_MS,
  BLINK_ROW_ENTER_TOTAL_MS,
  BLINK_ROW_EXIT_OPACITY,
  BLINK_ROW_EXIT_TOTAL_MS,
  BLINK_ROW_FAST_ENTER_STEP_MS,
  BLINK_ROW_FAST_ENTER_TOTAL_MS,
  BLINK_ROW_FAST_EXIT_TOTAL_MS,
  BLINK_ROW_INSET_A_PX,
  BLINK_ROW_INSET_B_PX,
  BLINK_ROW_OPACITY_A,
  BLINK_ROW_OPACITY_B,
  CONTENT_STAGGER_DELAY_MS,
  COPY_FEEDBACK_DURATION_MS,
  DRAWER_DRAG_CLOSE_THRESHOLD_PX,
  DRAWER_STAGGER_DELAY_MS,
  DRAWER_STAGGER_MAX_MS,
  EASE_COLLAPSE,
  EASE_CONTENT_REVEAL,
  EASE_EXPAND,
  EASE_GHOST_EXPAND,
  EVIDENCE_LIST_COLLAPSE_TOTAL_MS,
  EVIDENCE_LIST_EXPAND_STEP_MS,
  EVIDENCE_LIST_EXPAND_TOTAL_MS,
  GHOST_BLUR_EARLY_PX,
  GHOST_BLUR_LATE_PX,
  GHOST_BLUR_MID_PX,
  GHOST_BLUR_PEAK_PX,
  GHOST_BLUR_START_PX,
  GHOST_OFFSET_EARLY,
  GHOST_OFFSET_LATE,
  GHOST_OFFSET_MID,
  GHOST_OFFSET_PEAK,
  GHOST_OPACITY_EARLY,
  GHOST_OPACITY_LATE,
  GHOST_OPACITY_MID,
  GHOST_OPACITY_PEAK,
  GHOST_OPACITY_START,
  LOCATE_ICON_PULSE_COLOR,
  LOCATE_ICON_PULSE_GROW_MS,
  LOCATE_ICON_PULSE_SCALE,
  LOCATE_ICON_PULSE_SETTLE_MS,
  PAGE_COLLAPSE_GHOST_MS,
  PAGE_EXPAND_CONTENT_OPACITY_FLOOR,
  POPOVER_MORPH_COLLAPSE_MS,
  POPOVER_MORPH_EXPAND_MS,
  SPINNER_TIMEOUT_MS,
  TAP_SLOP_PX,
  TOOLTIP_HIDE_DELAY_MS,
  TOUCH_CLICK_DEBOUNCE_MS,
  VT_EVIDENCE_COLLAPSE_MS,
  VT_EVIDENCE_DIP_OPACITY,
  VT_EVIDENCE_EXPAND_MS,
  VT_EVIDENCE_PAGE_EXPAND_MS,
  WHEEL_ZOOM_SENSITIVITY,
} from "./animationConstants.js";

export {
  buildKeyholeMaskImage,
  DEBUG_PAGE_EXPAND_SOURCE_COLOR,
  DEBUG_PAGE_EXPAND_TARGET_COLOR,
  EXPANDED_MIN_READABLE_ZOOM,
  EXPANDED_PAGE_CANVAS_PADDING_PX,
  EXPANDED_ZOOM_MAX,
  EXPANDED_ZOOM_MIN,
  EXPANDED_ZOOM_STEP,
  KEYHOLE_ANCHOR_FILL_TARGET,
  KEYHOLE_FADE_WIDTH,
  KEYHOLE_SKIP_THRESHOLD,
  KEYHOLE_STRIP_BORDER_RADIUS,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  KEYHOLE_STRIP_HEIGHT_VAR,
  KEYHOLE_WIDTH_FIT_THRESHOLD,
  MIN_PAN_OVERFLOW_PX,
  projectKeyholeDisplayedWidth,
} from "./keyholeGeometry.js";
// Re-export relocated symbols so existing `from "./constants.js"` importers
// continue to work without changes.
export {
  isValidProofImageSrc,
  SAFE_DATA_IMAGE_PREFIXES,
  TRUSTED_IMAGE_HOSTS,
} from "./proofImageSecurity.js";

/**
 * CSS custom property name for the wavy underline color.
 * Can be overridden via CSS: `--dc-wavy-underline-color: #your-color;`
 * Defaults to red-500 (#ef4444) if not set.
 */
export const WAVY_UNDERLINE_COLOR_VAR = "--dc-wavy-underline-color";

/**
 * Default color for wavy underline (Tailwind red-500).
 * Used as fallback when CSS custom property is not set.
 */
export const WAVY_UNDERLINE_DEFAULT_COLOR = "#ef4444";

/**
 * Style for wavy underline in miss/not-found/error state.
 * Uses wavy text decoration (like spell-checker) instead of strikethrough
 * to indicate "this has a problem" rather than "this was deleted".
 *
 * The color can be customized via CSS custom property:
 * ```css
 * :root {
 *   --dc-wavy-underline-color: #dc2626; // red-600
 * }
 * ```
 *
 * @example
 * ```tsx
 * <span style={isMiss ? MISS_WAVY_UNDERLINE_STYLE : undefined}>
 *   Citation text
 * </span>
 * ```
 */
export const MISS_WAVY_UNDERLINE_STYLE: React.CSSProperties = {
  textDecoration: "underline",
  textDecorationStyle: "wavy",
  textDecorationColor: `var(${WAVY_UNDERLINE_COLOR_VAR}, ${WAVY_UNDERLINE_DEFAULT_COLOR})`,
  textUnderlineOffset: "2px",
};

// =============================================================================
// Status Color CSS Custom Properties
// =============================================================================

/**
 * CSS custom property name for verified/success indicator color.
 * Override via `--dc-verified` on `:root` or `.dark`, or use `<DeepCitationTheme>`.
 */
export const VERIFIED_COLOR_VAR = "--dc-verified";
/** Default verified indicator color (emerald-500, BRANDING.md VERIFIED) */
export const VERIFIED_COLOR_DEFAULT = "#10b981";

/**
 * CSS custom property name for partial match indicator color.
 * Override via `--dc-partial` on `:root` or `.dark`, or use `<DeepCitationTheme>`.
 */
export const PARTIAL_COLOR_VAR = "--dc-partial";
/** Default partial match indicator color */
export const PARTIAL_COLOR_DEFAULT = "#f59e0b";

/**
 * CSS custom property name for error/not-found indicator color.
 * Override via `--dc-destructive` on `:root` or `.dark`, or use `<DeepCitationTheme>`.
 */
export const ERROR_COLOR_VAR = "--dc-destructive";
/** Default error indicator color */
export const ERROR_COLOR_DEFAULT = "#ef4444";

/**
 * CSS custom property name for pending indicator color.
 * Override via `--dc-pending` on `:root` or `.dark`, or use `<DeepCitationTheme>`.
 */
export const PENDING_COLOR_VAR = "--dc-pending";
/** Default pending indicator color */
export const PENDING_COLOR_DEFAULT = "#a1a1aa";

// =============================================================================
// Primary Accent Token
// =============================================================================

/** CSS custom property name for primary accent color (active tabs, links). */
export const PRIMARY_COLOR_VAR = "--dc-primary";
/** Default primary accent color (blue-500). */
export const PRIMARY_COLOR_DEFAULT = "#3b82f6";

/** CSS custom property name for text on primary surfaces. */
export const PRIMARY_FOREGROUND_VAR = "--dc-primary-foreground";
/** Default primary foreground color. */
export const PRIMARY_FOREGROUND_DEFAULT = "#ffffff";

// =============================================================================
// Status Tint Background Tokens
// =============================================================================

export const VERIFIED_BG_VAR = "--dc-verified-bg";
export const VERIFIED_BORDER_VAR = "--dc-verified-border";
export const VERIFIED_HOVER_VAR = "--dc-verified-hover";

export const PARTIAL_BG_VAR = "--dc-partial-bg";
export const PARTIAL_BORDER_VAR = "--dc-partial-border";
export const PARTIAL_HOVER_VAR = "--dc-partial-hover";

export const DESTRUCTIVE_BG_VAR = "--dc-destructive-bg";
export const DESTRUCTIVE_BORDER_VAR = "--dc-destructive-border";
export const DESTRUCTIVE_HOVER_VAR = "--dc-destructive-hover";

export const PENDING_BG_VAR = "--dc-pending-bg";
export const PENDING_BORDER_VAR = "--dc-pending-border";
export const PENDING_HOVER_VAR = "--dc-pending-hover";

// =============================================================================
// Border Radius Tokens
// =============================================================================

export const RADIUS_SM_VAR = "--dc-radius-sm";
export const RADIUS_MD_VAR = "--dc-radius-md";
export const RADIUS_LG_VAR = "--dc-radius-lg";

// =============================================================================
// Font Token
// =============================================================================

/** CSS custom property name for the font family used in citation components. */
export const FONT_FAMILY_VAR = "--dc-font-family";

/**
 * CSS custom property name for popover width.
 * @example
 * ```css
 * :root {
 *   --dc-popover-width: 500px; // Override default 480px
 * }
 * ```
 */
export const POPOVER_WIDTH_VAR = "--dc-popover-width";

/**
 * CSS custom property name for popover font family.
 * Override to use a different typeface inside citation popovers.
 * @example
 * ```js
 * document.documentElement.style.setProperty('--dc-popover-font', 'Georgia, serif');
 * ```
 */
export const POPOVER_FONT_VAR = "--dc-popover-font";
/** Default popover width in pixels */
export const POPOVER_WIDTH_DEFAULT_PX = 480;
/** Default popover width */
export const POPOVER_WIDTH_DEFAULT = `${POPOVER_WIDTH_DEFAULT_PX}px`;
/** Resolved popover width CSS value. Customizable via `--dc-popover-width`. */
export const POPOVER_WIDTH = `var(${POPOVER_WIDTH_VAR}, ${POPOVER_WIDTH_DEFAULT})`;
/** Extra px beyond image natural width for the expanded popover shell (mx-3 24px + shell border 2px). */
export const EXPANDED_IMAGE_SHELL_PX = 26;

/** Minimum popover width (px) for content-adaptive sizing. Text-readability floor. */
export const POPOVER_WIDTH_MIN_PX = 320;

/** Viewport edge margin (px) for popover positioning.
 *  All positioning hooks clamp to this distance from each viewport edge. */
export const VIEWPORT_MARGIN_PX = 16;

/** CSS custom property for the guard's viewport-constrained max width.
 *  Set by useViewportBoundaryGuard using `document.documentElement.clientWidth`
 *  (visible viewport excluding scrollbar). All maxWidth formulas reference this
 *  with a fallback to `calc(100dvw - 2rem)` for SSR/pre-guard. */
export const GUARD_MAX_WIDTH_VAR = "--dc-guard-max-width";

/** Shell padding (px) around the keyhole image for summary popover sizing.
 *  EvidenceTray m-3 (12px×2) + borders (~4px) + breathing room = 32px. */
export const SUMMARY_IMAGE_SHELL_PX = 32;
/** Default max width for verification images (responsive with fallback) */
export const VERIFICATION_IMAGE_MAX_WIDTH = "min(70vw, 480px)";
/** Default max height for verification images (responsive with fallback) */
export const VERIFICATION_IMAGE_MAX_HEIGHT = "min(50vh, 360px)";
/** Optional CSS variable for light-mode proof image canvas background. */
export const DOCUMENT_CANVAS_BG_LIGHT_VAR = "--dc-document-canvas-bg-light";
/** Optional CSS variable for dark-mode proof image canvas background. */
export const DOCUMENT_CANVAS_BG_DARK_VAR = "--dc-document-canvas-bg-dark";
/** Neutral canvas behind page images so white documents stay visually bounded. */
export const DOCUMENT_CANVAS_BG_CLASSES =
  "bg-[var(--dc-document-canvas-bg-light,rgb(244_244_245))] dark:bg-[var(--dc-document-canvas-bg-dark,rgb(39_39_42))]";
/** Subtle outline around document images to preserve edge contrast on light canvases. */
export const DOCUMENT_IMAGE_EDGE_CLASSES = "ring-1 ring-black/10 dark:ring-white/15";

/** Inline style for verified indicator color, using CSS custom property with fallback */
export const VERIFIED_COLOR_STYLE: React.CSSProperties = {
  color: `var(${VERIFIED_COLOR_VAR}, ${VERIFIED_COLOR_DEFAULT})`,
};

/** Inline style for partial match indicator color, using CSS custom property with fallback */
export const PARTIAL_COLOR_STYLE: React.CSSProperties = {
  color: `var(${PARTIAL_COLOR_VAR}, ${PARTIAL_COLOR_DEFAULT})`,
};

/** Inline style for error/not-found indicator color, using CSS custom property with fallback */
export const ERROR_COLOR_STYLE: React.CSSProperties = {
  color: `var(${ERROR_COLOR_VAR}, ${ERROR_COLOR_DEFAULT})`,
};

/** Inline style for pending indicator color, using CSS custom property with fallback */
export const PENDING_COLOR_STYLE: React.CSSProperties = {
  color: `var(${PENDING_COLOR_VAR}, ${PENDING_COLOR_DEFAULT})`,
};

/**
 * Base CSS classes for inner popover containers.
 * Border, rounded corners, background, and shadow are provided by the outer
 * PopoverContent wrapper — this constant exists only so layout classes
 * (min/max-width) can be composed with cn().
 */
export const POPOVER_CONTAINER_BASE_CLASSES = "";

/**
 * Dynamic indicator size styles.
 * Uses em units so the indicator scales with the parent font size.
 * 0.85em provides good visibility at most text sizes while staying proportional.
 * minWidth/minHeight ensure a minimum of 10px for accessibility at very small font sizes.
 */
export const INDICATOR_SIZE_STYLE: React.CSSProperties = {
  width: "0.85em",
  height: "0.85em",
  minWidth: "10px",
  minHeight: "10px",
};

/**
 * Dot indicator color classes for status states.
 * Extracted for consistency across components.
 * Used by UrlCitationComponent and other components for colored dot indicators.
 *
 * Provides both light and dark mode variants aligned with Tailwind color palette:
 * - green: Verified/success state
 * - amber: Partial/warning state
 * - red: Error/not found state
 * - gray: Pending/loading state
 */
export const DOT_COLORS = {
  green: "bg-dc-verified",
  amber: "bg-dc-partial",
  red: "bg-dc-destructive",
  gray: "bg-dc-pending",
} as const;

/**
 * Dynamic dot indicator size styles.
 * Much smaller than icon indicators — a subtle filled circle (like GitHub status dots).
 * Uses em units so the dot scales with parent font size.
 * 0.45em produces a dot roughly half the size of the icon indicators.
 * minWidth/minHeight ensure a minimum of 6px for visibility at very small font sizes.
 */
export const DOT_INDICATOR_SIZE_STYLE: React.CSSProperties = {
  width: "0.4em",
  height: "0.4em",
  minWidth: "6px",
  minHeight: "6px",
};

/**
 * Dynamic caret indicator size styles.
 * Sits between dot (0.4em) and icon (0.85em) — visible but not attention-grabbing.
 * Uses em units so the caret scales with parent font size.
 */
export const CARET_INDICATOR_SIZE_STYLE: React.CSSProperties = {
  width: "0.7em",
  height: "0.7em",
  minWidth: "8px",
  minHeight: "8px",
};

/**
 * Pill wrapper padding for the caret indicator variant.
 * Adds subtle padding around the 0.7em icon, bringing total diameter to ~0.9em.
 * Background color and border-radius applied via Tailwind classes (conditional on state).
 */
export const CARET_PILL_STYLE: React.CSSProperties = {
  padding: "0.1em",
};

/**
 * Fixed-size dot indicator for non-inline contexts (drawers, wrappers, badges).
 * Uses fixed 6px instead of em units because these contexts have their own
 * fixed-size containers that handle proportional sizing.
 */
export const DOT_INDICATOR_FIXED_SIZE_STYLE: React.CSSProperties = {
  width: "6px",
  height: "6px",
};

// =============================================================================
// Z-INDEX LAYERING
// =============================================================================
//
// Z-index hierarchy for DeepCitation overlay components.
// All values use CSS custom properties so consumers can adjust stacking
// relative to their own app's z-index scale.
//
// Layer                        CSS custom property             Default
// ────────────────────────────────────────────────────────────────────
// Popover (portal)              --dc-z-popover                  9998
// Drawer backdrop              --dc-z-drawer-backdrop           9998
// Drawer container             --dc-z-drawer                    9999
// Image overlay                --dc-z-image-overlay             9999
// Tooltip (SourceTooltip)      z-50 (Tailwind, local stacking)    50
//
// Drawer stacked icons use inline z-index 1–10 for local stacking order.

/**
 * Z-Index Layering Hierarchy:
 * - 9998 (backdrop): Popover backdrop, drawer backdrop (behind content)
 * - 9999 (overlay): Drawer container, image overlay (in front of page content)
 * All use CSS custom properties for consumer override capability.
 */

/** CSS custom property for the popover z-index. Default: 9998. */
export const Z_INDEX_POPOVER_VAR = "--dc-z-popover";
/** CSS custom property for the drawer backdrop z-index. Default: 9998. */
export const Z_INDEX_DRAWER_BACKDROP_VAR = "--dc-z-drawer-backdrop";
/** CSS custom property for the drawer container z-index. Default: 9999. */
export const Z_INDEX_DRAWER_VAR = "--dc-z-drawer";
/** CSS custom property for the image overlay z-index. Default: 9999. */
export const Z_INDEX_IMAGE_OVERLAY_VAR = "--dc-z-image-overlay";

/** Default z-index for backdrop layers (popover, drawer backdrop). */
export const Z_INDEX_BACKDROP_DEFAULT = 9998;
/** Default z-index for foreground overlays (drawer, image overlay). */
export const Z_INDEX_OVERLAY_DEFAULT = 9999;

// =============================================================================
// PORTAL
// =============================================================================

/**
 * Returns `document.body` if available (browser), or `null` during SSR.
 * Use as the container argument for `createPortal` — when `null` is returned,
 * the caller should skip rendering the portal entirely.
 */
export function getPortalContainer(): HTMLElement | null {
  return typeof document !== "undefined" ? document.body : null;
}

/**
 * CSS custom property for anchor text highlight color.
 * Can be overridden to match custom proof image styles.
 */
export const ANCHOR_HIGHLIGHT_VAR = "--dc-anchor-highlight";

/**
 * Inline style for superscript citation markers.
 * Positions the element as a true superscript with consistent sizing.
 */
export const SUPERSCRIPT_STYLE: React.CSSProperties = {
  fontSize: "0.65em",
  lineHeight: 0,
  position: "relative",
  top: "-0.65em",
  verticalAlign: "baseline",
};

/** Inline style for anchor text highlight background */
export const ANCHOR_HIGHLIGHT_STYLE: React.CSSProperties = {
  backgroundColor: `var(${ANCHOR_HIGHLIGHT_VAR}, ${ANCHOR_HIGHLIGHT_COLOR})`,
  borderRadius: "2px",
  padding: "0 1px",
};

// =============================================================================
// EVIDENCE TRAY & EXPANDED VIEW
// =============================================================================

/** Border class for evidence tray in verified/partial states */
export const EVIDENCE_TRAY_BORDER_SOLID = "border border-dc-border";

/** Border class for evidence tray in not-found state (dashed = "broken") */
export const EVIDENCE_TRAY_BORDER_DASHED = "border border-dashed border-dc-border";

/** CSS custom property for expanded popover width */
export const EXPANDED_POPOVER_WIDTH_VAR = "--dc-expanded-width";
/** Default expanded popover width */
export const EXPANDED_POPOVER_WIDTH_DEFAULT = "calc(100dvw - 2rem)";
/** Maximum expanded popover width */
export const EXPANDED_POPOVER_MAX_WIDTH = "calc(100dvw - 2rem)";
/** Default expanded popover height — fixed viewport-relative cap. */
export const EXPANDED_POPOVER_HEIGHT = "calc(100dvh - 2rem)";

// =============================================================================
// FOCUS / HIT-BOX / INTERACTION CLASSES
// =============================================================================

/** Shared focus-visible ring treatment for interactive elements. */
export const FOCUS_RING_CLASSES = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-ring/40";
/** Shared neutral interactive styling for tertiary actions (links/buttons). */
export const TERTIARY_ACTION_BASE_CLASSES = `transition-colors duration-120 ${FOCUS_RING_CLASSES}`;
/** Idle tertiary action text color. */
export const TERTIARY_ACTION_IDLE_CLASSES = "text-dc-muted-foreground";
/** Hover/focus tertiary action text color. */
export const TERTIARY_ACTION_HOVER_CLASSES = "hover:text-dc-foreground";
/** Invisible hit-box extender — uniform 8px in all directions.
 *  Element must be positioned (relative/absolute/fixed). */
export const HITBOX_EXTEND_8 = "after:content-[''] after:absolute after:inset-[-8px]";

/** Invisible hit-box extender — 8px horizontal, 14px vertical.
 *  Element must be positioned (relative/absolute/fixed). */
export const HITBOX_EXTEND_8x14 = "after:content-[''] after:absolute after:inset-x-[-8px] after:inset-y-[-14px]";

// =============================================================================
// TIME TO CERTAINTY (TtC) DISPLAY
// =============================================================================

/** CSS custom property for TtC text color. */
export const TTC_COLOR_VAR = "--dc-ttc-color";
/** Default TtC text color (Tailwind zinc-400) — intentionally muted/ambient */
export const TTC_COLOR_DEFAULT = "#a1a1aa";

/** CSS custom property for TtC "fast" highlight color. */
export const TTC_FAST_COLOR_VAR = "--dc-ttc-fast-color";
/** Default fast TtC color (subtle green tint) */
export const TTC_FAST_COLOR_DEFAULT = "#86efac";

/** Inline style for TtC display text — muted, tabular-nums to prevent layout jitter */
export const TTC_TEXT_STYLE: React.CSSProperties = {
  color: `var(${TTC_COLOR_VAR}, ${TTC_COLOR_DEFAULT})`,
  fontSize: "10px",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.02em",
};

/** Inline style for TtC fast tier — subtle green emphasis for quick verifications */
export const TTC_FAST_TEXT_STYLE: React.CSSProperties = {
  ...TTC_TEXT_STYLE,
  color: `var(${TTC_FAST_COLOR_VAR}, ${TTC_FAST_COLOR_DEFAULT})`,
};

// =============================================================================
// SCROLLBAR HIDING
// =============================================================================

/** CSS to hide native scrollbars (Firefox + legacy Edge). Pair with a
 *  `::-webkit-scrollbar { display: none }` rule for Chrome/Safari. */
export const HIDE_SCROLLBAR_STYLE: React.CSSProperties = {
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};
