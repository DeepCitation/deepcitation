/**
 * Floating zoom toolbar — Google Maps style vertical +/− card.
 *
 * Layout (bottom-right corner):
 *   [locate]   ← standalone card (conditional)
 *   [+]        ← zoom in
 *   [divider]
 *   [−]        ← zoom out
 *
 * @packageDocumentation
 */

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BLINK_ENTER_EASING,
  EASE_COLLAPSE,
  EXPANDED_ZOOM_MAX,
  LOCATE_ICON_PULSE_COLOR,
  LOCATE_ICON_PULSE_GROW_MS,
  LOCATE_ICON_PULSE_SCALE,
  LOCATE_ICON_PULSE_SETTLE_MS,
} from "./constants.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { useTranslation } from "./i18n.js";
import { LocateIcon } from "./icons.js";
import { cn } from "./utils.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Props for the floating zoom toolbar. */
export interface ZoomToolbarProps {
  /** Current zoom level (1.0 = 100%). */
  zoom: number;
  /** Called with the new zoom value when the user changes it. */
  onZoomChange: (zoom: number) => void;
  /** Minimum zoom level (floor). */
  zoomFloor: number;
  /** Increment/decrement step for +/− buttons. */
  zoomStep: number;
  /** Maximum zoom level (ceiling). Defaults to EXPANDED_ZOOM_MAX. */
  zoomMax?: number;
  /** When true, renders the "scroll to annotation" button. */
  showLocate?: boolean;
  /** Called when the locate/scroll-to-annotation button is clicked. */
  onLocate?: () => void;
  /**
   * When true, the locate button is emphasized (user has panned away from the annotation).
   * When false, the locate button is de-emphasized (viewport is centered on the annotation).
   */
  locateDirty?: boolean;
  /** Monotonic trigger key for a one-shot locate icon pulse animation. */
  locatePulseKey?: number;
}

type LocatePulseStage = "idle" | "grow" | "settle";

/** Shared card style for both the zoom card and the standalone locate card. */
const CARD_CLASSES =
  "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-md text-slate-700 dark:text-slate-200";

/** Shared zoom button style (40×40 target). */
const ZOOM_BTN_CLASSES =
  "w-10 h-10 flex items-center justify-center text-lg font-light disabled:opacity-35 transition-colors select-none";

/** Clamp and round zoom to 2 decimal places. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

/**
 * Floating zoom toolbar — Google Maps style vertical +/− card.
 * All click/key events are stopped from propagating so the parent's
 * collapse-on-click still works.
 */
export function ZoomToolbar({
  zoom,
  onZoomChange,
  zoomFloor,
  zoomStep,
  zoomMax = EXPANDED_ZOOM_MAX,
  showLocate = false,
  onLocate,
  locateDirty = true,
  locatePulseKey,
}: ZoomToolbarProps) {
  const t = useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [locatePulseStage, setLocatePulseStage] = useState<LocatePulseStage>("idle");
  const locatePulseKeyRef = useRef(locatePulseKey ?? 0);

  useEffect(() => {
    if (locatePulseKey === undefined) return;
    if (locatePulseKey === locatePulseKeyRef.current) return;
    locatePulseKeyRef.current = locatePulseKey;
    if (prefersReducedMotion) return;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const startFrame = requestAnimationFrame(() => {
      setLocatePulseStage("grow");
      settleTimer = setTimeout(() => {
        setLocatePulseStage("settle");
      }, LOCATE_ICON_PULSE_GROW_MS);
      idleTimer = setTimeout(() => {
        setLocatePulseStage("idle");
      }, LOCATE_ICON_PULSE_GROW_MS + LOCATE_ICON_PULSE_SETTLE_MS);
    });
    return () => {
      cancelAnimationFrame(startFrame);
      if (settleTimer) clearTimeout(settleTimer);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [locatePulseKey, prefersReducedMotion]);

  const set = useCallback(
    (next: number) => onZoomChange(clamp(next, zoomFloor, zoomMax)),
    [onZoomChange, zoomFloor, zoomMax],
  );

  /** Shared handler: stop propagation for any mouse/touch/pointer event. */
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  const locateIconStyle: React.CSSProperties =
    locatePulseStage === "grow"
      ? {
          transform: `scale(${LOCATE_ICON_PULSE_SCALE})`,
          color: LOCATE_ICON_PULSE_COLOR,
          transition: `transform ${LOCATE_ICON_PULSE_GROW_MS}ms ${BLINK_ENTER_EASING}, color ${LOCATE_ICON_PULSE_GROW_MS}ms ${BLINK_ENTER_EASING}`,
        }
      : locatePulseStage === "settle"
        ? {
            transform: "scale(1)",
            color: "currentColor",
            transition: `transform ${LOCATE_ICON_PULSE_SETTLE_MS}ms ${EASE_COLLAPSE}, color ${LOCATE_ICON_PULSE_SETTLE_MS}ms ${EASE_COLLAPSE}`,
          }
        : {
            transform: "scale(1)",
            color: "currentColor",
          };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        zIndex: 1,
        pointerEvents: "auto",
      }}
    >
      <div className="flex flex-col items-end gap-2" onClick={stop} onKeyDown={stop}>
        {/* Locate — standalone card above the zoom controls */}
        {showLocate && onLocate && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onLocate();
            }}
            data-dc-scroll-to-annotation=""
            data-dc-locate-pulse-stage={locatePulseStage !== "idle" ? locatePulseStage : undefined}
            className={cn(
              CARD_CLASSES,
              "w-10 h-10 flex items-center justify-center transition-all duration-200",
              locateDirty
                ? "text-sky-700 dark:text-sky-300 opacity-90 hover:bg-slate-50 dark:hover:bg-slate-700"
                : "opacity-45 hover:opacity-65",
            )}
            aria-label={locateDirty ? t("zoom.reCenter") : t("zoom.centered")}
          >
            <span className="size-4 transform-gpu" style={locateIconStyle}>
              <LocateIcon />
            </span>
          </button>
        )}

        {/* Zoom +/− card */}
        <div role="toolbar" aria-label={t("zoom.controls")} className={CARD_CLASSES}>
          {/* Zoom in */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              set(zoom + zoomStep);
            }}
            disabled={zoom >= zoomMax}
            className={cn(
              ZOOM_BTN_CLASSES,
              "rounded-t-lg hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 dark:active:bg-slate-600",
            )}
            aria-label={t("zoom.in")}
          >
            +
          </button>

          {/* Divider */}
          <div className="h-px bg-slate-200 dark:bg-slate-600 mx-2" role="separator" />

          {/* Zoom out — Unicode minus U+2212 */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              set(zoom - zoomStep);
            }}
            disabled={zoom <= zoomFloor}
            className={cn(
              ZOOM_BTN_CLASSES,
              "rounded-b-lg hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 dark:active:bg-slate-600",
            )}
            aria-label={t("zoom.out")}
          >
            {"\u2212"}
          </button>
        </div>
      </div>
    </div>
  );
}
