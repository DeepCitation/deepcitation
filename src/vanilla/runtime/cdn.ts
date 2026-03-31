import { createElement, useCallback, useState } from "react";
import { render, unmountComponentAtNode } from "react-dom";
import { CitationDrawer } from "../../react/CitationDrawer.js";
import type { CitationDrawerItem, SourceCitationGroup } from "../../react/CitationDrawer.types.js";
import { groupCitationsBySource } from "../../react/CitationDrawer.utils.js";
import { CitationDrawerTrigger } from "../../react/CitationDrawerTrigger.js";
import { getStatusFromVerification } from "../../react/citationStatus.js";
import type { PopoverViewState } from "../../react/DefaultPopoverContent.js";
import { DefaultPopoverContent } from "../../react/DefaultPopoverContent.js";
import type { Citation } from "../../types/citation.js";
import type { PageImage, Verification } from "../../types/verification.js";
import { resolveKeyMap } from "./cdn-keymap.js";
import { mapToCitation, mapToVerification } from "./cdn-mappers.js";
import { computePosition } from "./positioning.js";
import type { VerificationData } from "./types.js";

// Status indicator SVGs — must match React's icons.tsx exactly
// CheckIcon: used for both verified (green) and partial (amber)
const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><polyline points="20 6 9 17 4 12"/></svg>`;
// XIcon: used for miss (red) — two crossing diagonal lines, NOT a dash
const X_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

/** Status color constants — use CSS custom properties with fallbacks matching React constants.ts */
const STATUS_COLORS = {
  verified: "var(--dc-verified, #10b981)", // emerald-500
  partial: "var(--dc-partial, #f59e0b)", // amber-500
  miss: "var(--dc-destructive, #ef4444)", // red-500
  pending: "var(--dc-pending, #a1a1aa)", // zinc-400
} as const;

/** Indicator variant type — mirrors React's IndicatorVariant */
type CdnIndicatorVariant = "icon" | "dot" | "none";

declare const __CDN_CSS__: string;
const SIDE_OFFSET = 8;

// ── Scroll passthrough helpers (mirrors Popover.tsx) ──────────────────────

/** Walk up from `el` to find the page's actual scroll container. */
function findPageScrollEl(el: HTMLElement | null): Element {
  let n: Element | null = el?.parentElement ?? null;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** Check if any ancestor between `target` and `boundary` can scroll vertically. */
function canChildScrollVertically(target: HTMLElement | null, boundary: HTMLElement | null, deltaY: number): boolean {
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

// ── Blink animation constants ─────────────────────────────────────────────

const BLINK_ENTER_DURATION_MS = 180;
const BLINK_ENTER_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const BLINK_EXIT_DURATION_MS = 120;
const BLINK_EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";

// ── Types & globals ───────────────────────────────────────────────────────

interface CdnOptions {
  verifications?: Record<string, VerificationData>;
  theme?: "light" | "dark" | "auto";
  selector?: string;
  /** Status indicator variant: "icon" (check/x), "dot" (colored circle), "none" */
  indicatorVariant?: CdnIndicatorVariant;
}
interface DeepCitationPopoverAPI {
  init(options?: CdnOptions): void;
  update(verifications: Record<string, VerificationData>): void;
  show(citationKey: string): void;
  hide(): void;
  showDrawer(): void;
  hideDrawer(): void;
  destroy(): void;
  version: string;
  _destroyed?: boolean;
}
declare global {
  interface Window {
    DeepCitationPopover?: DeepCitationPopoverAPI;
  }
}

// Two-div architecture (matches React Popover.tsx):
//   wrapperEl  — position:fixed, transform positioning, pointerEvents
//   contentEl  — overflow:clip, max-size, border, bg, shadow, renders React tree
let wrapperEl: HTMLDivElement | null = null;
let contentEl: HTMLDivElement | null = null;
let isOpen = false;
let activeTrigger: HTMLElement | null = null;
let verifications: Record<string, VerificationData> = {};
let activeSelector = "[data-citation-key]";
let activeIndicatorVariant: CdnIndicatorVariant = "icon";
let dismissController: AbortController | null = null;
let positionRafId = 0;
let resizeObserver: ResizeObserver | null = null;
let lastCoords = { x: NaN, y: NaN };
let scrollPassthroughController: AbortController | null = null;
let pageScrollEl: Element | null = null;
let coastRafId: number | null = null;
const boundTriggers = new WeakSet<HTMLElement>();

// ── Drawer state ─────────────────────────────────────────────────────
let drawerContainerEl: HTMLDivElement | null = null;
const drawerTriggerEls = new Set<HTMLElement>();

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function injectStyles(): void {
  if (document.getElementById("dc-popover-styles")) return;
  const style = document.createElement("style");
  style.id = "dc-popover-styles";
  // Trigger styles — mirrors React Citation.tsx triggerProps (text variant default).
  // :where() keeps zero specificity so host-page styles can override.
  const triggerStyles = [
    // Base: matches cn("relative inline-flex items-baseline", "px-0.5 -mx-0.5 rounded-sm",
    //   "transition-colors duration-[80ms] active:scale-[0.98]", "cursor-pointer")
    `:where([data-citation-key]) { position: relative; display: inline-flex; align-items: baseline; padding: 0 0.125rem; margin: 0 -0.125rem; border-radius: 2px; transition: background-color 80ms ease; cursor: pointer; }`,
    // Hover: matches getInteractionClasses(false, "text") → "hover:bg-black/[0.06]"
    `:where([data-citation-key]:hover) { background: rgba(0,0,0,0.06); }`,
    // Active: matches "active:scale-[0.98]"
    `:where([data-citation-key]:active) { transform: scale(0.98); }`,
    // Reduced motion: suppress active scale
    `@media (prefers-reduced-motion: reduce) { :where([data-citation-key]:active) { transform: none; } }`,
    // Dark mode: matches "dark:hover:bg-white/[0.06]" — uses data-dc-theme to match CDN theme attribute
    `:where([data-dc-theme="dark"]) :where([data-citation-key]:hover) { background: rgba(255,255,255,0.06); }`,
  ].join("\n");
  style.textContent = (typeof __CDN_CSS__ === "string" ? __CDN_CSS__ : "") + "\n" + triggerStyles;
  document.head.appendChild(style);
}

function ensurePopoverEls(): { wrapper: HTMLDivElement; content: HTMLDivElement } {
  if (!wrapperEl || !contentEl) {
    // Outer wrapper: position + transform only (matches React's wrapper div)
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-dc-popover-wrapper", "");
    wrapper.style.position = "absolute";
    wrapper.style.left = "0";
    wrapper.style.top = "0";
    wrapper.style.width = "max-content";
    wrapper.style.zIndex = "10000";
    wrapper.style.pointerEvents = "none";
    wrapper.style.willChange = "transform";

    // Inner content: overflow, max-size, visual styling (matches React's content div)
    const content = document.createElement("div");
    content.className =
      "dc-cdn-popover rounded-dc-lg border border-dc-border bg-dc-background shadow-xl font-dc text-dc-foreground";
    content.setAttribute("data-dc-popover-content", "");
    content.style.maxWidth = "calc(100vw - 2rem)";
    content.style.maxHeight = "calc(100dvh - 2rem)";
    content.style.overflowX = "clip";
    content.style.overflowY = "clip";
    content.style.transformOrigin = "center center";

    // Scrollbar hide + base resets.  :where() has zero specificity so Tailwind
    // utility classes on individual elements always win, but browser defaults
    // and host-page global styles are overridden.
    const scrollbarStyle = document.createElement("style");
    scrollbarStyle.textContent = [
      `[data-dc-popover-content]::-webkit-scrollbar { display: none; }`,
      `:where([data-dc-popover-content]) :where(button) { border: none; background: none; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; outline: none; }`,
      `:where([data-dc-popover-content]) :where(svg) { border: none; outline: none; box-shadow: none; }`,
    ].join("\n");
    wrapper.appendChild(scrollbarStyle);
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);
    wrapperEl = wrapper;
    contentEl = content;
  }
  return { wrapper: wrapperEl, content: contentEl };
}

function CdnPopoverWrapper(props: {
  citation: Citation;
  verification: Verification;
  pageImages: PageImage[] | undefined;
  status: ReturnType<typeof getStatusFromVerification>;
  sourceLabel: string | undefined;
  downloadUrl: string | undefined;
}) {
  const [viewState, setViewState] = useState<PopoverViewState>("summary");
  return createElement(DefaultPopoverContent, { ...props, viewState, onViewStateChange: setViewState });
}

// ── Positioning ───────────────────────────────────────────────────────────

/** For multi-line inline triggers, return the last line rect (where the indicator sits). */
function getTriggerRect(trigger: HTMLElement): DOMRect {
  const rects = trigger.getClientRects();
  return rects.length > 1 ? rects[rects.length - 1] : (rects[0] ?? trigger.getBoundingClientRect());
}

function reposition(): void {
  if (!wrapperEl || !contentEl || !activeTrigger || !isOpen) return;
  const triggerRect = getTriggerRect(activeTrigger);
  const contentRect = contentEl.getBoundingClientRect();
  const pos = computePosition(triggerRect, contentRect.width, contentRect.height, SIDE_OFFSET);
  // Skip if coords haven't changed (< 0.5px delta) — avoids unnecessary style writes
  if (Math.abs(lastCoords.x - pos.x) < 0.5 && Math.abs(lastCoords.y - pos.y) < 0.5) return;
  lastCoords = { x: pos.x, y: pos.y };
  wrapperEl.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
  wrapperEl.setAttribute("data-side", pos.side);
}
function scheduleReposition(): void {
  cancelAnimationFrame(positionRafId);
  positionRafId = requestAnimationFrame(reposition);
}
function startPositionTracking(): void {
  stopPositionTracking();
  window.addEventListener("resize", scheduleReposition);
  resizeObserver = new ResizeObserver(scheduleReposition);
  if (contentEl) resizeObserver.observe(contentEl);
  if (activeTrigger) resizeObserver.observe(activeTrigger);
}
function stopPositionTracking(): void {
  cancelAnimationFrame(positionRafId);
  window.removeEventListener("resize", scheduleReposition);
  resizeObserver?.disconnect();
  resizeObserver = null;
}

// ── Scroll passthrough (wheel + touch) ────────────────────────────────────

function getPageScrollEl(): Element {
  return pageScrollEl ?? findPageScrollEl(activeTrigger);
}

function setupScrollPassthrough(): void {
  teardownScrollPassthrough();
  if (!contentEl) return;
  pageScrollEl = activeTrigger ? findPageScrollEl(activeTrigger) : null;

  const ac = new AbortController();
  scrollPassthroughController = ac;
  const { signal } = ac;
  const el = contentEl;

  // ── Wheel passthrough ──
  el.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (e.defaultPrevented || e.deltaY === 0) return;
      if (canChildScrollVertically(e.target as HTMLElement | null, wrapperEl, e.deltaY)) return;
      e.preventDefault();
      const pixelDelta =
        e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      getPageScrollEl().scrollTop += pixelDelta;
    },
    { passive: false, signal },
  );

  // ── Touch passthrough with momentum ──
  const AXIS_LOCK_PX = 8;
  const COAST_DECELERATION = 0.95;
  const COAST_CUTOFF = 0.5;
  const VELOCITY_SAMPLES = 5;
  const STALE_MS = 100;

  let startX = 0;
  let startY = 0;
  let axis: "undecided" | "vertical" | "horizontal" = "undecided";
  let velocityHistory: { y: number; t: number }[] = [];

  const cancelCoast = () => {
    if (coastRafId !== null) {
      cancelAnimationFrame(coastRafId);
      coastRafId = null;
    }
  };

  el.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      cancelCoast();
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      axis = "undecided";
      velocityHistory = [{ y: t.clientY, t: Date.now() }];
    },
    { passive: true, signal },
  );

  el.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (e.defaultPrevented) {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        axis = "undecided";
        velocityHistory = [{ y: t.clientY, t: Date.now() }];
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (axis === "undecided") {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < AXIS_LOCK_PX) return;
        axis = Math.abs(dy) >= Math.abs(dx) ? "vertical" : "horizontal";
      }
      if (axis === "horizontal") return;
      if (canChildScrollVertically(e.target as HTMLElement | null, wrapperEl, dy > 0 ? 1 : -1)) return;
      e.preventDefault();
      const pEl = getPageScrollEl();
      pEl.scrollTop -= dy;
      startX = t.clientX;
      startY = t.clientY;
      const now = Date.now();
      velocityHistory.push({ y: t.clientY, t: now });
      if (velocityHistory.length > VELOCITY_SAMPLES) velocityHistory.shift();
    },
    { passive: false, signal },
  );

  const onTouchEnd = () => {
    if (axis !== "vertical") {
      axis = "undecided";
      return;
    }
    if (velocityHistory.length >= 2) {
      const first = velocityHistory[0];
      const last = velocityHistory[velocityHistory.length - 1];
      const timeSinceLast = Date.now() - last.t;
      if (timeSinceLast < STALE_MS) {
        const dt = last.t - first.t;
        if (dt > 0) {
          const vy = (first.y - last.y) / dt;
          if (Math.abs(vy) > 0.08) {
            let frameVy = vy * 16.67;
            let lastTime = performance.now();
            const pEl = getPageScrollEl();
            const coast = () => {
              const now = performance.now();
              const frameDt = now - lastTime;
              lastTime = now;
              const factor = COAST_DECELERATION ** (frameDt / 16.67);
              pEl.scrollTop += frameVy;
              frameVy *= factor;
              if (Math.abs(frameVy) > COAST_CUTOFF) {
                coastRafId = requestAnimationFrame(coast);
              } else {
                coastRafId = null;
              }
            };
            coastRafId = requestAnimationFrame(coast);
          }
        }
      }
    }
    axis = "undecided";
    velocityHistory = [];
  };

  el.addEventListener("touchend", onTouchEnd, { passive: true, signal });
  el.addEventListener("touchcancel", onTouchEnd, { passive: true, signal });
}

function teardownScrollPassthrough(): void {
  scrollPassthroughController?.abort();
  scrollPassthroughController = null;
  pageScrollEl = null;
  if (coastRafId !== null) {
    cancelAnimationFrame(coastRafId);
    coastRafId = null;
  }
}

// ── Blink animation helpers ───────────────────────────────────────────────

function animateOpen(): void {
  if (!contentEl || prefersReducedMotion) return;
  // Start state: slightly scaled down + transparent
  contentEl.style.opacity = "0";
  contentEl.style.transform = "translateY(4px) scale(0.96)";
  contentEl.style.transition = "none";
  // Force reflow so the start state is committed before the transition
  contentEl.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions
  // End state: fully visible
  contentEl.style.transition = `opacity ${BLINK_ENTER_DURATION_MS}ms ${BLINK_ENTER_EASING}, transform ${BLINK_ENTER_DURATION_MS}ms ${BLINK_ENTER_EASING}`;
  contentEl.style.opacity = "1";
  contentEl.style.transform = "translateY(0) scale(1)";
}

function animateClose(onDone: () => void): void {
  if (!contentEl || prefersReducedMotion) {
    onDone();
    return;
  }
  contentEl.style.transition = `opacity ${BLINK_EXIT_DURATION_MS}ms ${BLINK_EXIT_EASING}, transform ${BLINK_EXIT_DURATION_MS}ms ${BLINK_EXIT_EASING}`;
  contentEl.style.opacity = "0";
  contentEl.style.transform = "translateY(4px) scale(0.98)";
  setTimeout(onDone, BLINK_EXIT_DURATION_MS);
}

// ── Show / Hide ───────────────────────────────────────────────────────────

function showPopoverFor(trigger: HTMLElement, data: VerificationData): void {
  if (activeTrigger === trigger && isOpen) {
    hidePopoverInner();
    return;
  }
  const { wrapper, content } = ensurePopoverEls();
  const verification = mapToVerification(data);
  const citation = mapToCitation(data);
  const status = getStatusFromVerification(verification);
  // Keep wrapper invisible during initial render + layout to prevent a 1-frame flash
  // at the wrong size/position.  visibility:hidden still allows layout measurement.
  wrapper.style.display = "";
  wrapper.style.visibility = "hidden";
  wrapper.style.pointerEvents = "none";
  render(
    createElement(CdnPopoverWrapper, {
      citation,
      verification,
      pageImages: verification.pageImages,
      status,
      sourceLabel: data.label,
      downloadUrl: data.downloadUrl,
    }),
    content,
  );
  isOpen = true;
  activeTrigger = trigger;
  lastCoords = { x: NaN, y: NaN };
  requestAnimationFrame(() => {
    reposition();
    // Now reveal — position is correct, content has been laid out
    wrapper.style.visibility = "";
    wrapper.style.pointerEvents = "auto";
    startPositionTracking();
    setupScrollPassthrough();
    animateOpen();
  });
}

function hidePopoverCleanup(): void {
  stopPositionTracking();
  teardownScrollPassthrough();
  if (wrapperEl) {
    wrapperEl.style.pointerEvents = "none";
    wrapperEl.style.display = "none";
  }
  if (contentEl) {
    unmountComponentAtNode(contentEl);
    contentEl.style.transition = "none";
    contentEl.style.opacity = "";
    contentEl.style.transform = "";
  }
  isOpen = false;
  activeTrigger = null;
  lastCoords = { x: NaN, y: NaN };
}

function hidePopoverInner(): void {
  if (!isOpen) return;
  animateClose(hidePopoverCleanup);
}

function createStatusIndicator(data: VerificationData, variant: CdnIndicatorVariant = "icon"): HTMLSpanElement | null {
  if (variant === "none") return null;
  const verification = mapToVerification(data);
  const status = getStatusFromVerification(verification);
  // Determine state and color
  let state: "verified" | "partial" | "miss" | null = null;
  let color: string;
  if (status.isMiss) {
    state = "miss";
    color = STATUS_COLORS.miss;
  } else if (status.isPartialMatch) {
    state = "partial";
    color = STATUS_COLORS.partial;
  } else if (status.isVerified) {
    state = "verified";
    color = STATUS_COLORS.verified;
  } else {
    return null; // pending or unknown — no indicator
  }
  const span = document.createElement("span");
  span.className = "dc-status-indicator";
  span.setAttribute("aria-hidden", "true");
  span.setAttribute("data-dc-indicator", state === "miss" ? "error" : state);
  if (variant === "dot") {
    // Dot variant: small colored circle, matches React's DotIndicator (0.4em, 6px min)
    span.style.cssText = `display:inline-block;width:0.4em;height:0.4em;min-width:6px;min-height:6px;border-radius:9999px;vertical-align:0.1em;margin-left:0.125rem;background:${color};`;
    return span;
  }
  // Icon variant: checkmark (verified/partial) or X (miss), matches React's StatusIndicatorWrapper (0.85em, 10px min)
  const svg = state === "miss" ? X_SVG : CHECK_SVG;
  span.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:0.85em;height:0.85em;min-width:10px;min-height:10px;color:${color};vertical-align:text-bottom;margin-left:0.125rem;border:none;outline:none;background:none;padding:0;`;
  span.innerHTML = svg;
  // Reset SVG styles to prevent host page CSS bleed
  const svgEl = span.querySelector("svg");
  if (svgEl) svgEl.style.cssText = "border:none;outline:none;box-shadow:none;width:100%;height:100%;";
  return span;
}

