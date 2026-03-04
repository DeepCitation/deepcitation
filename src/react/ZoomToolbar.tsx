/**
 * Floating zoom toolbar — extracted from InlineExpandedImage for reuse.
 * Renders −/slider/+/locate buttons with percentage label.
 *
 * The slider thumb uses a custom capsule shape with a subtle grip line
 * (via inset box-shadow) so it looks intentional rather than a raw
 * browser default stretched into a rectangle.
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
import { LocateIcon, ZoomInIcon, ZoomOutIcon } from "./icons.js";
import { cn } from "./utils.js";

// ---------------------------------------------------------------------------
// Thumb styles — capsule with centered grip line via inset box-shadow.
// The grip line is a 1px dark stripe down the vertical center of the thumb.
// This gives the thumb a physical "grabbable" affordance without needing
// a custom div-based slider implementation.
//
// Dimensions: 14×22px pill (rounded-[3px]) — tall enough for fat-finger
// touch while slim enough to not dominate the compact toolbar.
// ---------------------------------------------------------------------------

const THUMB_W = 14; // px
const THUMB_H = 22; // px

// CSS class string that is shared across the slider — track + thumb pseudo-elements.
// The thumb pseudo-element classes are intentionally inline (not in a CSS file)
// because Tailwind's arbitrary-value `[&::-webkit-slider-thumb]` selectors are
// the idiomatic way to style range inputs in a utility-first codebase.
const SLIDER_TRACK_CLASSES =
  "w-20 h-1.5 appearance-none bg-slate-300/70 dark:bg-slate-200/55 rounded-[3px] cursor-pointer outline-none ring-1 ring-inset ring-slate-300/45 dark:ring-slate-400/55";

// We apply thumb dimensions + grip via inline style on the <input> itself
// using a <style> tag scoped by data attribute, because Tailwind arbitrary
// values can't express box-shadow with commas or rgba() reliably across
// all build pipelines (some strip commas inside `[]`).
const THUMB_CSS = `
[data-dc-zoom-slider]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: ${THUMB_W}px;
  height: ${THUMB_H}px;
  border-radius: 3px;
  background: rgba(226, 232, 240, .95);
  cursor: pointer;
  box-shadow: inset 1px 0 0 0 rgba(15,23,42,.16), inset -1px 0 0 0 rgba(15,23,42,.16), 0 1px 2px rgba(15,23,42,.18);
  transition: transform 100ms ease;
}
[data-dc-zoom-slider]::-webkit-slider-thumb:active {
  transform: scale(1.12);
}
[data-dc-zoom-slider]::-moz-range-thumb {
  width: ${THUMB_W}px;
  height: ${THUMB_H}px;
  border-radius: 3px;
  background: rgba(226, 232, 240, .95);
  border: 0;
  cursor: pointer;
  box-shadow: inset 1px 0 0 0 rgba(15,23,42,.16), inset -1px 0 0 0 rgba(15,23,42,.16), 0 1px 2px rgba(15,23,42,.18);
}
@media (prefers-color-scheme: dark) {
  [data-dc-zoom-slider]::-webkit-slider-thumb,
  [data-dc-zoom-slider]::-moz-range-thumb {
    background: rgba(226, 232, 240, .96);
    box-shadow: inset 1px 0 0 0 rgba(15,23,42,.3), inset -1px 0 0 0 rgba(15,23,42,.3), 0 1px 2px rgba(2,6,23,.5);
  }
}
`;

// Singleton style injection: one <style> tag shared across all ZoomToolbar
// instances. Ref-counted so it's removed when the last instance unmounts.
let thumbStyleRefCount = 0;
let thumbStyleElement: HTMLStyleElement | null = null;

function mountThumbStyle() {
  if (thumbStyleRefCount === 0) {
    thumbStyleElement = document.createElement("style");
    thumbStyleElement.setAttribute("data-dc-zoom-thumb", "");
    thumbStyleElement.textContent = THUMB_CSS;
    document.head.appendChild(thumbStyleElement);
  }
  thumbStyleRefCount++;
}

function unmountThumbStyle() {
  thumbStyleRefCount = Math.max(0, thumbStyleRefCount - 1);
  if (thumbStyleRefCount === 0 && thumbStyleElement) {
    thumbStyleElement.remove();
    thumbStyleElement = null;
  }
}

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
  /** Called on slider pointerDown — used by the parent to lock container width. */
  onSliderGrab?: () => void;
}

