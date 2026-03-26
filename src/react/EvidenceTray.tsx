/**
 * Barrel re-export — preserves all existing import paths.
 *
 * The evidence display components have been split into focused modules
 * under `./evidence/`. This file re-exports everything so that existing
 * `import { ... } from "./EvidenceTray.js"` statements continue to work.
 */
export {
  AnchorTextFocusedImage,
  type EvidenceImages,
  EvidenceTray,
  type ExpandedImageSource,
  InlineExpandedImage,
  resolveEvidenceSrc,
  resolveExpandedImage,
  resolveExpandedImageForPage,
  SearchAnalysisSummary,
  useEvidenceImages,
  useEvidenceImagesForPage,
} from "./evidence/index.js";