function bindTriggers(selector: string): void {
  const triggers = document.querySelectorAll<HTMLElement>(selector);
  for (const trigger of triggers) {
    if (boundTriggers.has(trigger)) continue;
    const key = trigger.getAttribute("data-citation-key");
    if (!key || !verifications[key]) continue;
    boundTriggers.add(trigger);
    const indicator = createStatusIndicator(verifications[key], activeIndicatorVariant);
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
// ── Drawer ───────────────────────────────────────────────────────────

function renderDrawer(container: Element, groups: SourceCitationGroup[], initialOpen?: true): void {
  render(
    createElement(CdnDrawerWrapper, {
      groups,
      indicatorVariant: activeIndicatorVariant,
      ...(initialOpen && { initialOpen }),
    }),
    container,
  );
}

function buildDrawerItems(): CitationDrawerItem[] {
  return Object.entries(verifications).map(([key, data]) => ({
    citationKey: key,
    citation: mapToCitation(data),
    verification: mapToVerification(data),
  }));
}

function buildDrawerGroups(): SourceCitationGroup[] {
  return groupCitationsBySource(buildDrawerItems());
}

/**
 * Stateful wrapper that holds drawer open/close state.
 * Renders CitationDrawerTrigger + CitationDrawer together.
 */
function CdnDrawerWrapper({
  groups,
  indicatorVariant: variant,
  initialOpen,
}: {
  groups: SourceCitationGroup[];
  indicatorVariant: CdnIndicatorVariant;
  initialOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen ?? false);
  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  return createElement(
    "div",
    { "data-dc-drawer-root": "" },
    createElement(CitationDrawerTrigger, {
      citationGroups: groups,
      onClick: openDrawer,
      isOpen,
      indicatorVariant: variant,
    }),
    createElement(CitationDrawer, {
      isOpen,
      onClose: closeDrawer,
      citationGroups: groups,
      indicatorVariant: variant,
    }),
  );
}

function bindDrawerTriggers(prebuiltGroups?: SourceCitationGroup[]): void {
  const containers = document.querySelectorAll<HTMLElement>("[data-dc-drawer-trigger]");
  if (containers.length === 0) return;
  const groups = prebuiltGroups ?? buildDrawerGroups();
  if (groups.length === 0) return;
  for (const container of containers) {
    if (drawerTriggerEls.has(container)) continue;
    drawerTriggerEls.add(container);
    renderDrawer(container, groups);
  }
}

function refreshDrawerTriggers(groups: SourceCitationGroup[]): void {
  for (const container of drawerTriggerEls) {
    renderDrawer(container, groups);
  }
}

/** Ensure the drawer portal container exists (for programmatic showDrawer). */
function ensureDrawerContainer(): HTMLDivElement {
  if (!drawerContainerEl) {
    drawerContainerEl = document.createElement("div");
    drawerContainerEl.setAttribute("data-dc-drawer-portal", "");
    document.body.appendChild(drawerContainerEl);
  }
  return drawerContainerEl;
}

function showDrawer(): void {
  const groups = buildDrawerGroups();
  if (groups.length === 0) return;
  renderDrawer(ensureDrawerContainer(), groups, true);
}

function hideDrawer(): void {
  if (drawerContainerEl) {
    unmountComponentAtNode(drawerContainerEl);
    drawerContainerEl.remove();
    drawerContainerEl = null;
  }
}

function parseScriptTagJson<T>(id: string, errorMsg: string): T | null {
  const el = document.getElementById(id);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    console.error(errorMsg);
    return null;
  }
}
function init(options: CdnOptions = {}): void {
  if (wrapperEl) return;
  const { theme = "auto", selector = "[data-citation-key]", indicatorVariant = "icon" } = options;
  activeSelector = selector;
  activeIndicatorVariant = indicatorVariant;
  injectStyles();
  document.documentElement.setAttribute("data-dc-theme", theme);
  if (options.verifications) {
    verifications = { ...options.verifications };
  } else {
    verifications =
      parseScriptTagJson<Record<string, VerificationData>>(
        "dc-data",
        "[deepcitation] Failed to parse embedded verification data",
      ) ?? {};
  }
  // Resolve human-readable data-cite attributes to hashed data-citation-key
  // using the key map embedded as <script id="dc-key-map">{...}</script>.
  // Key-map resolution is one-shot: only runs on first init(), not on update().
  resolveKeyMap();

  ensurePopoverEls();
  dismissController = new AbortController();
  const { signal } = dismissController;
  document.addEventListener(
    "mousedown",
    e => {
      if (!isOpen || !wrapperEl) return;
      const target = e.target as Node;
      if (wrapperEl.contains(target)) return;
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
  bindDrawerTriggers();
}
function update(newVerifications: Record<string, VerificationData>): void {
  Object.assign(verifications, newVerifications);
  bindTriggers(activeSelector);
  const groups = buildDrawerGroups();
  refreshDrawerTriggers(groups);
  bindDrawerTriggers(groups);
  if (drawerContainerEl) renderDrawer(drawerContainerEl, groups);
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
  // Skip animation on destroy — clean up immediately
  stopPositionTracking();
  teardownScrollPassthrough();
  if (contentEl) {
    unmountComponentAtNode(contentEl);
  }
  if (wrapperEl) {
    wrapperEl.remove();
    wrapperEl = null;
    contentEl = null;
  }
  dismissController?.abort();
  dismissController = null;
  document.getElementById("dc-popover-styles")?.remove();
  document.documentElement.removeAttribute("data-dc-theme");
  isOpen = false;
  activeTrigger = null;
  verifications = {};
  lastCoords = { x: NaN, y: NaN };
  // Clean up drawer
  for (const container of drawerTriggerEls) {
    unmountComponentAtNode(container);
  }
  drawerTriggerEls.clear();
  if (drawerContainerEl) {
    unmountComponentAtNode(drawerContainerEl);
    drawerContainerEl.remove();
    drawerContainerEl = null;
  }
}

if (!window.DeepCitationPopover) {
  window.DeepCitationPopover = { init, update, show, hide, destroy, showDrawer, hideDrawer, version: "__VERSION__" };
}
