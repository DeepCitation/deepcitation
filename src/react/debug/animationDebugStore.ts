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
  activeAnims = anim ? [anim] : [];
}

// A single ghost morph runs two parallel WAAPI animations (transform + choreography).
// step/pause/play must drive both together, otherwise scrubbing freezes one half
// while the other keeps animating.
export function registerActiveAnimations(anims: Array<Animation | null>): void {
  if (process.env.NODE_ENV === "production") return;
  activeAnims = anims.filter((a): a is Animation => a !== null);
}

export function stepAnimation(deltaMs: number): void {
  if (process.env.NODE_ENV === "production") return;
  for (const anim of activeAnims) {
    const current = typeof anim.currentTime === "number" ? anim.currentTime : 0;
    anim.currentTime = current + deltaMs;
  }
}

export function pauseAnimation(): void {
  if (process.env.NODE_ENV === "production") return;
  for (const anim of activeAnims) anim.pause();
}

export function playAnimation(): void {
  if (process.env.NODE_ENV === "production") return;
  for (const anim of activeAnims) anim.play();
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
let activeAnims: Animation[] = [];

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

let _overlayMod: Promise<typeof import("./viewTransitionOverlay.js")> | null = null;
const lazyOverlay = () => (_overlayMod ??= import("./viewTransitionOverlay.js"));

function installConsoleApi(): void {
  if (typeof window === "undefined") return;

  const api: ConsoleApi = {
    enable() {
      setDevState({ enabled: true, lastGhostRects: null });
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
      stepAnimation(deltaMs);
    },
    pause() {
      pauseAnimation();
    },
    play() {
      playAnimation();
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
      // Dynamic import: the overlay module isn't statically pulled into this
      // module's graph, so bundlers can split it into its own chunk and strip
      // it from production builds (see `./viewTransitionOverlay.ts` header).
      // Cached so the three methods share one load after the first call.
      const mod = await lazyOverlay();
      return mod.debugDrawAnimationKeyFrames(root ?? null);
    },
    async drawAllAnimationKeyFrames(root) {
      const mod = await lazyOverlay();
      return mod.debugDrawAllAnimationKeyFrames(root ?? null);
    },
    clearAnimationKeyFrames() {
      void lazyOverlay().then(mod => mod.debugClearAnimationKeyFrames());
    },
  };

  (window as unknown as { __dcAnimationDebug?: ConsoleApi }).__dcAnimationDebug = api;
}

installConsoleApi();

// Eagerly load the overlay module in development so that __dcDebugPageExpand
// (installed at overlay module-load time) is available immediately — without
// requiring a prior call to drawAnimationKeyFrames / drawAllAnimationKeyFrames.
// On main, __dcDebugPageExpand was registered by viewTransition.ts at import
// time; moving it to viewTransitionOverlay.ts made it lazy, which broke tests
// that call scan() without first triggering a transition.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  void lazyOverlay();
}
