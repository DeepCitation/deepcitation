/**
 * Singleton popover management: create, position, show/hide.
 */
import { buildExpandedView, buildPopoverContent } from "./content.js";
import { computePosition } from "./positioning.js";
import type { PopoverState, VerificationData } from "./types.js";

const SIDE_OFFSET = 8;

export function createPopoverState(): PopoverState {
  return {
    el: null,
    expandedEl: null,
    activeTrigger: null,
    isExpanded: false,
  };
}

function ensurePopoverEl(state: PopoverState): HTMLDivElement {
  if (!state.el) {
    const el = document.createElement("div");
    el.className = "dc-popover";
    el.style.position = "fixed";
    el.style.zIndex = "10000";
    el.style.display = "none";
    document.body.appendChild(el);
    state.el = el;
  }
  return state.el;
}

export function showPopover(state: PopoverState, trigger: HTMLElement, data: VerificationData): void {
  // If clicking the same trigger, close instead
  if (state.activeTrigger === trigger && state.el?.style.display !== "none") {
    hidePopover(state);
    return;
  }

  const el = ensurePopoverEl(state);

  // Clear previous content
  el.innerHTML = "";
  const content = buildPopoverContent(data);
  el.appendChild(content);

  // Attach image expand handler
  const img = el.querySelector("[data-dc-expandable]") as HTMLImageElement | null;
  if (img) {
    img.style.cursor = "pointer";
    img.addEventListener("click", e => {
      e.stopPropagation();
      showExpanded(state, img.src);
    });
  }

  // Show and position
  el.style.display = "block";
  state.activeTrigger = trigger;

  // Position after display so we can measure
  requestAnimationFrame(() => {
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = el.getBoundingClientRect();
    const pos = computePosition(triggerRect, popoverRect.width, popoverRect.height, SIDE_OFFSET);
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.setAttribute("data-side", pos.side);
  });
}

export function hidePopover(state: PopoverState): void {
  if (state.isExpanded) {
    hideExpanded(state);
    return;
  }
  if (state.el) {
    state.el.style.display = "none";
    state.el.innerHTML = "";
  }
  state.activeTrigger = null;
}

function showExpanded(state: PopoverState, imageSrc: string): void {
  if (state.expandedEl) hideExpanded(state);
  const overlay = buildExpandedView(imageSrc);
  document.body.appendChild(overlay);
  state.expandedEl = overlay;
  state.isExpanded = true;
  document.body.style.overflow = "hidden";

  overlay.addEventListener("click", () => {
    hideExpanded(state);
  });
}

function hideExpanded(state: PopoverState): void {
  if (state.expandedEl) {
    state.expandedEl.remove();
    state.expandedEl = null;
  }
  state.isExpanded = false;
  document.body.style.overflow = "";
}
