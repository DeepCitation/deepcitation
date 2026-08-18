/**
 * Drawing entry point — re-exports from the canonical citationDrawing module.
 *
 * This file exists solely as the tsup entry point for `deepcitation/drawing`.
 * All symbols are defined in `./citationDrawing.ts`.
 */

export type { GeometrySpace } from "../types/geometrySpace.js";
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
  OVERLAY_COLOR_LIGHT,
  OVERLAY_COLOR_LIGHT_HEX,
  SIGNAL_AMBER,
  SIGNAL_BLUE,
  SIGNAL_BLUE_DARK,
  SIGNAL_GREEN,
  SIGNAL_GREEN_DARK,
  SIGNAL_RED,
  SPOTLIGHT_BORDER_RADIUS,
  SPOTLIGHT_PADDING,
  shouldHighlightSourceMatch,
  VERIFICATION_IMAGE_PADDING,
} from "./citationDrawing.js";
export {
  type CoordinateOrigin,
  computeEvidenceCropLayout,
  computeEvidenceKeyholeEdgeGutter,
  computeEvidenceKeyholeZoom,
  computeEvidenceOriginPercent,
  computeEvidenceScrollTarget,
  DEFAULT_EVIDENCE_KEYHOLE_MAX_ZOOM,
  DEFAULT_EVIDENCE_KEYHOLE_MIN_EDGE_GUTTER_PX,
  DEFAULT_EVIDENCE_KEYHOLE_TARGET_CONTEXT_HEIGHT_PX,
  DEFAULT_EVIDENCE_KEYHOLE_TOP_LEFT_PADDING_PX,
  DEFAULT_EVIDENCE_KEYHOLE_VIEWPORT_HEIGHT_PX,
  type EvidenceCropLayout,
  type ImageRect,
  isValidEvidenceGeometry,
  projectEvidenceItemToImageRect,
  type ResolvedGeometryProjection,
  resolveGeometryProjection,
  type ScrollAlignment,
  START_ALIGNMENT_INSET_PX,
  selectEvidenceAnnotationScrollItem,
  selectEvidenceKeyholeFrameItem,
  selectEvidenceKeyholeScrollItem,
  toEvidencePercentRect,
} from "./evidenceGeometry.js";
