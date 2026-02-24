/**
 * Drawing entry point — re-exports from the canonical citationDrawing module.
 *
 * This file exists solely as the tsup entry point for `deepcitation/drawing`.
 * All symbols are defined in `./citationDrawing.ts`.
 */
export {
  // Types
  type HighlightColor,
  // Color constants
  CITATION_LINE_BORDER_WIDTH,
  SIGNAL_BLUE,
  SIGNAL_BLUE_DARK,
  SIGNAL_AMBER,
  OVERLAY_COLOR,
  OVERLAY_COLOR_HEX,
  ANCHOR_HIGHLIGHT_COLOR,
  ANCHOR_HIGHLIGHT_COLOR_DARK,
  KEYSPAN_HIGHLIGHT_COLOR,
  KEYSPAN_HIGHLIGHT_COLOR_DARK,
  // Bracket geometry
  BRACKET_RATIO,
  BRACKET_MIN_WIDTH,
  BRACKET_MAX_WIDTH,
  getBracketWidth,
  getBracketColor,
  // Highlight logic
  shouldHighlightAnchorText,
  shouldHighlightKeySpan,
  computeKeySpanHighlight,
} from "./citationDrawing.js";
