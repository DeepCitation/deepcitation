// Dev-only animation debug store.
// All public functions early-return in production via `process.env.NODE_ENV`
// static substitution. Bundlers (esbuild/tsup via size-limit, Vite, webpack)
// fold the dev branch away and the `devStore` reference tree-shakes.

export type FrozenKind = "vt-expand" | "vt-collapse" | "page-expand" | "page-collapse" | "any";

export type GhostRectsSnapshot = {
  source: DOMRect | null;
  target: DOMRect | null;
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
  if (process.env.NODE_ENV === "production") return;
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
  };

  (window as unknown as { __dcAnimationDebug?: ConsoleApi }).__dcAnimationDebug = api;
}

installConsoleApi();
