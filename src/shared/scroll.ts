/**
 * Scroll detection helpers shared between React (Popover.tsx) and
 * vanilla (cdn.ts) runtimes.
 *
 * Pure DOM functions — no framework dependencies.
 */

/**
 * Walk up from `el` to find the page's actual scroll container.
 * Falls back to the viewport scrolling element.
 */
export function findPageScrollEl(el: HTMLElement | null): Element {
  let n: Element | null = el?.parentElement ?? null;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * Check if any ancestor between `target` and `boundary` can scroll
 * vertically in the direction indicated by `deltaY`.
 */
export function canChildScrollVertically(
  target: HTMLElement | null,
  boundary: HTMLElement | null,
  deltaY: number,
): boolean {
  let node = target;
  while (node && node !== boundary) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) {
      if (deltaY > 0 && Math.ceil(node.scrollTop) < node.scrollHeight - node.clientHeight) return true;
      if (deltaY < 0 && node.scrollTop > 0) return true;
    }
    node = node.parentElement;
  }
  return false;
}
