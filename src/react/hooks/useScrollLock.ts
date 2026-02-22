/**
 * Ref-counted body scroll lock hook.
 *
 * Multiple CitationComponent instances may open simultaneously (hover overlap).
 * A simple capture-and-restore pattern breaks when locks stack. Instead we
 * ref-count: the first lock captures the original values, the last unlock
 * restores them. This prevents leaving the page permanently scroll-locked.
 *
 * @packageDocumentation
 */

import { useEffect } from "react";

// ---------- Module-level ref-counting ----------
let scrollLockCount = 0;
let scrollLockOriginalOverflow = "";
let scrollLockOriginalPaddingRight = "";

function acquireScrollLock() {
  if (scrollLockCount === 0) {
    scrollLockOriginalOverflow = document.body.style.overflow;
    scrollLockOriginalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  scrollLockCount++;
}

function releaseScrollLock() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = scrollLockOriginalOverflow;
    document.body.style.paddingRight = scrollLockOriginalPaddingRight;
  }
}

/**
 * Lock body scroll when `isLocked` is true.
 *
 * Uses ref-counting so overlapping popover instances don't
 * leave the page permanently scroll-locked.
 */
export function useScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) return;
    acquireScrollLock();
    return () => releaseScrollLock();
  }, [isLocked]);
}
