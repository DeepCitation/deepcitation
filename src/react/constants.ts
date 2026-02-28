/**
 * Shared constants for DeepCitation React components
 * @packageDocumentation
 */

import type React from "react";
import { ANCHOR_HIGHLIGHT_COLOR } from "../drawing/citationDrawing.js";

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
// These can be overridden via CSS to match your design system:
//
// :root {
//   --dc-verified-color: #22c55e;
//   --dc-partial-color: #eab308;
//   --dc-error-color: #dc2626;
//   --dc-pending-color: #6b7280;
//   --dc-popover-width: 400px;
// }
// =============================================================================

/**
 * CSS custom property name for verified/success indicator color.
 * @example
 * ```css
 * :root {
 *   --dc-verified-color: #22c55e; // Override default
 * }
 * ```
 */
export const VERIFIED_COLOR_VAR = "--dc-verified-color";
/** Default verified indicator color (Tailwind green-600) */
export const VERIFIED_COLOR_DEFAULT = "#16a34a";

/**
 * CSS custom property name for partial match indicator color.
 * @example
 * ```css
 * :root {
 *   --dc-partial-color: #eab308; // Override default
 * }
 * ```
 */
export const PARTIAL_COLOR_VAR = "--dc-partial-color";
/** Default partial match indicator color (Tailwind amber-500) */
export const PARTIAL_COLOR_DEFAULT = "#f59e0b";

/**
 * CSS custom property name for error/not-found indicator color.
 * @example
 * ```css
 * :root {
 *   --dc-error-color: #dc2626; // Override default
 * }
 * ```
 */
export const ERROR_COLOR_VAR = "--dc-error-color";
/** Default error indicator color (Tailwind red-500) */
export const ERROR_COLOR_DEFAULT = "#ef4444";

/**
 * CSS custom property name for pending indicator color.
 * @example
 * ```css
 * :root {
 *   --dc-pending-color: #6b7280; // Override default
 * }
 * ```
 */
export const PENDING_COLOR_VAR = "--dc-pending-color";
/** Default pending indicator color (Tailwind gray-400) */
export const PENDING_COLOR_DEFAULT = "#9ca3af";

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
/** Default popover width */
export const POPOVER_WIDTH_DEFAULT = "480px";
/** Resolved popover width CSS value. Customizable via `--dc-popover-width`. */
export const POPOVER_WIDTH = `var(${POPOVER_WIDTH_VAR}, ${POPOVER_WIDTH_DEFAULT})`;
/** Extra px beyond image natural width for the expanded popover shell (mx-3 margins + borders). */
export const EXPANDED_IMAGE_SHELL_PX = 32;

/** Minimum popover width (px) for content-adaptive sizing. Text-readability floor. */
export const POPOVER_WIDTH_MIN_PX = 320;

/** Viewport edge margin (px) for popover positioning.
 *  All positioning hooks clamp to this distance from each viewport edge. */
export const VIEWPORT_MARGIN_PX = 16;

/** Shell padding (px) around the keyhole image for summary popover sizing.
 *  EvidenceTray m-3 (12px×2) + borders (~4px) + breathing room = 32px. */
export const SUMMARY_IMAGE_SHELL_PX = 32;
/** Default max width for verification images (responsive with fallback) */
export const VERIFICATION_IMAGE_MAX_WIDTH = "min(70vw, 480px)";
/** Default max height for verification images (responsive with fallback) */
export const VERIFICATION_IMAGE_MAX_HEIGHT = "min(50vh, 360px)";

// =============================================================================
// KEYHOLE IMAGE STRIP
// =============================================================================
//
// The keyhole strip shows verification images at 100% natural scale in a
// fixed-height horizontal window, cropped and centered on the match region.
// This prevents squashing/stretching text, preserving legibility and trust.

/** CSS custom property for keyhole strip height override */
export const KEYHOLE_STRIP_HEIGHT_VAR = "--dc-keyhole-strip-height";

/** Default height of the keyhole image strip in pixels */
export const KEYHOLE_STRIP_HEIGHT_DEFAULT = 120;

