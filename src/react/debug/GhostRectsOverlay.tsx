import { useSyncExternalStore } from "react";
import { type AnimationDebugState, getDebugSnapshot, subscribeDebug } from "./animationDebugStore.js";

function useDebugState(): AnimationDebugState {
  return useSyncExternalStore(subscribeDebug, getDebugSnapshot, getDebugSnapshot);
}

/**
 * Fixed-position overlay that paints the last captured ghost source rect (red)
 * and target rect (green) in viewport coordinates. Active while `showGhostRects`
 * is on and `lastGhostRects` is populated by `startEvidencePageExpandTransition`.
 *
 * Callers MUST gate mounting under `process.env.NODE_ENV !== "production"`.
 */
export function GhostRectsOverlay(): React.ReactElement | null {
  const { showGhostRects, lastGhostRects } = useDebugState();
  if (!showGhostRects || !lastGhostRects) return null;
  const { source, target } = lastGhostRects;
  return (
    <div
      aria-hidden="true"
      data-dc-debug-ghost-overlay=""
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483644,
      }}
    >
      {source ? <RectBorder rect={source} color="#ef4444" label="ghost source" /> : null}
      {target ? <RectBorder rect={target} color="#22c55e" label="ghost target" /> : null}
    </div>
  );
}

function RectBorder({ rect, color, label }: { rect: DOMRect; color: string; label: string }): React.ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        border: `2px dashed ${color}`,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: -14,
          padding: "1px 4px",
          background: color,
          color: "#fff",
          font: "10px/1.2 ui-monospace, SFMono-Regular, monospace",
          whiteSpace: "nowrap",
          borderRadius: 2,
        }}
      >
        {label} {Math.round(rect.width)}×{Math.round(rect.height)}
      </div>
    </div>
  );
}
