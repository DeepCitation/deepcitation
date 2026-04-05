import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const RETRY_INTERVAL_MS = 3000;
const MAX_RETRIES = 20;
/** Pixel tolerance for placeholder vs real image detection. */
const DIMENSION_TOLERANCE_PX = 4;

/**
 * Detects placeholder page images (renders still pending on the server) and
 * polls until the real render is available. The CDN returns a 800×600 placeholder
 * PNG when page renders haven't completed; once ready, it serves the real image
 * at the expected dimensions. Cache-busting query params ensure fresh responses.
 *
 * Returns `{ effectiveSrc, isRetrying }`:
 * - `effectiveSrc`: the src to use on the `<img>` — updated with cache-buster on success
 * - `isRetrying`: true while polling, so the consumer can show a skeleton
 *
 * Call `onImageLoaded(naturalWidth, naturalHeight)` from the img's onLoad handler.
 */
export function useRetryPendingRender(
  src: string,
  expectedDimensions: { width: number; height: number } | null | undefined,
): {
  effectiveSrc: string;
  isRetrying: boolean;
  /** Returns true if the image is a placeholder (polling started). */
  onImageLoaded: (naturalWidth: number, naturalHeight: number) => boolean;
} {
  const [effectiveSrc, setEffectiveSrc] = useState(src);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeRef = useRef<HTMLImageElement | null>(null);
  const baseSrcRef = useRef(src);

  // Reset when src changes externally (different citation clicked).
  useLayoutEffect(() => {
    if (baseSrcRef.current === src) return;
    baseSrcRef.current = src;
    retryCountRef.current = 0;
    setEffectiveSrc(src);
    setIsRetrying(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Cancel any in-flight probe so stale callbacks don't fire.
    if (probeRef.current) {
      probeRef.current.onload = null;
      probeRef.current.onerror = null;
      probeRef.current = null;
    }
  }, [src]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (probeRef.current) {
        probeRef.current.onload = null;
        probeRef.current.onerror = null;
      }
    };
  }, []);

  const isPlaceholder = useCallback(
    (w: number, h: number): boolean => {
      if (!expectedDimensions) return false;
      // Placeholder is always 800×600. Real renders match expectedDimensions
      // within a small tolerance (retina scaling, JPEG rounding).
      return (
        Math.abs(w - expectedDimensions.width) > DIMENSION_TOLERANCE_PX ||
        Math.abs(h - expectedDimensions.height) > DIMENSION_TOLERANCE_PX
      );
    },
    [expectedDimensions],
  );

  const scheduleRetry = useCallback(() => {
    if (retryCountRef.current >= MAX_RETRIES) {
      setIsRetrying(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      retryCountRef.current += 1;
      const probe = new Image();
      probeRef.current = probe;
      const cacheBusted = `${baseSrcRef.current}${baseSrcRef.current.includes("?") ? "&" : "?"}_t=${Date.now()}`;
      probe.onload = () => {
        probeRef.current = null;
        if (!isPlaceholder(probe.naturalWidth, probe.naturalHeight)) {
          // Real image is ready — swap it in.
          setEffectiveSrc(cacheBusted);
          setIsRetrying(false);
        } else {
          // Still a placeholder — try again.
          scheduleRetry();
        }
      };
      probe.onerror = () => {
        probeRef.current = null;
        // Network error — try again.
        scheduleRetry();
      };
      probe.src = cacheBusted;
    }, RETRY_INTERVAL_MS);
  }, [isPlaceholder]);

  const onImageLoaded = useCallback(
    (naturalWidth: number, naturalHeight: number): boolean => {
      if (isPlaceholder(naturalWidth, naturalHeight) && retryCountRef.current < MAX_RETRIES) {
        setIsRetrying(true);
        scheduleRetry();
        return true;
      }
      return false;
    },
    [isPlaceholder, scheduleRetry],
  );

  return { effectiveSrc, isRetrying, onImageLoaded };
}
