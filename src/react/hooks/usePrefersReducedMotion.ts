import { useEffect, useState, useSyncExternalStore } from "react";
import { getDebugSnapshot, subscribeDebug } from "../debug/animationDebugStore.js";

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

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    setPrefersReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setPrefersReduced(e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  const debugForce = useDebugForceReducedMotion();
  return prefersReduced || debugForce;
}

function getDebugForce(): boolean {
  return getDebugSnapshot().forceReducedMotion;
}

function getServerDebugForce(): boolean {
  return false;
}

function useDebugForceReducedMotion(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  // biome-ignore lint/correctness/useHookAtTopLevel: process.env.NODE_ENV is a compile-time constant.
  return useSyncExternalStore(subscribeDebug, getDebugForce, getServerDebugForce);
}