/** Height of keyhole strip when expanded in-place (drawer context, px) */
export const KEYHOLE_EXPANDED_HEIGHT = 300;

/** Height of the miss-state proof page thumbnail shown in EvidenceTray (px) */
export const MISS_TRAY_THUMBNAIL_HEIGHT = KEYHOLE_STRIP_HEIGHT_DEFAULT;

/** Default fade gradient width in pixels (the translucent region on each edge) */
export const KEYHOLE_FADE_WIDTH = 32;

/**
 * Builds a CSS mask-image linear-gradient for the keyhole strip.
 * Fades edges to transparent to indicate "there's more content" in that direction.
 *
 * @param fadeLeft - Whether to fade the left edge
 * @param fadeRight - Whether to fade the right edge
 * @param fadeWidthPx - Width of the fade region in pixels
 * @returns CSS linear-gradient string for mask-image
 */
export function buildKeyholeMaskImage(
  fadeLeft: boolean,
  fadeRight: boolean,
  fadeWidthPx: number = KEYHOLE_FADE_WIDTH,
): string {
  if (!fadeLeft && !fadeRight) return "none";
  const left = fadeLeft ? `transparent, black ${fadeWidthPx}px` : "black 0px";
  const right = fadeRight ? `black calc(100% - ${fadeWidthPx}px), transparent` : "black 100%";
  return `linear-gradient(to right, ${left}, ${right})`;
}

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
 * Base CSS classes for popover containers in CitationComponent.
 * Provides consistent styling for all popover states (pending, success, partial, error).
 */
export const POPOVER_CONTAINER_BASE_CLASSES =
  "rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-md";

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
  green: "bg-green-600 dark:bg-green-500",
  amber: "bg-amber-500 dark:bg-amber-400",
  red: "bg-red-500 dark:bg-red-400",
  gray: "bg-gray-400 dark:bg-gray-300",
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
// Popover (Radix portal)       --dc-z-popover                  9998
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

/** Safe raster image data URI prefixes (no SVG — can contain scripts). */
export const SAFE_DATA_IMAGE_PREFIXES = [
  "data:image/png",
  "data:image/jpeg",
  "data:image/jpg",
  "data:image/webp",
  "data:image/avif",
  "data:image/gif",
] as const;

/** Trusted CDN hostnames for proof images. */
export const TRUSTED_IMAGE_HOSTS = ["api.deepcitation.com", "cdn.deepcitation.com", "proof.deepcitation.com"] as const;

/** Localhost hostnames allowed for development environments. */
const DEV_HOSTNAMES = ["localhost", "127.0.0.1"] as const;

/**
 * Validate that a proof image source is a trusted URL or safe data URI.
 * Blocks SVG data URIs (can contain script), javascript: URIs, and untrusted hosts.
 * Allows localhost/127.0.0.1 for development environments.
 */
