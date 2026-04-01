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
  // Visible viewport width — excludes scrollbar (unlike window.innerWidth / 100vw).
  const vw = document.documentElement.clientWidth;

  // Horizontal: center-align to trigger, clamp to visible viewport
  let x = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;
  x = Math.max(8, Math.min(x, vw - popoverWidth - 8));

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

  // Clamp y: guards top-side placement from going above viewport (y < 8)
  // and bottom-side placement from overflowing below (y > innerHeight - height - 8).
  y = Math.max(8, Math.min(y, window.innerHeight - popoverHeight - 8));

  // Coords are viewport-relative; reposition() converts to container-relative.
  return { x: Math.round(x), y: Math.round(y), side };
}
