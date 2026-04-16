import { useCallback, useSyncExternalStore } from "react";
import {
  type AnimationDebugState,
  type FrozenKind,
  getDebugSnapshot,
  setDebugState,
  subscribeDebug,
} from "./animationDebugStore.js";

const SPEED_OPTIONS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
const FROZEN_KINDS: FrozenKind[] = ["any", "page-expand", "page-collapse"];

function serverSnapshot(): AnimationDebugState {
  return getDebugSnapshot();
}

function useDebugState(): AnimationDebugState {
  return useSyncExternalStore(subscribeDebug, getDebugSnapshot, serverSnapshot);
}

/**
 * Dev-only harness control bar. Mutates `animationDebugStore` via `setDebugState`.
 * Must be rendered only under `process.env.NODE_ENV !== "production"` — the
 * component itself does not self-gate so callers control mount lifecycle.
 */
export function ControlBar(): React.ReactElement {
  const s = useDebugState();

  const onToggleEnabled = useCallback(() => {
    setDebugState({ enabled: !s.enabled });
  }, [s.enabled]);

  const onSpeed = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setDebugState({ speed: Number(e.target.value) });
  }, []);

  const onScrubKind = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const kind = e.target.value as FrozenKind | "off";
      if (kind === "off") {
        setDebugState({ frozen: null });
        return;
      }
      const progress = s.frozen?.progress ?? 0.5;
      setDebugState({ frozen: { kind, progress } });
    },
    [s.frozen?.progress],
  );

  const onScrubProgress = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const progress = Number(e.target.value);
      const kind = s.frozen?.kind ?? "any";
      setDebugState({ frozen: { kind, progress } });
    },
    [s.frozen?.kind],
  );

  const onAim = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDebugState({ showAim: e.target.checked });
  }, []);

  const onGhostRects = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDebugState({ showGhostRects: e.target.checked });
  }, []);

  const onReducedMotion = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDebugState({ forceReducedMotion: e.target.checked });
  }, []);

  const onStep = useCallback((deltaMs: number) => {
    const api = (window as unknown as { __dcAnimationDebug?: { step: (n: number) => void } }).__dcAnimationDebug;
    api?.step(deltaMs);
  }, []);

  const onPause = useCallback(() => {
    const api = (window as unknown as { __dcAnimationDebug?: { pause: () => void } }).__dcAnimationDebug;
    api?.pause();
  }, []);

  const onPlay = useCallback(() => {
    const api = (window as unknown as { __dcAnimationDebug?: { play: () => void } }).__dcAnimationDebug;
    api?.play();
  }, []);

  return (
    <div
      data-dc-debug-controlbar=""
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2147483645,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        background: "#111827",
        color: "#e5e7eb",
        font: "12px/1.3 ui-monospace, SFMono-Regular, monospace",
        borderBottom: "1px solid #374151",
      }}
    >
      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input type="checkbox" checked={s.enabled} onChange={onToggleEnabled} />
        enabled
      </label>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        speed
        <select value={s.speed} onChange={onSpeed} style={selectStyle}>
          {SPEED_OPTIONS.map(v => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        scrub
        <select value={s.frozen?.kind ?? "off"} onChange={onScrubKind} style={selectStyle}>
          <option value="off">off</option>
          {FROZEN_KINDS.map(k => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={s.frozen?.progress ?? 0.5}
          onChange={onScrubProgress}
          disabled={!s.frozen}
          style={{ width: 140 }}
        />
        <span style={{ width: 32, textAlign: "right" }}>{(s.frozen?.progress ?? 0.5).toFixed(2)}</span>
      </label>

      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <button type="button" onClick={onPause} style={buttonStyle}>
          pause
        </button>
        <button type="button" onClick={onPlay} style={buttonStyle}>
          play
        </button>
        <button type="button" onClick={() => onStep(-16)} style={buttonStyle}>
          ‹ step
        </button>
        <button type="button" onClick={() => onStep(16)} style={buttonStyle}>
          step ›
        </button>
      </div>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input type="checkbox" checked={s.showAim} onChange={onAim} />
        aim
      </label>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input type="checkbox" checked={s.showGhostRects} onChange={onGhostRects} />
        ghost rects
      </label>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input type="checkbox" checked={s.forceReducedMotion} onChange={onReducedMotion} />
        reduced-motion
      </label>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "#1f2937",
  color: "#e5e7eb",
  border: "1px solid #374151",
  borderRadius: 3,
  padding: "2px 4px",
  font: "inherit",
};

const buttonStyle: React.CSSProperties = {
  background: "#1f2937",
  color: "#e5e7eb",
  border: "1px solid #374151",
  borderRadius: 3,
  padding: "2px 8px",
  font: "inherit",
  cursor: "pointer",
};
