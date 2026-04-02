/**
 * Citation Drawing Constants & Utilities
 *
 * Canonical location for all drawing constants, bracket geometry, and
 * highlight-decision logic shared between the server-side canvas renderer
 * (verificationImages.ts) and the client-side CSS overlay
 * (CitationAnnotationOverlay.tsx).
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Highlight color category for citation annotations.
 * - 'green': exact / full-phrase match (VERIFIED)
 * - 'amber': partial match (anchorText-only or value-only)
 * - 'red': not-found (AI claimed location overlay)
 * - 'blue': legacy alias for 'green' — kept for backward compatibility
 */
export type HighlightColor = "green" | "blue" | "amber" | "red";

// =============================================================================
// Color Constants
// =============================================================================

/** Border width for citation bracket outlines (px). */
export const CITATION_LINE_BORDER_WIDTH = 2;

/** Green bracket color for verified / exact-match citations (BRANDING.md VERIFIED, emerald-500). */
export const SIGNAL_GREEN = "#10b981";
/** Lighter green for dark-mode contexts (BRANDING.md VERIFIED, emerald-400). */
export const SIGNAL_GREEN_DARK = "#34d399";

/** @deprecated Use SIGNAL_GREEN. Kept for any external consumers still referencing blue brackets. */
export const SIGNAL_BLUE = "#005595";
/** @deprecated Use SIGNAL_GREEN_DARK. */
export const SIGNAL_BLUE_DARK = "#77bff6";

/** Amber bracket color for partial matches (Tailwind amber-400). */
export const SIGNAL_AMBER = "#fbbf24";

/** Red bracket color for not-found citations (Tailwind red-500). */
export const SIGNAL_RED = "#ef4444";

/** Semi-transparent overlay covering non-citation areas (spotlight effect). */
export const OVERLAY_COLOR = "rgba(26, 26, 26, 0.25)";
/** Hex equivalent of OVERLAY_COLOR for contexts that need hex. */
export const OVERLAY_COLOR_HEX = "#1a1a1a40";

/** Light overlay for dark page content — white semi-transparent inverse of OVERLAY_COLOR. */
export const OVERLAY_COLOR_LIGHT = "rgba(255, 255, 255, 0.25)";
/** Hex equivalent of OVERLAY_COLOR_LIGHT for contexts that need hex. */
export const OVERLAY_COLOR_LIGHT_HEX = "#ffffff40";

/** Special amber accent behind anchorText when it differs from fullPhrase. */
export const ANCHOR_HIGHLIGHT_COLOR = "rgba(251, 191, 36, 0.2)";
/** Slightly more visible special-accent variant for dark-mode contexts. */
export const ANCHOR_HIGHLIGHT_COLOR_DARK = "rgba(251, 191, 36, 0.25)";

// =============================================================================
// Bracket Geometry
// =============================================================================

/** Pixel padding between text bounding box and bracket marks. Matches backend boxPadding. */
export const BOX_PADDING = 2;

/**
 * Padding (px) between the verification text bounding box and the rendered
 * image edge. Matches the backend `VERIFICATION_IMAGE_PADDING` constant so
 * that client-side overlays align with server-rendered proof images.
 */
export const VERIFICATION_IMAGE_PADDING = 60;

/**
 * Extra pixel padding between bracket marks and the spotlight overlay edge.
 * Creates the visible white gap between brackets and the dark overlay.
 * Matches the backend `VERIFICATION_IMAGE_PADDING_EXTRA` constant (30px in
 * canvas space) so overlays and proof images stay pixel-aligned.
 */
export const SPOTLIGHT_PADDING = 30;

/** Spotlight cutout corner radius — twice the bracket offset for subtle rounding. */
export const SPOTLIGHT_BORDER_RADIUS = BOX_PADDING * 2;

export const BRACKET_RATIO = 1 / 5;
export const BRACKET_MIN_WIDTH = 4;
export const BRACKET_MAX_WIDTH = 12;

/**
 * Calculates the width of the citation bracket arm based on the height
 * of the citation box. Matches CSS aspect-ratio: 1/5 logic clamped to 4–12px.
 */
export function getBracketWidth(height: number): number {
  return Math.max(BRACKET_MIN_WIDTH, Math.min(height * BRACKET_RATIO, BRACKET_MAX_WIDTH));
}

