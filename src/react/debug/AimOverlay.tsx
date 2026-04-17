import { useSyncExternalStore } from "react";
import { getDebugSnapshot, subscribeDebug } from "./animationDebugStore.js";

export type AimOverlayProps = {
  /** Position in container-local pixel space. */
  x: number;
  y: number;
  /** Label shown beside the crosshair (e.g. "focus-aim", "page-aim"). */
  label?: string;
  /** "focus" = orange; "page" = cyan; "ghost-source" = red; "ghost-target" = green. */
  kind?: "focus" | "page" | "ghost-source" | "ghost-target";
};

const KIND_COLOR: Record<NonNullable<AimOverlayProps["kind"]>, string> = {
  focus: "#f59e0b",
  page: "#06b6d4",
  "ghost-source": "#ef4444",
  "ghost-target": "#22c55e",
};

function selectShowAim(): boolean {
  return getDebugSnapshot().showAim;
}

function useShowAim(): boolean {
  return useSyncExternalStore(subscribeDebug, selectShowAim, () => false);
}

/**
 * Dev-only aim crosshair. Renders at (x, y) in container-relative pixels.
 * Must be positioned inside a `position: relative | absolute` parent.
 * Callers should gate the mount with `process.env.NODE_ENV !== "production"`
 * so the module tree-shakes out of prod bundles.
 */
export function AimOverlay({ x, y, label, kind = "focus" }: AimOverlayProps): React.ReactElement | null {
  const show = useShowAim();
  if (!show) return null;
  const color = KIND_COLOR[kind];
  return (
    <div
      aria-hidden="true"
      data-dc-debug-aim={kind}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 2147483646,
      }}
    >
      {/* Horizontal bar */}
      <div
        style={{
          position: "absolute",
          left: -10,
          top: -1,
          width: 20,
          height: 2,
          background: color,
          boxShadow: "0 0 2px rgba(0,0,0,0.45)",
        }}
      />
      {/* Vertical bar */}
      <div
        style={{
          position: "absolute",
          left: -1,
          top: -10,
          width: 2,
          height: 20,
          background: color,
          boxShadow: "0 0 2px rgba(0,0,0,0.45)",
        }}
      />
      {/* Centre dot */}
      <div
        style={{
          position: "absolute",
          left: -3,
          top: -3,
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          border: "1px solid rgba(0,0,0,0.6)",
        }}
      />
      {label ? (
        <div
          style={{
            position: "absolute",
            left: 8,
            top: -14,
            padding: "1px 4px",
            background: color,
            color: "#fff",
            font: "10px/1.2 ui-monospace, SFMono-Regular, monospace",
            whiteSpace: "nowrap",
            borderRadius: 2,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
