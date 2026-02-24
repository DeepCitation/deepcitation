/**
 * Citation Drawing Constants & Utilities
 *
 * Canonical location for all drawing constants, bracket geometry, and
 * highlight-decision logic shared between the server-side canvas renderer
 * (verificationImages.ts) and the client-side CSS overlay
 * (CitationAnnotationOverlay.tsx).
 */

import { safeSplit } from "../utils/regexSafety.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Highlight color category for citation annotations.
 * - 'blue': exact / full-phrase match
 * - 'amber': partial match (anchorText-only or value-only)
 */
export type HighlightColor = "blue" | "amber";

// =============================================================================
// Color Constants
// =============================================================================

/** Border width for citation bracket outlines (px). */
export const CITATION_LINE_BORDER_WIDTH = 2;

/** Blue bracket color for exact/full-phrase matches. */
export const SIGNAL_BLUE = "#005595";
/** Lighter blue for dark-mode contexts. */
export const SIGNAL_BLUE_DARK = "#77bff6";

/** Amber bracket color for partial matches (Tailwind amber-400). */
export const SIGNAL_AMBER = "#fbbf24";

/** Semi-transparent overlay covering non-citation areas (spotlight effect). */
export const OVERLAY_COLOR = "rgba(26, 26, 26, 0.4)";
/** Hex equivalent of OVERLAY_COLOR for contexts that need hex. */
export const OVERLAY_COLOR_HEX = "#1a1a1a66";

/** Amber highlight behind anchorText when it differs from fullPhrase. */
export const ANCHOR_HIGHLIGHT_COLOR = "rgba(251, 191, 36, 0.2)";
/** Slightly more visible variant for dark-mode contexts. */
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
 * Blue for exact matches, amber for partial matches.
 */
export function getBracketColor(highlightColor: HighlightColor = "blue"): string {
  return highlightColor === "amber" ? SIGNAL_AMBER : SIGNAL_BLUE;
}

// =============================================================================
// Highlight Decision Logic
// =============================================================================

/** Minimum extra words fullPhrase must have over anchorText to trigger highlight. */
const MIN_WORD_DIFFERENCE = 2;

/**
 * Count whitespace-delimited words in a string.
 * Uses safeSplit for input-length validation.
 * @throws Error if text exceeds MAX_REGEX_INPUT_LENGTH (~100KB)
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return safeSplit(trimmed, /\s+/).length;
}

/**
 * Determines if anchorText should be highlighted within fullPhrase.
 *
 * Word-based rules:
 * - Highlight when anchorText has fewer words than fullPhrase
 * - fullPhrase must have at least 2 more words than anchorText
 * - Exception: 1-word anchorText highlights even with 1-word difference
 *
 * Examples:
 * - 1 word in 3 words  -> highlight
 * - 1 word in 2 words  -> highlight (single-word exception)
 * - 2 words in 4 words -> highlight
 * - 1 word in 1 word   -> no highlight (same count)
 * - 2 words in 3 words -> no highlight (only 1 word difference)
 *
 * @throws Error if either input exceeds MAX_REGEX_INPUT_LENGTH (~100KB)
 */
export function shouldHighlightAnchorText(
  anchorText: string | null | undefined,
  fullPhrase: string | null | undefined,
): boolean {
  if (!anchorText || !fullPhrase) return false;

  const anchorTextWords = countWords(anchorText);
  const fullPhraseWords = countWords(fullPhrase);

  if (anchorTextWords === 0 || fullPhraseWords === 0) return false;
  if (anchorTextWords >= fullPhraseWords) return false;

  const wordDifference = fullPhraseWords - anchorTextWords;

  // Single-word anchorText: allow even with 1-word difference
  if (anchorTextWords === 1 && wordDifference >= 1) return true;

  return wordDifference >= MIN_WORD_DIFFERENCE;
}

/**
 * Computes whether the anchorText keyspan should be highlighted and extracts
 * the anchorText bounding box item to use for drawing.
 *
 * Checks that the anchorTextMatchDeepItems[0] text is distinct from the
 * phraseMatchDeepItem text (case-insensitive) and that the word-difference
 * threshold is met via shouldHighlightAnchorText.
 *
 * @throws Error if either text input exceeds MAX_REGEX_INPUT_LENGTH (~100KB)
 */
export function computeKeySpanHighlight<T extends { text?: string }>(
  phraseMatchDeepItem: T | undefined,
  anchorTextMatchDeepItems: T[] | undefined,
  verifiedAnchorText: string | null | undefined,
  verifiedFullPhrase: string | null | undefined,
): { showKeySpanHighlight: boolean; anchorTextItem: T | undefined } {
  const anchorTextItem = anchorTextMatchDeepItems?.[0];
  const phraseText = phraseMatchDeepItem?.text;
  const anchorTextText = anchorTextItem?.text;

  const hasDistinctKeySpanBox = Boolean(
    anchorTextText && phraseText && anchorTextText.toLowerCase() !== phraseText.toLowerCase(),
  );
  const showKeySpanHighlight =
    hasDistinctKeySpanBox && shouldHighlightAnchorText(verifiedAnchorText, verifiedFullPhrase);

  return { showKeySpanHighlight, anchorTextItem };
}
