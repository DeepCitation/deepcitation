/**
 * Compute popover position relative to a trigger element.
 * Ported from src/react/Popover.tsx computePosition().
 */
export function computePosition(
  triggerRect: DOMRect,
  popoverWidth: number,
  popoverHeight: number,
  sideOffset: number,
): { x: number; y: number; side: "top" | "bottom" } {
  // Horizontal: center-align to trigger, clamp to viewport
  let x = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;
  x = Math.max(8, Math.min(x, window.innerWidth - popoverWidth - 8));

  // Vertical: prefer below trigger, flip above if insufficient space
  const spaceBelow = window.innerHeight - triggerRect.bottom - sideOffset;
  const spaceAbove = triggerRect.top - sideOffset;

  let y: number;
  let side: "top" | "bottom";

  if (spaceBelow >= popoverHeight || spaceBelow >= spaceAbove) {
    y = triggerRect.bottom + sideOffset;
    side = "bottom";
  } else {
    y = triggerRect.top - popoverHeight - sideOffset;
    side = "top";
  }

  // Clamp y to viewport edges (defensive for tall popovers)
  y = Math.max(8, Math.min(y, window.innerHeight - popoverHeight - 8));

  return { x: Math.round(x), y: Math.round(y), side };
}
