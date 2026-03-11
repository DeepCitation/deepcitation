/**
 * Popover runtime entry point.
 * Compiled to IIFE by scripts/build-vanilla-runtime.mjs.
 * Runs in the browser when the self-contained HTML report is opened.
 */

import { createPopoverState, hidePopover, showPopover } from "./popover.js";
import type { VerificationData } from "./types.js";

function init(): void {
  const state = createPopoverState();

  // Load verification data from embedded JSON
  const dataEl = document.getElementById("dc-data");
  if (!dataEl?.textContent) return;

  let verifications: Record<string, VerificationData>;
  try {
    verifications = JSON.parse(dataEl.textContent);
  } catch {
    console.error("[deepcitation] Failed to parse verification data");
    return;
  }

  // Scan all citation triggers and attach click handlers
  const triggers = document.querySelectorAll<HTMLElement>("[data-citation-key]");
  for (const trigger of triggers) {
    const key = trigger.getAttribute("data-citation-key");
    if (!key || !verifications[key]) continue;

    trigger.style.cursor = "pointer";
    trigger.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      showPopover(state, trigger, verifications[key]);
    });
  }

  // Click-outside dismiss (mousedown capture for early interception)
  document.addEventListener(
    "mousedown",
    e => {
      if (!state.el || state.el.style.display === "none") return;
      const target = e.target as Node;
      if (state.el.contains(target)) return;
      // Don't dismiss if clicking a trigger (showPopover handles toggle)
      if (target instanceof HTMLElement && target.closest("[data-citation-key]")) return;
      hidePopover(state);
    },
    true,
  );

  // Escape key dismiss
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      hidePopover(state);
    }
  });
}

// Run on DOMContentLoaded or immediately if already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