/**
 * Returns the bracket stroke color for a given highlight category.
 * Green for verified/exact matches, amber for partial matches, red for not-found.
 * "blue" is a legacy alias that resolves to the deprecated SIGNAL_BLUE value.
 */
export function getBracketColor(highlightColor: HighlightColor = "green"): string {
  if (highlightColor === "amber") return SIGNAL_AMBER;
  if (highlightColor === "red") return SIGNAL_RED;
  if (highlightColor === "blue") return SIGNAL_BLUE; // legacy
  return SIGNAL_GREEN;
}

// =============================================================================
// Highlight Decision Logic
// =============================================================================

/**
 * True when the API returned verifiedFullPhrase identical to verifiedAnchorText —
 * a "strategy override" where the model collapsed the full phrase to just the anchor.
 */
export function isStrategyOverride(
  verifiedAnchorText: string | null | undefined,
  verifiedFullPhrase: string | null | undefined,
): boolean {
  return (
    verifiedAnchorText != null &&
    verifiedFullPhrase != null &&
    verifiedAnchorText.toLowerCase() === verifiedFullPhrase.toLowerCase()
  );
}

/**
 * Returns true when both anchorText and fullPhrase are non-null, non-undefined,
 * and non-empty. The rendering layer decides whether to visually show the highlight
 * by checking that the anchor and phrase boxes are actually distinct (hasDistinctKeySpanBox
 * in computeKeySpanHighlight).
 */
export function shouldHighlightAnchorText(
  anchorText: string | null | undefined,
  fullPhrase: string | null | undefined,
): boolean {
  return Boolean(anchorText?.trim()) && Boolean(fullPhrase?.trim());
}

/**
 * Computes whether the anchorText keyspan should be highlighted and extracts
 * the anchorText bounding box item to use for drawing.
 *
 * Checks that the anchorTextMatchDeepItems[0] text is distinct from the
 * phraseMatchDeepItem text (case-insensitive) via shouldHighlightAnchorText,
 * and that the rendered boxes are geometrically distinct (hasDistinctKeySpanBox).
 *
 * @throws Error if either text input exceeds MAX_REGEX_INPUT_LENGTH (~100KB)
 */
export function computeKeySpanHighlight<T extends { text?: string }>(
  phraseMatchDeepItem: T | undefined,
  anchorTextMatchDeepItems: T[] | undefined,
  verifiedAnchorText: string | null | undefined,
  verifiedFullPhrase: string | null | undefined,
): { showKeySpanHighlight: boolean; anchorTextItem: T | undefined; anchorTextItems: T[] } {
  const anchorTextItem = anchorTextMatchDeepItems?.[0];
  const phraseText = phraseMatchDeepItem?.text;
  const anchorTextText = anchorTextItem?.text;

  const hasDistinctKeySpanBox = Boolean(
    anchorTextText && phraseText && anchorTextText.toLowerCase() !== phraseText.toLowerCase(),
  );

  // Word-context gate: anchor must have meaningfully fewer words than the phrase.
  // For 1-word anchors a single extra word is enough; for longer anchors require ≥2 extra.
  const vAnchorWords = verifiedAnchorText?.trim().split(/\s+/).length ?? 0;
  const vPhraseWords = verifiedFullPhrase?.trim().split(/\s+/).length ?? 0;
  const hasWordContext =
    vAnchorWords > 0 && vPhraseWords > vAnchorWords && (vAnchorWords === 1 || vPhraseWords - vAnchorWords >= 2);

  // Primary check: anchorText vs verifiedFullPhrase.
  // Fallback: anchorText vs phraseMatchDeepItem.text — ONLY when isStrategyOverride()
  // (API collapsed full phrase to just the anchor text, but the matched text box spans more).
  const showKeySpanHighlight =
    hasDistinctKeySpanBox &&
    ((hasWordContext && shouldHighlightAnchorText(verifiedAnchorText, verifiedFullPhrase)) ||
      (isStrategyOverride(verifiedAnchorText, verifiedFullPhrase) &&
        shouldHighlightAnchorText(verifiedAnchorText, phraseText)));

  // anchorTextItems: full array for downstream consumers (e.g., multi-item highlight rendering).
  return { showKeySpanHighlight, anchorTextItem, anchorTextItems: anchorTextMatchDeepItems ?? [] };
}
