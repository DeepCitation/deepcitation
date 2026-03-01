/**
 * Haptic feedback utilities for mobile interactions.
 *
 * ## Haptics Guide — keeping feedback tasteful
 *
 * ### When to fire
 * - Discrete "confirm" moments only: expanding to full-screen, collapsing back.
 * - Drag threshold crossings (see useDrawerDragToClose — uses 10ms).
 *
 * ### When NOT to fire
 * - Automatic/programmatic state changes (e.g. pending → verified, data load).
 * - During scroll or continuous drag gestures — only at the moment of release
 *   or threshold crossing, never during the gesture itself.
 * - When another haptic fired within the last 300ms (they blur into noise).
 * - When prefers-reduced-motion: reduce is set. Haptics are an analog of
 *   animation intensity and should respect the same user preference.
 * - On desktop — navigator.vibrate is mobile-only and a no-op there anyway.
 *
 * ### Duration guide
 * - 10ms  "light"    — subtle acknowledgment (drawer drag threshold pattern)
 * - 12ms  "medium"   — clear forward confirmation (expand to full-screen)
 * - 10ms  "collapse" — gentler than expand; user is going back, not forward
 * - 25ms  "heavy"    — reserved for errors/destructive; do not use for info
 *
 * Never exceed 25ms for informational feedback.
 * Never chain two haptics within 300ms.
 *
 * @packageDocumentation
 */

export type HapticEvent = "expand" | "collapse";

const HAPTIC_MS: Record<HapticEvent, number> = {
  expand: 12,
  collapse: 10,
};

let lastHapticAt = 0;
const HAPTIC_MIN_GAP_MS = 300;

/**
 * Fire haptic feedback for a named interaction event.
 * No-ops when the Vibration API is unavailable or when called too soon
 * after a previous haptic (< 300ms gap).
 */
export function triggerHaptic(event: HapticEvent): void {
  const now = Date.now();
  if (now - lastHapticAt < HAPTIC_MIN_GAP_MS) return;
  lastHapticAt = now;
  navigator.vibrate?.(HAPTIC_MS[event]);
}
