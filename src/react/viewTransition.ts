import { flushSync } from "react-dom";

/**
 * View-transition name applied to evidence image elements (keyhole strip,
 * expanded-keyhole shell, expanded-page shell). Only the visible slot carries
 * a captured snapshot — hidden (display:none) slots are ignored by the browser.
 */
export const DC_EVIDENCE_VT_NAME = "dc-evidence";

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
  options?: { isCollapse?: boolean; skipAnimation?: boolean },
): void {
  const skip = options?.skipAnimation;
  if (skip || typeof document === "undefined" || !("startViewTransition" in document)) {
    update();
    return;
  }
  if (options?.isCollapse) {
    document.documentElement.dataset.dcCollapse = "";
  }
  // Safe cast: the `"startViewTransition" in document` guard above ensures
  // this property exists at runtime before we reach this point.
  const transition = (
    document as Document & { startViewTransition: (cb: () => void) => { finished: Promise<void> } }
  ).startViewTransition(() => {
    flushSync(update);
  });
  transition.finished
    .then(() => {
      delete document.documentElement.dataset.dcCollapse;
    })
    .catch(() => {
      // Clean up dataset even if the transition is interrupted or fails
      delete document.documentElement.dataset.dcCollapse;
    });
}
