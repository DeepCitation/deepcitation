import { flushSync } from "react-dom";

/**
 * View-transition name applied to evidence image elements (keyhole strip,
 * expanded-keyhole shell, expanded-page shell). Only the visible slot carries
 * a captured snapshot — hidden (display:none) slots are ignored by the browser.
 */
export const DC_EVIDENCE_VT_NAME = "dc-evidence";

/**
 * Depth counter for in-flight View Transitions. Dismiss handlers check this to
 * avoid closing the popover during expand/collapse — `flushSync` inside the VT
 * callback can make the clicked element `display: none`, causing outside-click
 * handlers to misidentify the target as "outside" the popover.
 *
 * A counter (not boolean) handles back-to-back transitions: if a second VT
 * starts before the first finishes, the first's cleanup decrements without
 * prematurely unguarding the second.
 */
let _transitionDepth = 0;
export function isViewTransitioning(): boolean {
  return _transitionDepth > 0;
}

/**
 * Wraps a state update in a View Transition so the browser morphs the
 * geometry + cross-fades between the old and new evidence image elements.
 *
 * Falls back to a plain synchronous update when:
 * - View Transitions API is unsupported (Firefox as of early 2026)
 * - `prefers-reduced-motion` is active (skip flag)
 * - SSR (no `document`)
 */
export function startEvidenceViewTransition(
  update: () => void,
  options?: { isCollapse?: boolean; isPageExpand?: boolean; skipAnimation?: boolean },
): void {
  const skip = options?.skipAnimation;
  if (skip || typeof document === "undefined" || !("startViewTransition" in document)) {
    // Synchronous fallback — no async transition in flight, so _transitioning
    // stays false. Dismiss handlers don't need guarding on this path.
    update();
    return;
  }
  _transitionDepth++;
  if (options?.isCollapse) {
    document.documentElement.dataset.dcCollapse = "";
  }
  if (options?.isPageExpand) {
    document.documentElement.dataset.dcPageExpand = "";
  }

  // Safe cast: the `"startViewTransition" in document` guard above ensures
  // this property exists at runtime before we reach this point.
  const transition = (
    document as Document & {
      startViewTransition: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
    }
  ).startViewTransition(() => {
    flushSync(update);
  });
  // Log VT failures in development — the most common cause is duplicate
  // view-transition-name values in the live DOM after flushSync.
  if (process.env.NODE_ENV !== "production") {
    transition.ready.catch((e: unknown) => {
      console.warn("[VT] transition.ready rejected — animation skipped:", e);
    });
  }
  const cleanup = () => {
    if (process.env.NODE_ENV !== "production" && _transitionDepth === 0) {
      console.warn("[VT] cleanup called with _transitionDepth already at 0");
    }
    _transitionDepth = Math.max(0, _transitionDepth - 1);
    delete document.documentElement.dataset.dcCollapse;
    delete document.documentElement.dataset.dcPageExpand;
  };
  transition.finished.then(cleanup).catch(cleanup);
}