export function isValidProofImageSrc(src: unknown): src is string {
  if (typeof src !== "string") return false;
  const trimmed = src.trim();
  if (trimmed.length === 0) return false;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("data:")) {
    return SAFE_DATA_IMAGE_PREFIXES.some(prefix => lower.startsWith(prefix));
  }

  // Same-origin relative paths (e.g. "/demo/legal/page-1.avif") — safe because
  // the browser resolves them against the current host.
  // Reject: protocol-relative URLs (//evil.com), path traversal (..), encoded traversal (%2e),
  // Unicode lookalike traversal (fullwidth dots), double-encoding, and null bytes.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    // Defense-in-depth: reject obvious traversal before expensive decoding
    if (trimmed.includes("..")) return false;

    try {
      // Validate input length before expensive operations to prevent DoS
      // Legitimate proof image paths (e.g., /api/proof/abc123.avif) are typically <200 chars.
      // 2KB limit provides 10x headroom for complex query strings while preventing DoS.
      const MAX_PATH_LENGTH = 2_000;
      if (trimmed.length > MAX_PATH_LENGTH) return false;

      // Iteratively decode until stable to prevent double-encoded traversal (%252e%252e)
      let decoded = trimmed;
      let previous;
      let iterations = 0;
      const MAX_DECODE_ITERATIONS = 5; // Prevent infinite loops on malicious input

      do {
        previous = decoded;
        decoded = decodeURIComponent(decoded);
        iterations++;
        if (iterations >= MAX_DECODE_ITERATIONS) break;
      } while (decoded !== previous);

      // Normalize Unicode (NFC) to handle composed characters consistently
      const normalized = decoded.normalize("NFC");

      // Reject null bytes (C truncation attack)
      if (normalized.includes("\0")) return false;

      // Reject Unicode lookalike dots that could be used for traversal obfuscation
      // U+FF0E (fullwidth full stop), U+2024 (one dot leader), U+FE52 (small full stop), etc.
      const dangerousUnicodeDots = /[\uFF0E\u2024\uFE52\u2025\u2026]/;
      if (dangerousUnicodeDots.test(normalized)) return false;

      // Reject path traversal sequences (also catches encoded forms after decoding)
      if (normalized.includes("..")) return false;

      // Accept valid same-origin relative paths
      return true;
    } catch {
      return false; // malformed percent-encoding — reject
    }
  }

  try {
    const url = new URL(trimmed);
    const isLocalhost = (DEV_HOSTNAMES as readonly string[]).includes(url.hostname);
    const isTrustedHost = (TRUSTED_IMAGE_HOSTS as readonly string[]).includes(url.hostname);
    return (url.protocol === "https:" && isTrustedHost) || isLocalhost;
  } catch {
    return false;
  }
}

/**
 * CSS custom property for anchor text highlight color.
 * Can be overridden to match custom proof image styles.
 */
export const ANCHOR_HIGHLIGHT_VAR = "--dc-anchor-highlight";

/** Inline style for anchor text highlight background */
export const ANCHOR_HIGHLIGHT_STYLE: React.CSSProperties = {
  backgroundColor: `var(${ANCHOR_HIGHLIGHT_VAR}, ${ANCHOR_HIGHLIGHT_COLOR})`,
  borderRadius: "2px",
  padding: "0 1px",
};

// =============================================================================
// KEYHOLE SKIP THRESHOLD
// =============================================================================
//
// When the verification image's natural height is close to the keyhole strip
// height, the keyhole crop adds no value — expanding would reveal almost
// nothing new. Skip the expand affordance when image nearly fits.

/**
 * Factor applied to the keyhole strip's CSS-resolved height to decide when to
 * suppress expansion. When `naturalHeight ≤ stripHeight × KEYHOLE_SKIP_THRESHOLD`,
 * the image already shows most of its content in the keyhole strip, so the
 * expand step would reveal almost nothing new.
 *
 * At 1.5, images up to 50% taller than the strip (up to ~135px for 90px strip)
 * are treated as "fits completely." This avoids tiny, unhelpful expansions.
 */
export const KEYHOLE_SKIP_THRESHOLD = 1.5;

// =============================================================================
// ZOOM CONTROLS (InlineExpandedImage)
// =============================================================================
//
// Zoom constants for the expanded image viewer. Controls are subtle but
// always available on both desktop and mobile.

/** Zoom step for +/− buttons (0.25 = 25% increments). */
export const EXPANDED_ZOOM_STEP = 0.25;
/** Minimum zoom level (50%). */
export const EXPANDED_ZOOM_MIN = 0.5;
/** Maximum zoom level (300%). */
export const EXPANDED_ZOOM_MAX = 3.0;

/** Minimum initial zoom for expanded page view to keep text readable (80%).
 *  On narrow viewports, fit-to-width can shrink a 1700px PDF to ~42% — illegible.
 *  This floor ensures the initial zoom is at least 80%, with panning for overflow. */
export const EXPANDED_MIN_READABLE_ZOOM = 0.8;

/** Width ratio threshold for keyhole width-fit mode.
 *  When image at height-fit scale is narrower than this fraction of the
 *  container, switch to width-fit mode for readability. */
export const KEYHOLE_WIDTH_FIT_THRESHOLD = 0.4;

// =============================================================================
// EVIDENCE TRAY & EXPANDED VIEW
// =============================================================================

