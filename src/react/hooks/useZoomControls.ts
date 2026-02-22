/**
 * Zoom state management hook for image viewers.
 *
 * Manages zoom level with configurable min/max/step, clamping,
 * and helper functions for zoom in/out operations.
 *
 * @packageDocumentation
 */

import { useCallback, useRef, useState } from "react";

export interface UseZoomControlsOptions {
  /** Minimum zoom level (default: 0.5) */
  min?: number;
  /** Maximum zoom level (default: 3.0) */
  max?: number;
  /** Step size for zoom in/out buttons (default: 0.25) */
  step?: number;
  /** Initial zoom level (default: 1.0) */
  initial?: number;
}

export interface UseZoomControlsResult {
  /** Current zoom level */
  zoom: number;
  /** Set zoom level (will be clamped to min/max) */
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  /** Ref mirror of zoom for use in event handlers (avoids stale closures) */
  zoomRef: React.RefObject<number>;
  /** Zoom in by one step */
  zoomIn: () => void;
  /** Zoom out by one step */
  zoomOut: () => void;
  /** Clamp a zoom value to the current min/max range */
  clampZoom: (z: number) => number;
  /** Dynamic zoom floor (may be lower than min for fit-to-screen on narrow viewports) */
  zoomFloor: number;
  /** Set the dynamic zoom floor */
  setZoomFloor: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Manages zoom state with clamping, step controls, and a ref mirror.
 */
export function useZoomControls({
  min = 0.5,
  max = 3.0,
  step = 0.25,
  initial = 1.0,
}: UseZoomControlsOptions = {}): UseZoomControlsResult {
  const [zoom, setZoom] = useState(initial);
  const [zoomFloor, setZoomFloor] = useState(min);

  // Ref mirror of zoom for touch event handlers (avoids stale closures in pinch gesture)
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const clampZoom = useCallback(
    (z: number) => {
      return Math.max(zoomFloor, Math.min(max, Math.round(z * 100) / 100));
    },
    [zoomFloor, max],
  );

  const zoomIn = useCallback(() => {
    setZoom(z => clampZoom(z + step));
  }, [clampZoom, step]);

  const zoomOut = useCallback(() => {
    setZoom(z => clampZoom(z - step));
  }, [clampZoom, step]);

  return {
    zoom,
    setZoom,
    zoomRef,
    zoomIn,
    zoomOut,
    clampZoom,
    zoomFloor,
    setZoomFloor,
  };
}
