/**
 * Keyhole image strip geometry constants and helpers.
 *
 * CANONICAL LOCATION for:
 * - Keyhole strip sizing (KEYHOLE_STRIP_HEIGHT_DEFAULT, KEYHOLE_STRIP_HEIGHT_VAR)
 * - projectKeyholeDisplayedWidth() — project keyhole width from image dimensions
 * - buildKeyholeMaskImage() — generate edge-fade CSS mask
 * - Keyhole skip / fit / fill thresholds
 * - Expanded image viewer zoom constants (EXPANDED_ZOOM_MIN, EXPANDED_ZOOM_MAX, etc.)
 * - Expanded page canvas padding
 *
 * @packageDocumentation
 */

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

/** Default fade gradient width in pixels (the translucent region on each edge) */
export const KEYHOLE_FADE_WIDTH = 32;

/**
 * Project the keyhole's displayed width from the source image's natural
 * dimensions, assuming it renders inside a strip of `stripHeight` tall.
 *
 * **Load-bearing invariant**: `zoom` is clamped to `Math.min(1, …)` because
 * the keyhole never upscales (see `EvidenceKeyhole` where the same
 * clamp is applied to the actual render). Without the clamp, a short image
 * (naturalHeight < stripHeight, e.g. 1200×80) projects to a phantom
 * upscaled width (1800), causing the popover to render too wide and then
 * pop narrower once the real keyhole measures in.
 */
export function projectKeyholeDisplayedWidth(
  dimensions: { width: number; height: number } | null | undefined,
  stripHeight: number = KEYHOLE_STRIP_HEIGHT_DEFAULT,
): number | null {
  if (!dimensions) return null;
  const { width, height } = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const zoom = Math.min(1, stripHeight / height);
  return width * zoom;
}

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
 * At 2.0, images up to 100% taller than the strip (up to ~180px for 90px strip)
 * are treated as "fits completely." This avoids tiny, unhelpful expansions.
 */
export const KEYHOLE_SKIP_THRESHOLD = 2.0;

/** Width ratio threshold for keyhole width-fit mode.
 *  When image at height-fit scale is narrower than this fraction of the
 *  container, switch to width-fit mode for readability. */
export const KEYHOLE_WIDTH_FIT_THRESHOLD = 0.4;

/** Target fraction of keyhole width that the anchor text should fill.
 *  zoom-to-fit scales the image so anchor text occupies this proportion,
 *  giving enough context without excessive empty space. */
export const KEYHOLE_ANCHOR_FILL_TARGET = 0.7;

/** Default border-radius for the keyhole strip — matches CSS in EvidenceKeyhole. */
export const KEYHOLE_STRIP_BORDER_RADIUS = "6px";

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

/** Minimum initial zoom for expanded page view to keep text readable (50%).
 *  On narrow viewports, fit-to-width can shrink a 1700px PDF to ~20% on phones.
 *  0.5 balances legibility against horizontal panning; users can zoom out
 *  further via the slider (floor set by fitZoom, not this constant). */
export const EXPANDED_MIN_READABLE_ZOOM = 0.5;

/** Padding (px) between the expanded-page canvas edges and its scroll container.
 *  Used both for canvas layout (ExpandedPageViewport) and zoom calculation
 *  (computeExpandedPageFittedZoom). Keep in sync if changed. */
export const EXPANDED_PAGE_CANVAS_PADDING_PX = 16;

// =============================================================================
// KEYHOLE ZOOM — PAN OVERFLOW
// =============================================================================

/** Minimum total overflow (px) in an axis before showing pan arrows/fades.
 *  Suppresses arrow buttons for negligible overflow (e.g. 5px rounding). */
export const MIN_PAN_OVERFLOW_PX = 24;

// =============================================================================
// DEBUG COLORS (page-expand view transition)
// =============================================================================

/** Debug outline color for page-expand source phase. */
export const DEBUG_PAGE_EXPAND_SOURCE_COLOR = "#ef4444";
/** Debug outline color for page-expand target phase. */
export const DEBUG_PAGE_EXPAND_TARGET_COLOR = "#22c55e";
