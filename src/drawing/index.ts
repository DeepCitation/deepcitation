/**
 * Drawing entry point — re-exports from the canonical citationDrawing module.
 *
 * This file exists solely as the tsup entry point for `deepcitation/drawing`.
 * All symbols are defined in `./citationDrawing.ts`.
 */
export {
  ANCHOR_HIGHLIGHT_COLOR,
  ANCHOR_HIGHLIGHT_COLOR_DARK,
  BOX_PADDING,
  BRACKET_MAX_WIDTH,
  BRACKET_MIN_WIDTH,
  BRACKET_RATIO,
  CITATION_LINE_BORDER_WIDTH,
  computeKeySpanHighlight,
  getBracketColor,
  getBracketWidth,
  type HighlightColor,
  OVERLAY_COLOR,
  OVERLAY_COLOR_HEX,
  SIGNAL_AMBER,
  SIGNAL_BLUE,
  SIGNAL_BLUE_DARK,
  SPOTLIGHT_PADDING,
  shouldHighlightAnchorText,
  VERIFICATION_IMAGE_PADDING,
} from "./citationDrawing.js";
