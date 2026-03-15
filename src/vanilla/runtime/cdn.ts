import { createElement, useState } from "react";
import { render } from "react-dom";
import { getStatusFromVerification } from "../../react/citationStatus.js";
import type { PopoverViewState } from "../../react/DefaultPopoverContent.js";
import { DefaultPopoverContent } from "../../react/DefaultPopoverContent.js";
import type { Citation } from "../../types/citation.js";
import type { PageImage, Verification } from "../../types/verification.js";
import { mapToCitation, mapToVerification } from "./cdn-mappers.js";
import { computePosition } from "./positioning.js";
import type { VerificationData } from "./types.js";

// Status indicator SVGs (inline to avoid JSX in imperative DOM code)
const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><polyline points="20 6 9 17 4 12"/></svg>`;
const MISS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" width="100%" height="100%"><line x1="6" y1="12" x2="18" y2="12"/></svg>`;
const WARNING_SVG = `<svg viewBox="0 0 256 256" fill="currentColor" width="100%" height="100%"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z"/></svg>`;

/** Status color constants matching the React component's CSS custom property defaults */
const STATUS_COLORS = {
  verified: "#16a34a", // green-600
  partial: "#f59e0b", // amber-500
  miss: "#ef4444", // red-500
} as const;

declare const __CDN_CSS__: string;
const SIDE_OFFSET = 8;

interface CdnOptions {
  verifications?: Record<string, VerificationData>;
  theme?: "light" | "dark" | "auto";
  selector?: string;
}
interface DeepCitationPopoverAPI {
  init(options?: CdnOptions): void;
  update(verifications: Record<string, VerificationData>): void;
  show(citationKey: string): void;
  hide(): void;
  destroy(): void;
  version: string;
  _destroyed?: boolean;
}
declare global {
  interface Window {
    DeepCitationPopover?: DeepCitationPopoverAPI;
  }
}

let popoverEl: HTMLDivElement | null = null;
let isOpen = false;
let activeTrigger: HTMLElement | null = null;
let verifications: Record<string, VerificationData> = {};
let activeSelector = "[data-citation-key]";
let dismissController: AbortController | null = null;
const boundTriggers = new WeakSet<HTMLElement>();

function injectStyles(): void {
  if (document.getElementById("dc-popover-styles")) return;
  const style = document.createElement("style");
  style.id = "dc-popover-styles";
  style.textContent = typeof __CDN_CSS__ === "string" ? __CDN_CSS__ : "";
  document.head.appendChild(style);
}
function ensurePopoverEl(): HTMLDivElement {
  if (!popoverEl) {
    const el = document.createElement("div");
    el.className = "dc-cdn-popover";
    el.style.position = "fixed";
    el.style.zIndex = "10000";
    el.style.width = "max-content";
    el.style.maxWidth = "min(480px, calc(100vw - 2rem))";
    el.style.display = "none";
    document.body.appendChild(el);
    popoverEl = el;
  }
  return popoverEl;
}

function CdnPopoverWrapper(props: {
  citation: Citation;
  verification: Verification;
  pageImages: PageImage[] | undefined;
  status: ReturnType<typeof getStatusFromVerification>;
  sourceLabel: string | undefined;
}) {
  const [viewState, setViewState] = useState<PopoverViewState>("summary");
  return createElement(DefaultPopoverContent, { ...props, viewState, onViewStateChange: setViewState });
}