type LocatePulseStage = "idle" | "grow" | "settle";

/** Clamp and round zoom to 2 decimal places. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

/**
 * Floating zoom toolbar: −, slider, %, locate, +.
 * Renders as a compact glass-morphism bar. All click/key events are
 * stopped from propagating so the parent's collapse-on-click still works.
 */
export function ZoomToolbar({
  zoom,
  onZoomChange,
  zoomFloor,
  zoomStep,
  zoomMax = EXPANDED_ZOOM_MAX,
  showLocate = false,
  onLocate,
  onSliderGrab,
  locateDirty = true,
  locatePulseKey,
}: ZoomToolbarProps) {
  // Inject singleton <style> tag on first mount, remove on last unmount.
  useEffect(() => {
    mountThumbStyle();
    return unmountThumbStyle;
  }, []);

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

  const pct = Math.round(zoom * 100);

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
      <div
        role="toolbar"
        aria-label="Zoom controls"
        className="flex items-center gap-1 rounded-md border border-slate-200/70 dark:border-slate-700/70 bg-white/72 dark:bg-slate-900/72 backdrop-blur-sm text-slate-700 dark:text-slate-200 px-1.5 py-1 shadow-sm"
        onClick={stop}
        onKeyDown={stop}
      >
        {/* Zoom out */}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            set(zoom - zoomStep);
          }}
          disabled={zoom <= zoomFloor}
          className="size-9 flex items-center justify-center rounded-sm hover:bg-slate-200/65 dark:hover:bg-slate-700/65 active:bg-slate-300/70 dark:active:bg-slate-600/70 disabled:opacity-35 transition-colors"
          aria-label="Zoom out"
        >
          <span className="size-4">
            <ZoomOutIcon />
          </span>
        </button>

        {/* Slider */}
        <input
          type="range"
          data-dc-zoom-slider=""
          min={Math.round(zoomFloor * 100)}
          max={zoomMax * 100}
          step={5}
          value={pct}
          onChange={e => {
            e.stopPropagation();
            set(Number(e.target.value) / 100);
          }}
          onClick={stop}
          onPointerDown={e => {
            e.stopPropagation();
            onSliderGrab?.();
          }}
          onMouseDown={stop}
          onTouchStart={stop}
          className={SLIDER_TRACK_CLASSES}
          aria-label="Zoom level"
          aria-valuetext={`${pct}%`}
        />

        {/* Percentage label */}
        <span className="min-w-[4ch] text-center font-mono tabular-nums select-none text-xs leading-none text-slate-600 dark:text-slate-300">
          {pct}%
        </span>

        {/* Scroll to annotation — de-emphasized when viewport is on-target,
            emphasized when user has panned away (locateDirty). */}
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
              "size-9 flex items-center justify-center rounded-sm transition-all duration-200",
              locateDirty
                ? "text-sky-700 dark:text-sky-300 opacity-90 hover:bg-slate-200/65 dark:hover:bg-slate-700/65"
                : "opacity-45 hover:opacity-65",
            )}
            aria-label={locateDirty ? "Re-center on annotation" : "Centered on annotation"}
          >
            <span className="size-4 transform-gpu" style={locateIconStyle}>
              <LocateIcon />
            </span>
          </button>
        )}

        {/* Zoom in */}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            set(zoom + zoomStep);
          }}
          disabled={zoom >= zoomMax}
          className="size-9 flex items-center justify-center rounded-sm hover:bg-slate-200/65 dark:hover:bg-slate-700/65 active:bg-slate-300/70 dark:active:bg-slate-600/70 disabled:opacity-35 transition-colors"
          aria-label="Zoom in"
        >
          <span className="size-4">
            <ZoomInIcon />
          </span>
        </button>
      </div>
    </div>
  );
}
