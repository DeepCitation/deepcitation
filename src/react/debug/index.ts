// Dev-only barrel. Do NOT re-export from src/react/index.ts.
// Importing this module installs window.__dcAnimationDebug in non-production builds.
export { AimOverlay, type AimOverlayProps } from "./AimOverlay.js";
export {
  type AnimationDebugState,
  type FrozenKind,
  type GhostRectsSnapshot,
  getDebugSnapshot,
  getFrozen,
  registerActiveAnimation,
  scaleDuration,
  setDebugState,
  setLastGhostRects,
  subscribeDebug,
} from "./animationDebugStore.js";
export { ControlBar } from "./ControlBar.js";
export { GhostRectsOverlay } from "./GhostRectsOverlay.js";
export { PageAimOverlay } from "./PageAimOverlay.js";
