/**
 * Ref-counted body scroll lock.
 *
 * Multiple components (CitationComponent popovers, CitationDrawer) may need
 * to lock body scroll simultaneously. A simple capture-and-restore pattern
 * breaks when locks stack. Instead we ref-count: the first lock captures
 * the original values, the last unlock restores them.
 *
 * Also sets `overscroll-behavior: none` to prevent mobile pull-to-refresh
 * while the lock is active.
 *
 * @packageDocumentation
 */

let scrollLockCount = 0;
let scrollLockOriginalOverflow = "";
let scrollLockOriginalPaddingRight = "";
let scrollLockOriginalOverscrollBehavior = "";

/**
 * Acquire a body scroll lock. The first call captures original styles;
 * subsequent calls increment the ref count.
 */
export function acquireScrollLock(): void {
  if (scrollLockCount === 0) {
    scrollLockOriginalOverflow = document.body.style.overflow;
    scrollLockOriginalPaddingRight = document.body.style.paddingRight;
    scrollLockOriginalOverscrollBehavior = document.body.style.overscrollBehavior;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  scrollLockCount++;
}

/**
 * Release a body scroll lock. When the ref count reaches zero,
 * original styles are restored.
 */
export function releaseScrollLock(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = scrollLockOriginalOverflow;
    document.body.style.paddingRight = scrollLockOriginalPaddingRight;
    document.body.style.overscrollBehavior = scrollLockOriginalOverscrollBehavior;
  }
}
