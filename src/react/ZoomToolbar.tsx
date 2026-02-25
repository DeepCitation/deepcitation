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
import { useCallback } from "react";
import { EXPANDED_ZOOM_MAX } from "./constants.js";
import { LocateIcon, ZoomInIcon, ZoomOutIcon } from "./icons.js";

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
const SLIDER_TRACK_CLASSES = "w-20 h-1.5 appearance-none bg-white/25 rounded-[3px] cursor-pointer outline-none";

// We apply thumb dimensions + grip via inline style on the <input> itself
// using a <style> tag scoped by data attribute, because Tailwind arbitrary
// values can't express box-shadow with commas or rgba() reliably across
// all build pipelines (some strip commas inside `[]`).
const THUMB_STYLE_TAG = `
[data-dc-zoom-slider]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: ${THUMB_W}px;
  height: ${THUMB_H}px;
  border-radius: 3px;
  background: white;
  cursor: pointer;
  box-shadow: inset 1px 0 0 0 rgba(0,0,0,.12), inset -1px 0 0 0 rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.25);
  transition: transform 100ms ease;
}
[data-dc-zoom-slider]::-webkit-slider-thumb:active {
  transform: scale(1.12);
}
[data-dc-zoom-slider]::-moz-range-thumb {
  width: ${THUMB_W}px;
  height: ${THUMB_H}px;
  border-radius: 3px;
  background: white;
  border: 0;
  cursor: pointer;
  box-shadow: inset 1px 0 0 0 rgba(0,0,0,.12), inset -1px 0 0 0 rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.25);
}
`;

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
  /** Called on slider pointerDown — used by the parent to lock container width. */
  onSliderGrab?: () => void;
}

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
}: ZoomToolbarProps) {
  const pct = Math.round(zoom * 100);

  const set = useCallback(
    (next: number) => onZoomChange(clamp(next, zoomFloor, zoomMax)),
    [onZoomChange, zoomFloor, zoomMax],
  );

  /** Shared handler: stop propagation for any mouse/touch/pointer event. */
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

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
      <style>{THUMB_STYLE_TAG}</style>
      <div
        role="toolbar"
        aria-label="Zoom controls"
        className="flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white/90 rounded-md px-1.5 py-1 shadow-md"
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
          className="size-9 flex items-center justify-center rounded-sm hover:bg-white/15 active:bg-white/25 disabled:opacity-30 transition-colors"
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
        <span className="min-w-[4ch] text-center font-mono tabular-nums select-none text-xs leading-none">{pct}%</span>

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
            className={`size-9 flex items-center justify-center rounded-sm transition-all duration-200 ${
              locateDirty ? "opacity-100 hover:bg-white/15 active:bg-white/25" : "opacity-30 hover:opacity-60"
            }`}
            aria-label={locateDirty ? "Re-center on annotation" : "Centered on annotation"}
          >
            <span className="size-4">
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
          className="size-9 flex items-center justify-center rounded-sm hover:bg-white/15 active:bg-white/25 disabled:opacity-30 transition-colors"
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
