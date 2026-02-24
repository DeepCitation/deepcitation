/**
 * Drawing entry point — re-exports from the canonical citationDrawing module.
 *
 * This file exists solely as the tsup entry point for `deepcitation/drawing`.
 * All symbols are defined in `./citationDrawing.ts`.
 */
export {
  ANCHOR_HIGHLIGHT_COLOR,
  ANCHOR_HIGHLIGHT_COLOR_DARK,
  // Padding
  BOX_PADDING,
  BRACKET_MAX_WIDTH,
  BRACKET_MIN_WIDTH,
  // Bracket geometry
  BRACKET_RATIO,
  // Color constants
  CITATION_LINE_BORDER_WIDTH,
  computeKeySpanHighlight,
  getBracketColor,
  getBracketWidth,
  // Types
  type HighlightColor,
  KEYSPAN_HIGHLIGHT_COLOR,
  KEYSPAN_HIGHLIGHT_COLOR_DARK,
  OVERLAY_COLOR,
  OVERLAY_COLOR_HEX,
  SIGNAL_AMBER,
  SIGNAL_BLUE,
  SIGNAL_BLUE_DARK,
  SPOTLIGHT_PADDING,
  // Highlight logic
  shouldHighlightAnchorText,
  shouldHighlightKeySpan,
} from "./citationDrawing.js";
