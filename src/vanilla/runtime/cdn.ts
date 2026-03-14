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
function bindTriggers(selector: string): void {
  const triggers = document.querySelectorAll<HTMLElement>(selector);
  for (const trigger of triggers) {
    if (boundTriggers.has(trigger)) continue;
    const key = trigger.getAttribute("data-citation-key");
    if (!key || !verifications[key]) continue;
    boundTriggers.add(trigger);
    trigger.style.cursor = "pointer";
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