/** Border class for evidence tray in verified/partial states */
export const EVIDENCE_TRAY_BORDER_SOLID = "border border-gray-200 dark:border-gray-700";

/** Border class for evidence tray in not-found state (dashed = "broken") */
export const EVIDENCE_TRAY_BORDER_DASHED = "border border-dashed border-gray-300 dark:border-gray-600";

/** CSS custom property for expanded popover width */
export const EXPANDED_POPOVER_WIDTH_VAR = "--dc-expanded-width";
/** Default expanded popover width */
export const EXPANDED_POPOVER_WIDTH_DEFAULT = "calc(100dvw - 2rem)";
/** Maximum expanded popover width */
export const EXPANDED_POPOVER_MAX_WIDTH = "calc(100dvw - 2rem)";
/** Default expanded popover height — uses Radix's available height CSS var when present */
export const EXPANDED_POPOVER_HEIGHT = "calc(100dvh - 2rem)";

// =============================================================================
// ANIMATION & TRANSITION TIMINGS
// =============================================================================
//
// Five-step timing scale for all UI animations. Each duration maps to a
// semantic tier so every transition uses a deliberate, consistent speed.
//
// Tier              Constant              Duration  Tailwind class   Use cases
// ──────────────────────────────────────────────────────────────────────────────
// Instant           ANIM_INSTANT_MS        75ms     duration-75      Hover bg, trigger color
// Fast              ANIM_FAST_MS          120ms     duration-[120ms] Micro-interactions, exits, chevrons
// Standard          ANIM_STANDARD_MS      180ms     duration-[180ms] Popover entry, grid expand, morphs
// Measured          ANIM_MEASURED_MS      250ms     duration-[250ms] Drawer slide-in, morph expand
// Slow              ANIM_SLOW_MS          350ms     duration-[350ms] Full-page transitions, coordinated
//
// Expand/collapse morphs use separate constants + asymmetric easing:
//   POPOVER_MORPH_EXPAND_MS   200ms  EASE_EXPAND   (fast start, gentle stop, slight overshoot)
//   POPOVER_MORPH_COLLAPSE_MS 100ms  EASE_COLLAPSE (aggressive start, soft landing)
//
// NOTE: Tailwind duration-* classes in JSX must remain as literal strings for
// JIT purging. The table above is the single source of truth for timing values.

/**
 * Per-item stagger delay for citation drawer row reveal animations.
 * Each successive row enters 40ms after the previous, creating a cascading
 * "waterfall" effect that visually communicates list hierarchy.
 */
export const DRAWER_STAGGER_DELAY_MS = 40;
/**
 * Asymptotic cap for cumulative citation drawer stagger delay.
 * Uses exponential approach: `MAX * (1 - e^(-i * DELAY / MAX))`.
 * Early items are ~DELAY apart; gaps shrink smoothly toward zero at MAX.
 */
export const DRAWER_STAGGER_MAX_MS = 250;

/** Delay in ms before hiding a tooltip on mouse leave (prevents flicker on cursor exit). */
export const TOOLTIP_HIDE_DELAY_MS = 80;

/** Debounce threshold in ms for ignoring click events immediately after touch events. */
export const TOUCH_CLICK_DEBOUNCE_MS = 100;

/**
 * Maximum distance (px) a finger can move between touchstart and touchend
 * and still be considered a tap (not a scroll or swipe). Matches the
 * platform tap-vs-scroll threshold used by iOS and Chrome.
 */
export const TAP_SLOP_PX = 10;

/**
 * Sensitivity multiplier for trackpad pinch-to-zoom (Ctrl+wheel).
 * Maps `deltaY` pixels into a zoom delta — 0.005 gives roughly 1% zoom
 * per pixel of wheel travel, balancing precision and responsiveness.
 */
export const WHEEL_ZOOM_SENSITIVITY = 0.005;

/**
 * Duration in ms to show "Copied" feedback before resetting to idle state.
 * Used for copy-to-clipboard feedback in various components.
 */
export const COPY_FEEDBACK_DURATION_MS = 2000;

