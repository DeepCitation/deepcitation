import { useEffect, useState } from "react";

const QUERY = "(pointer: coarse)";

/**
 * React hook that detects touch devices and listens for pointer capability changes.
 *
 * Returns `true` when the primary pointing device is coarse (touch).
 * Listens for media query changes so it reacts to tablet mode switches.
 *
 * SSR-safe: defaults to `false` when `window.matchMedia` is unavailable.
 */
export function useIsTouchDevice(): boolean {
  // Always initialize to false to match SSR output and prevent hydration mismatches.
  // The real value is synced in useEffect after the first client paint.
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    setIsTouchDevice(mql.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setIsTouchDevice(e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return isTouchDevice;
}
