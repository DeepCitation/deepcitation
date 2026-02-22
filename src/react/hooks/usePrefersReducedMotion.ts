import { useEffect, useRef, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Returns `true` when the user's OS-level accessibility setting requests
 * reduced motion. Components should use this to skip or shorten animations.
 *
 * SSR-safe: defaults to `false` when `window.matchMedia` is unavailable.
 */
export function usePrefersReducedMotion(): boolean {
  // Always initialize to false to match SSR output and prevent hydration mismatches.
  // The real value is synced in useEffect after the first client paint.
  const [prefersReduced, setPrefersReduced] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const mql = window.matchMedia(QUERY);
    setPrefersReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => {
      if (mountedRef.current) {
        setPrefersReduced(e.matches);
      }
    };
    mql.addEventListener("change", onChange);
    return () => {
      mountedRef.current = false;
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return prefersReduced;
}