/** Shared focus-visible ring treatment for interactive elements. */
export const FOCUS_RING_CLASSES = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";
/** Shared neutral interactive styling for tertiary actions (links/buttons). */
export const TERTIARY_ACTION_BASE_CLASSES = `transition-colors duration-150 ${FOCUS_RING_CLASSES}`;
/** Idle tertiary action text color. */
export const TERTIARY_ACTION_IDLE_CLASSES = "text-gray-600 dark:text-gray-400";
/** Hover/focus tertiary action text color. */
export const TERTIARY_ACTION_HOVER_CLASSES = "hover:text-blue-600 dark:hover:text-blue-400";
/** Invisible hit-box extender — uniform 8px in all directions.
 *  Element must be positioned (relative/absolute/fixed). */
export const HITBOX_EXTEND_8 = "after:content-[''] after:absolute after:inset-[-8px]";

/** Invisible hit-box extender — 8px horizontal, 14px vertical.
 *  Element must be positioned (relative/absolute/fixed). */
export const HITBOX_EXTEND_8x14 = "after:content-[''] after:absolute after:inset-x-[-8px] after:inset-y-[-14px]";

/** Auto-hide spinner after this duration if verification is still pending. */
export const SPINNER_TIMEOUT_MS = 5000;

/** Transition duration for popover morph expand (summary → expanded). */
export const POPOVER_MORPH_EXPAND_MS = 200;
/** Transition duration for popover morph collapse (expanded → summary). Faster = snappier close. */
export const POPOVER_MORPH_COLLAPSE_MS = 100;

/**
 * Easing for expand transitions — spring-like with ~6% overshoot.
 * Bézier: fast start (0.34), slight overshoot (1.06), soft landing (0.64, 1).
 * Gives perceptible liveness without visible bounce.
 */
export const EASE_EXPAND = "cubic-bezier(0.34, 1.06, 0.64, 1)";
/**
 * Easing for collapse transitions — decisive decelerate.
 * Bézier: starts with velocity (0.2), then eases into final state (0, 1).
 */
export const EASE_COLLAPSE = "cubic-bezier(0.2, 0, 0, 1)";

/** Stagger delay before expanded-page content animates in. Container morph starts first.
 * 30ms is tight enough to avoid an empty-container flash while still letting the shell
 * establish its new dimensions before content appears. */
export const CONTENT_STAGGER_DELAY_MS = 30;

// =============================================================================
// TIME TO CERTAINTY (TtC) DISPLAY
// =============================================================================

/** CSS custom property for TtC text color. */
export const TTC_COLOR_VAR = "--dc-ttc-color";
/** Default TtC text color (Tailwind gray-400) — intentionally muted/ambient */
export const TTC_COLOR_DEFAULT = "#9ca3af";

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
// DRAWER DRAG-TO-CLOSE
// =============================================================================

/** Minimum downward drag distance (px) on the drawer handle to trigger close. */
export const DRAWER_DRAG_CLOSE_THRESHOLD_PX = 80;

// =============================================================================
// KEYHOLE ZOOM
// =============================================================================

/** Minimum zoom level for the keyhole strip — never zoom below natural pixel density. */
export const KEYHOLE_ZOOM_MIN = 1.0;
/** Maximum zoom level for the keyhole strip — enough to read small text. */
export const KEYHOLE_ZOOM_MAX = 2.5;
/** Zoom step per discrete wheel notch for the keyhole strip. */
export const KEYHOLE_ZOOM_STEP = 0.15;
/** Sensitivity multiplier for keyhole wheel-to-zoom (maps deltaY → zoom delta). */
export const KEYHOLE_WHEEL_ZOOM_SENSITIVITY = 0.008;

// =============================================================================
// ZOOM HINT
// =============================================================================

/** Delay (ms) before showing "Scroll to zoom" hint on hover. */
export const ZOOM_HINT_DELAY_MS = 5000;
/** sessionStorage key for zoom hint dismissal (show once per session). */
export const ZOOM_HINT_SESSION_KEY = "dc-zoom-hint-dismissed";
