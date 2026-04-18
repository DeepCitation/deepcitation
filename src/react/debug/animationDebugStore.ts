// Dev-only animation debug store.
// All public functions early-return in production via `process.env.NODE_ENV`
// static substitution. Bundlers (esbuild/tsup via size-limit, Vite, webpack)
// fold the dev branch away and the `devStore` reference tree-shakes.

export type FrozenKind = "vt-expand" | "vt-collapse" | "page-expand" | "page-collapse" | "any";

export type GhostRectsSnapshot = {
  source: DOMRect | null;
  target: DOMRect | null;
  /** Direction the most recent ghost traveled. Used by the keyframe overlay to pick hue/label. */
  direction?: "expand" | "collapse";
  /** Spotlight rect at animation start — null when the transition had no clip-path iris. */
  spotlight?: DOMRect | null;
  /**
   * Offset from the ghost element's top-left to the citation anchor point
   * (inside the ghost). Under pure-translate animation this is constant across
   * frames, so one scalar pair is enough to compute the anchor's viewport
   * position at any sampled rect: `rect.left + anchorInGhostX`.
   */
  anchorInGhostX?: number;
  anchorInGhostY?: number;
  /**
   * Per-rAF samples of the ghost's actual bounding rect during the animation,
   * captured by the animation pipeline. `t` is normalized progress (0..1) at
   * the time of capture. This is the ground truth for the overlay — every
   * entry corresponds to a visually-occupied position during the real animation.
   */
  samples?: Array<{ t: number; rect: DOMRect }>;
};

export type AnimationDebugState = {
  enabled: boolean;
  speed: number;
  frozen: { kind: FrozenKind; progress: number } | null;
  showAim: boolean;
  showGhostRects: boolean;
  forceReducedMotion: boolean;
  lastGhostRects: GhostRectsSnapshot | null;
};

// ---- Public dev-only API (prod = identity/no-op) ----

export function scaleDuration(ms: number): number {
  if (process.env.NODE_ENV === "production") return ms;
  const state = devState;
  if (!state.enabled || state.speed === 1) return ms;
  const scaled = ms / state.speed;
  return scaled > 0 ? scaled : ms;
}

export function getFrozen(kind: FrozenKind): number | null {
  if (process.env.NODE_ENV === "production") return null;
  const state = devState;
  if (!state.enabled || !state.frozen) return null;
  if (state.frozen.kind !== "any" && state.frozen.kind !== kind) return null;
  return Math.max(0, Math.min(1, state.frozen.progress));
}

export function setLastGhostRects(rects: GhostRectsSnapshot | null): void {
  if (process.env.NODE_ENV === "production") return;
  setDevState({ lastGhostRects: rects });
}

export function registerActiveAnimation(anim: Animation | null): void {
  if (process.env.NODE_ENV === "production") return;
  activeAnim = anim;
}

export function stepAnimation(deltaMs: number): void {
  if (process.env.NODE_ENV === "production") return;
  if (!activeAnim) return;
  const current = typeof activeAnim.currentTime === "number" ? activeAnim.currentTime : 0;
  activeAnim.currentTime = current + deltaMs;
}

export function pauseAnimation(): void {
  if (process.env.NODE_ENV === "production") return;
  activeAnim?.pause();
}

export function playAnimation(): void {
  if (process.env.NODE_ENV === "production") return;
  activeAnim?.play();
}

export function getDebugSnapshot(): AnimationDebugState {
  if (process.env.NODE_ENV === "production") return PROD_SNAPSHOT;
  return devState;
}

export function subscribeDebug(listener: () => void): () => void {
  if (process.env.NODE_ENV === "production") return () => {};
  devListeners.add(listener);
  return () => {
    devListeners.delete(listener);
  };
}

export function setDebugState(patch: Partial<AnimationDebugState>): void {
  if (process.env.NODE_ENV === "production") return;
  setDevState(patch);
}

// ---- Dev-only internals (all references guarded by NODE_ENV checks above) ----

const PROD_SNAPSHOT: AnimationDebugState = {
  enabled: false,
  speed: 1,
  frozen: null,
  showAim: false,
  showGhostRects: false,
  forceReducedMotion: false,
  lastGhostRects: null,
};

let devState: AnimationDebugState = { ...PROD_SNAPSHOT };
const devListeners = new Set<() => void>();
let activeAnim: Animation | null = null;

function setDevState(patch: Partial<AnimationDebugState>): void {
  devState = { ...devState, ...patch };
  for (const l of devListeners) l();
}

// ---- Console API (installed once in dev) ----

type ConsoleApi = {
  enable(): void;
  disable(): void;
  setSpeed(x: number): void;
  scrub(progress: number, kind?: FrozenKind): void;
  step(deltaMs: number): void;
  pause(): void;
  play(): void;
  showAimOverlay(on: boolean): void;
  showGhostRects(on: boolean): void;
  forceReducedMotion(on: boolean): void;
  snapshot(): AnimationDebugState;
  drawAnimationKeyFrames(root?: ParentNode | null): unknown;
  drawAllAnimationKeyFrames(root?: ParentNode | null): unknown;
  clearAnimationKeyFrames(): void;
};

function clampSpeed(x: number): number {
  if (!Number.isFinite(x)) return 1;
  return Math.max(0.05, Math.min(10, x));
}

function clampProgress(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(1, p));
}

function installConsoleApi(): void {
  if (typeof window === "undefined") return;

  const api: ConsoleApi = {
    enable() {
      setDevState({ enabled: true });
    },
    disable() {
      setDevState({
        enabled: false,
        frozen: null,
        speed: 1,
        showAim: false,
        showGhostRects: false,
        forceReducedMotion: false,
      });
    },
    setSpeed(x) {
      setDevState({ speed: clampSpeed(x) });
    },
    scrub(progress, kind = "any") {
      setDevState({ frozen: { kind, progress: clampProgress(progress) } });
    },
    step(deltaMs) {
      if (!activeAnim) return;
      const current = typeof activeAnim.currentTime === "number" ? activeAnim.currentTime : 0;
      activeAnim.currentTime = current + deltaMs;
    },
    pause() {
      activeAnim?.pause();
    },
    play() {
      activeAnim?.play();
    },
    showAimOverlay(on) {
      setDevState({ showAim: on });
    },
    showGhostRects(on) {
      setDevState({ showGhostRects: on });
    },
    forceReducedMotion(on) {
      setDevState({ forceReducedMotion: on });
    },
    snapshot() {
      return devState;
    },
    async drawAnimationKeyFrames(root) {
      // Dynamic import avoids a static cycle with viewTransition.ts (which
      // already statically imports this module). The body is only evaluated
      // at call-time, after both modules have fully initialized.
      const mod = await import("../viewTransition.js");
      return mod.debugDrawAnimationKeyFrames(root ?? null);
    },
    async drawAllAnimationKeyFrames(root) {
      const mod = await import("../viewTransition.js");
      return mod.debugDrawAllAnimationKeyFrames(root ?? null);
    },
    async clearAnimationKeyFrames() {
      const mod = await import("../viewTransition.js");
      mod.debugClearAnimationKeyFrames();
    },
  };

  (window as unknown as { __dcAnimationDebug?: ConsoleApi }).__dcAnimationDebug = api;
}

installConsoleApi();
