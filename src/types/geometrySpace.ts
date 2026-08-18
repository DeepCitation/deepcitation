/**
 * Coordinate space that a verification payload's geometry is expressed in.
 *
 * Every `ScreenBox` / `DeepTextItem` on a verification lives in one of these
 * spaces. Payloads produced before this tag existed carry no `geometrySpace`;
 * they keep being read through the legacy `coordinateOrigin` / `viewBoxOriginY`
 * pair and render exactly as before.
 *
 * - `"canonical-v1"` — scale-1 PDF-point magnitudes with a **top-left** origin
 *   and page rotation already applied. `y` grows downward and the page's
 *   viewBox offset has already been removed at ingestion, so no draw-time flip
 *   and no `viewBoxOriginY` correction apply.
 * - `"pdf-scale1-bottom-left"` — scale-1 PDF-point magnitudes with the raw PDF
 *   **bottom-left** origin. `y` grows upward, so consumers flip at draw time.
 *   This is the space untagged legacy PDF payloads occupy.
 */
export type GeometrySpace = "canonical-v1" | "pdf-scale1-bottom-left";
