import { useEffect, useState } from "react";
import { SPINNER_TIMEOUT_MS } from "./animationConstants.js";
import type { SpinnerStage } from "./CitationStatusIndicator.js";

/**
 * Manages the 3-stage spinner progression: active (0–5s) → slow (5–15s) → stale (15s+).
 *
 * Uses a setState-during-render reset pattern to eagerly reset to "active" when a new
 * animation cycle starts. This avoids the previous cleanup-setState approach that caused
 * a React Compiler bailout.
 *
 * "use no memo" — React Compiler opt-out: the timer + render-phase setState boundary
 * cannot be safely transformed by the compiler.
 */
export function useSpinnerStage(isLoading: boolean, isPending: boolean, hasDefinitiveResult: boolean): SpinnerStage {
  const shouldAnimate = (isLoading || isPending) && !hasDefinitiveResult;
  const [stage, setStage] = useState<SpinnerStage>("active");

  // Reset to "active" eagerly when a new animation cycle starts (setState-during-render
  // pattern — avoids the previous cleanup setState which caused a React Compiler bailout).
  const [prevShouldAnimate, setPrevShouldAnimate] = useState(shouldAnimate);
  if (shouldAnimate && !prevShouldAnimate) {
    setPrevShouldAnimate(true);
    setStage("active");
  } else if (!shouldAnimate && prevShouldAnimate) {
    setPrevShouldAnimate(false);
  }

  useEffect(() => {
    if (!shouldAnimate) return;
    const t1 = setTimeout(() => setStage("slow"), SPINNER_TIMEOUT_MS);
    const t2 = setTimeout(() => setStage("stale"), SPINNER_TIMEOUT_MS * 3);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [shouldAnimate]);

  // When not animating, always return "active" (derived, no setState needed)
  return shouldAnimate ? stage : "active";
}
