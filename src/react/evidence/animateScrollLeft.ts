import { POPOVER_MORPH_EXPAND_MS } from "../constants.js";

/**
 * Scroll an element to a target scrollLeft over `POPOVER_MORPH_EXPAND_MS` using
 * an ease-out curve. Much faster than `behavior: "smooth"` (~500-800ms browser default).
 * Returns a cancel function to abort the in-flight animation.
 */
export function animateScrollLeft(el: HTMLElement, targetLeft: number): () => void {
  const start = el.scrollLeft;
  const delta = targetLeft - start;
  let cancelled = false;
  if (delta === 0) return () => {};
  const t0 = performance.now();
  const step = (now: number) => {
    if (cancelled) return;
    const elapsed = now - t0;
    if (elapsed >= POPOVER_MORPH_EXPAND_MS) {
      el.scrollLeft = targetLeft;
      return;
    }
    // ease-out: 1 - (1 - t)^3
    const t = elapsed / POPOVER_MORPH_EXPAND_MS;
    el.scrollLeft = start + delta * (1 - (1 - t) ** 3);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return () => {
    cancelled = true;
  };
}
