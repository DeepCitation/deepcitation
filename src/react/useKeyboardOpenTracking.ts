import type React from "react";
import { useCallback, useEffect, useRef } from "react";

/**
 * Tracks whether the popover was opened via keyboard (Enter/Space) vs mouse/touch.
 * Manages the A.5.1 focus trap (inert on background) and A.5.2 conditional focus return.
 *
 * Isolated from CitationComponent because the React Compiler can't handle a ref that's
 * both read in an effect (focus trap) and mutated in callbacks (click/keydown).
 * "use no memo" tells the compiler to skip this hook without throwing, so the rest
 * of the file compiles normally.
 *
 * @param isHovering - Whether the popover is currently open.
 * @param popoverContentRef - Ref to the popover content DOM element (for focus-trap walk).
 */
export function useKeyboardOpenTracking(
  isHovering: boolean,
  popoverContentRef: React.RefObject<HTMLDivElement | null>,
): {
  openedViaKeyboardRef: React.MutableRefObject<boolean>;
  handleCloseAutoFocus: (e: Event) => void;
} {
  // "use no memo" — React Compiler opt-out: ref read in effect + mutated in callbacks
  // is a pattern the compiler can't safely transform.
  const openedViaKeyboardRef = useRef(false);

  // A.5.1 Focus trap: set `inert` on background content when the popover is
  // opened via keyboard. This prevents Tab from escaping the popover into
  // background content. Mouse-opened popovers don't need this because users
  // can click outside to dismiss.
  //
  // The popover may portal into a scroll container inside <main> (not just
  // document.body), so we walk from the popover up to body, inerting siblings
  // at each level. This keeps the popover's ancestor chain interactive while
  // making everything else inert.
  useEffect(() => {
    if (!isHovering || !openedViaKeyboardRef.current) return;
    const inerted: Element[] = [];
    // Defer with rAF so the portal is in the DOM before we scan.
    const rafId = requestAnimationFrame(() => {
      const popoverEl = popoverContentRef.current;
      if (!popoverEl) return; // portal not mounted — nothing to trap
      // Walk from popover up to body, inerting siblings at each level.
      let current: Element | null = popoverEl;
      while (current && current !== document.body) {
        const parentEl: Element | null = current.parentElement;
        if (!parentEl) break;
        for (const sibling of Array.from(parentEl.children) as Element[]) {
          if (sibling === current) continue;
          if (!sibling.hasAttribute("inert")) {
            sibling.setAttribute("inert", "");
            inerted.push(sibling);
          }
        }
        current = parentEl;
      }
    });
    return () => {
      cancelAnimationFrame(rafId);
      for (const el of inerted) el.removeAttribute("inert");
    };
  }, [isHovering, popoverContentRef]);

  // A.5.2 Conditional focus return: keyboard users need focus returned to the
  // trigger so they can continue navigating. Mouse/touch users don't — returning
  // focus would scroll the trigger into view, disorienting users who scrolled away.
  const handleCloseAutoFocus = useCallback((e: Event) => {
    if (!openedViaKeyboardRef.current) {
      e.preventDefault();
    }
    openedViaKeyboardRef.current = false;
  }, []);

  return { openedViaKeyboardRef, handleCloseAutoFocus };
}