function showPopoverFor(trigger: HTMLElement, data: VerificationData): void {
  if (activeTrigger === trigger && isOpen) {
    hidePopoverInner();
    return;
  }
  const el = ensurePopoverEl();
  const verification = mapToVerification(data);
  const citation = mapToCitation(data);
  const status = getStatusFromVerification(verification);
  render(
    createElement(CdnPopoverWrapper, {
      citation,
      verification,
      pageImages: verification.pageImages,
      status,
      sourceLabel: data.label,
    }),
    el,
  );
  el.style.display = "block";
  isOpen = true;
  activeTrigger = trigger;
  requestAnimationFrame(() => {
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = el.getBoundingClientRect();
    const pos = computePosition(triggerRect, popoverRect.width, popoverRect.height, SIDE_OFFSET);
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.setAttribute("data-side", pos.side);
  });
}
function hidePopoverInner(): void {
  if (popoverEl) {
    render(null as unknown as ReturnType<typeof createElement>, popoverEl);
    popoverEl.style.display = "none";
  }
  isOpen = false;
  activeTrigger = null;
}
function createStatusIndicator(data: VerificationData): HTMLSpanElement | null {
  const verification = mapToVerification(data);
  const status = getStatusFromVerification(verification);
  let svg: string;
  let color: string;
  if (status.isMiss) {
    svg = MISS_SVG;
    color = STATUS_COLORS.miss;
  } else if (status.isPartialMatch) {
    svg = WARNING_SVG;
    color = STATUS_COLORS.partial;
  } else if (status.isVerified) {
    svg = CHECK_SVG;
    color = STATUS_COLORS.verified;
  } else {
    return null; // pending or unknown — no indicator
  }
  const span = document.createElement("span");
  span.className = "dc-status-indicator";
  span.style.cssText = `display:inline-flex;width:0.85em;height:0.85em;min-width:10px;min-height:10px;color:${color};vertical-align:middle;margin-left:0.1em;`;
  span.innerHTML = svg;
  return span;
}

function bindTriggers(selector: string): void {
  const triggers = document.querySelectorAll<HTMLElement>(selector);
  for (const trigger of triggers) {
    if (boundTriggers.has(trigger)) continue;
    const key = trigger.getAttribute("data-citation-key");
    if (!key || !verifications[key]) continue;
    boundTriggers.add(trigger);
    trigger.style.cursor = "pointer";
    // Add status indicator icon after the trigger text
    const indicator = createStatusIndicator(verifications[key]);
    if (indicator && !trigger.querySelector(".dc-status-indicator")) {
      trigger.appendChild(indicator);
    }
    trigger.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const k = trigger.getAttribute("data-citation-key");
      if (k && verifications[k]) showPopoverFor(trigger, verifications[k]);
    });
  }
}
function init(options: CdnOptions = {}): void {
  if (popoverEl) return;
  const { theme = "auto", selector = "[data-citation-key]" } = options;
  activeSelector = selector;
  injectStyles();
  document.documentElement.setAttribute("data-dc-theme", theme);
  if (options.verifications) {
    verifications = { ...options.verifications };
  } else {
    const dataEl = document.getElementById("dc-data");
    if (dataEl?.textContent) {
      try {
        verifications = JSON.parse(dataEl.textContent);
      } catch {
        console.error("[deepcitation] Failed to parse embedded verification data");
      }
    }
  }
  ensurePopoverEl();
  dismissController = new AbortController();
  const { signal } = dismissController;
  document.addEventListener(
    "mousedown",
    e => {
      if (!isOpen || !popoverEl) return;
      const target = e.target as Node;
      if (popoverEl.contains(target)) return;
      if (target instanceof HTMLElement && target.closest(selector)) return;
      hidePopoverInner();
    },
    { capture: true, signal },
  );
  document.addEventListener(
    "keydown",
    e => {
      if (e.key === "Escape" && isOpen) hidePopoverInner();
    },
    { signal },
  );
  bindTriggers(selector);
}
function update(newVerifications: Record<string, VerificationData>): void {
  Object.assign(verifications, newVerifications);
  bindTriggers(activeSelector);
}
function show(citationKey: string): void {
  if (!verifications[citationKey]) return;
  const trigger = document.querySelector<HTMLElement>(`[data-citation-key="${CSS.escape(citationKey)}"]`);
  if (trigger) showPopoverFor(trigger, verifications[citationKey]);
}
function hide(): void {
  hidePopoverInner();
}
function destroy(): void {
  hidePopoverInner();
  if (popoverEl) {
    popoverEl.remove();
    popoverEl = null;
  }
  dismissController?.abort();
  dismissController = null;
  document.getElementById("dc-popover-styles")?.remove();
  document.documentElement.removeAttribute("data-dc-theme");
  verifications = {};
}

if (!window.DeepCitationPopover) {
  window.DeepCitationPopover = { init, update, show, hide, destroy, version: "__VERSION__" };
}
