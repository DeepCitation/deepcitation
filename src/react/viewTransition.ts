import { flushSync } from "react-dom";
import {
  DEBUG_PAGE_EXPAND_SOURCE_COLOR,
  DEBUG_PAGE_EXPAND_TARGET_COLOR,
  EASE_COLLAPSE,
  EASE_CONTENT_REVEAL,
  EASE_GHOST_EXPAND,
  GHOST_BLUR_EARLY_PX,
  GHOST_BLUR_LATE_PX,
  GHOST_BLUR_MID_PX,
  GHOST_BLUR_PEAK_PX,
  GHOST_BLUR_START_PX,
  GHOST_OFFSET_EARLY,
  GHOST_OFFSET_LATE,
  GHOST_OFFSET_MID,
  GHOST_OFFSET_PEAK,
  GHOST_OPACITY_EARLY,
  GHOST_OPACITY_LATE,
  GHOST_OPACITY_MID,
  GHOST_OPACITY_PEAK,
  GHOST_OPACITY_START,
  isValidProofImageSrc,
  KEYHOLE_STRIP_BORDER_RADIUS,
  PAGE_COLLAPSE_GHOST_MS,
  PAGE_EXPAND_CONTENT_OPACITY_FLOOR,
  VT_EVIDENCE_PAGE_EXPAND_MS,
} from "./constants.js";
import { getFrozen, registerActiveAnimations, scaleDuration, setLastGhostRects } from "./debug/animationDebugStore.js";

/**
 * View-transition name applied to evidence image elements (keyhole strip,
 * expanded-keyhole shell, expanded-page shell). Only the visible slot carries
 * a captured snapshot — hidden (display:none) slots are ignored by the browser.
 */
export const DC_EVIDENCE_VT_NAME = "dc-evidence";

/**
 * Depth counter for in-flight View Transitions. Dismiss handlers check this to
 * avoid closing the popover during expand/collapse — `flushSync` inside the VT
 * callback can make the clicked element `display: none`, causing outside-click
 * handlers to misidentify the target as "outside" the popover.
 *
 * A counter (not boolean) handles back-to-back transitions: if a second VT
 * starts before the first finishes, the first's cleanup decrements without
 * prematurely unguarding the second.
 */
let _transitionDepth = 0;
let _primedPageExpandSource: HTMLElement | null = null;
let _primedPageExpandSourceTime = 0;
/** Max age (ms) before the primed source is considered stale and discarded. */
const _PRIMED_SOURCE_MAX_AGE_MS = 500;
export function isViewTransitioning(): boolean {
  return _transitionDepth > 0;
}

/**
 * Primes the source element for the next page-expand transition.
 * Callers must invoke `startEvidencePageExpandTransition` immediately after —
 * the primed ref is cleared on read or after `_PRIMED_SOURCE_MAX_AGE_MS`.
 */
export function primeEvidencePageExpandSource(sourceEl: HTMLElement | null): void {
  _primedPageExpandSource = sourceEl;
  _primedPageExpandSourceTime = Date.now();
}

/**
 * Wraps a state update in a View Transition so the browser morphs the
 * geometry + cross-fades between the old and new evidence image elements.
 *
 * Falls back to a plain synchronous update when:
 * - View Transitions API is unsupported (Firefox as of early 2026)
 * - `prefers-reduced-motion` is active (skip flag)
 * - SSR (no `document`)
 */
export function startEvidenceViewTransition(
  update: () => void,
  options?: {
    isCollapse?: boolean;
    isPageExpand?: boolean;
    skipAnimation?: boolean;
    root?: ParentNode | null;
  },
): void {
  const skip = options?.skipAnimation;
  if (skip || typeof document === "undefined" || !("startViewTransition" in document)) {
    // Synchronous fallback — no async transition in flight, so _transitioning
    // stays false. Dismiss handlers don't need guarding on this path.
    update();
    return;
  }
  _transitionDepth++;
  if (options?.isCollapse) {
    document.documentElement.dataset.dcCollapse = "";
  }
  if (options?.isPageExpand) {
    document.documentElement.dataset.dcPageExpand = "";
  }

  // For expand transitions (not collapse), create a scrim at the pre-expand
  // popover rect so the existing visual is preserved while the popover grows.
  // The FLIP morph (usePopoverMorphTransition) clips the expansion area with
  // clip-path, but the scrim provides a solid anchor if any frame renders
  // before the clip is applied.
  const rootEl = options?.root instanceof HTMLElement ? options.root : null;
  let scrim: HTMLDivElement | null = null;
  if (!options?.isCollapse && rootEl) {
    scrim = createPreExpandScrim(rootEl);
  }

  // Safe cast: the `"startViewTransition" in document` guard above ensures
  // this property exists at runtime before we reach this point.
  const transition = (
    document as Document & {
      startViewTransition: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
    }
  ).startViewTransition(() => {
    flushSync(update);
  });
  // Log VT failures in development — the most common cause is duplicate
  // view-transition-name values in the live DOM after flushSync.
  if (process.env.NODE_ENV !== "production") {
    transition.ready.catch((e: unknown) => {
      console.warn("[VT] transition.ready rejected — animation skipped:", e);
    });
  }
  const cleanup = () => {
    if (process.env.NODE_ENV !== "production" && _transitionDepth === 0) {
      console.warn("[VT] cleanup called with _transitionDepth already at 0");
    }
    _transitionDepth = Math.max(0, _transitionDepth - 1);
    delete document.documentElement.dataset.dcCollapse;
    delete document.documentElement.dataset.dcPageExpand;
    scrim?.remove();
  };
  transition.finished.then(cleanup).catch(cleanup);
}

/** @internal — exported for unit testing only, not part of the public API */
export type GhostSnapshot = {
  viewportRect: DOMRect;
  imageSrc: string;
  imageOffsetLeft: number;
  imageOffsetTop: number;
  imageWidth: number;
  imageHeight: number;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  sourceKind: "summary-keyhole" | "expanded-keyhole" | null;
  sourceAnchorX: number;
  sourceAnchorY: number;
  borderRadius: string;
};

/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export function isVisibleRect(rect: DOMRect): boolean {
  return rect.width > 0.5 && rect.height > 0.5;
}

/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export type DebugPhase = "source" | "target" | "both" | null;

/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export function getPageExpandDebugPhase(): DebugPhase {
  if (typeof document === "undefined") return null;
  const phase = document.documentElement.dataset.dcPageExpandDebugPhase;
  if (phase === "source" || phase === "target" || phase === "both") return phase;
  return null;
}

/**
 * Remove all debug overlays from the DOM.
 *
 * @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API.
 */
export function clearDebugOverlays(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-dc-debug-overlay]").forEach(el => el.remove());
}

/** Shared font for debug labels. */
const DEBUG_LABEL_FONT = "10px/1.2 ui-monospace, SFMono-Regular, monospace";

type DebugOverlayOpts = {
  /** Render outline as a dashed border (instead of solid). Useful for mid-progress frames. */
  dashed?: boolean;
  /** 2-digit hex alpha suffix for the fill (e.g. "11" for ~7%, "22" for ~13%). Defaults to "22". */
  fillAlpha?: string;
  /** Place the label below the box instead of above. Useful when stacking multiple labels. */
  labelBelow?: boolean;
};

/**
 * Create a debug overlay box at the given rect with a colored outline and label.
 *
 * @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API.
 */
export function createDebugOverlay(
  rect: DOMRect,
  color: string,
  label: string,
  sublabel?: string,
  opts?: DebugOverlayOpts,
): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.dataset.dcDebugOverlay = "";
  el.style.position = "fixed";
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  // Use `border` for dashed (outline doesn't support dashed rendering in
  // Chromium/WebKit the way border does).
  if (opts?.dashed) {
    el.style.border = `2px dashed ${color}`;
  } else {
    el.style.outline = `2px solid ${color}`;
    el.style.outlineOffset = "-1px";
  }
  el.style.backgroundColor = `${color}${opts?.fillAlpha ?? "22"}`;
  el.style.pointerEvents = "none";
  el.style.zIndex = "2147483647";
  el.style.overflow = "visible";

  // Label badge
  const badge = document.createElement("div");
  badge.style.position = "absolute";
  if (opts?.labelBelow) {
    badge.style.bottom = "-18px";
    badge.style.borderRadius = "0 0 3px 3px";
  } else {
    badge.style.top = "-18px";
    badge.style.borderRadius = "3px 3px 0 0";
  }
  badge.style.left = "0";
  badge.style.background = color;
  badge.style.color = "#fff";
  badge.style.font = DEBUG_LABEL_FONT;
  badge.style.padding = "1px 5px";
  badge.style.whiteSpace = "nowrap";
  badge.textContent = label;
  el.appendChild(badge);

  // Dimensions sub-label
  const dims = document.createElement("div");
  dims.style.position = "absolute";
  dims.style.bottom = "-16px";
  dims.style.left = "0";
  dims.style.font = DEBUG_LABEL_FONT;
  dims.style.color = color;
  dims.style.whiteSpace = "nowrap";
  dims.style.textShadow = "0 0 3px #000, 0 0 3px #000";
  const dimText = `${Math.round(rect.width)}×${Math.round(rect.height)} @ (${Math.round(rect.left)}, ${Math.round(rect.top)})`;
  dims.textContent = sublabel ? `${dimText} — ${sublabel}` : dimText;
  el.appendChild(dims);

  document.body.appendChild(el);
  return el;
}

/**
 * Draw a small crosshair at a viewport point. Used by the keyframe overlay to
 * mark the citation anchor's trajectory (where the cited text is inside the
 * ghost) so a reader can see whether the anchor sits on the spotlight at t=0
 * and t=1 and holds position through the middle. If the crosshairs drift off
 * the spotlight center, the aim math is wrong — the overlay misalignment the
 * user has been seeing is the same defect the animation is suffering from.
 */
/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export function createDebugCrosshair(x: number, y: number, color: string, label?: string, size = 12): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.dataset.dcDebugOverlay = "";
  el.style.position = "fixed";
  el.style.left = `${x - size / 2}px`;
  el.style.top = `${y - size / 2}px`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.pointerEvents = "none";
  el.style.zIndex = "2147483647";
  el.style.overflow = "visible";
  // Two thin lines forming a plus sign; keeps the exact (x,y) pixel readable.
  el.style.background = `linear-gradient(to right, transparent calc(50% - 0.5px), ${color} calc(50% - 0.5px), ${color} calc(50% + 0.5px), transparent calc(50% + 0.5px)), linear-gradient(to bottom, transparent calc(50% - 0.5px), ${color} calc(50% - 0.5px), ${color} calc(50% + 0.5px), transparent calc(50% + 0.5px))`;
  el.style.borderRadius = "50%";
  el.style.boxShadow = `0 0 0 1px ${color}`;
  if (label) {
    const badge = document.createElement("div");
    badge.style.position = "absolute";
    badge.style.left = `${size + 2}px`;
    badge.style.top = "-6px";
    badge.style.background = color;
    badge.style.color = "#fff";
    badge.style.font = DEBUG_LABEL_FONT;
    badge.style.padding = "0 3px";
    badge.style.borderRadius = "2px";
    badge.style.whiteSpace = "nowrap";
    badge.textContent = label;
    el.appendChild(badge);
  }
  document.body.appendChild(el);
  return el;
}

function takePrimedPageExpandSource(root: ParentNode): HTMLElement | null {
  const sourceEl = _primedPageExpandSource;
  _primedPageExpandSource = null;
  if (!sourceEl) return null;
  // Discard stale primed sources to prevent leaked refs from accumulating.
  if (Date.now() - _primedPageExpandSourceTime > _PRIMED_SOURCE_MAX_AGE_MS) return null;
  if ("contains" in root && typeof root.contains === "function" && !root.contains(sourceEl)) {
    return null;
  }
  const rect = sourceEl.getBoundingClientRect();
  return isVisibleRect(rect) ? sourceEl : null;
}

function readAnchorDataset(el: HTMLElement, axis: "X" | "Y"): number {
  const raw = Number.parseFloat(el.dataset[`dcSourceAnchor${axis}`] ?? "");
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.5;
}

function buildPageExpandSnapshot(sourceEl: HTMLElement): GhostSnapshot | null {
  const rect = sourceEl.getBoundingClientRect();
  if (!isVisibleRect(rect)) return null;
  const img = sourceEl.querySelector<HTMLImageElement>("img");
  const imageRect = img?.getBoundingClientRect();
  const imageSrc = img?.currentSrc || img?.src;
  if (!img || !imageRect || !imageSrc || !isVisibleRect(imageRect)) return null;
  return {
    viewportRect: rect,
    imageSrc,
    imageOffsetLeft: imageRect.left - rect.left,
    imageOffsetTop: imageRect.top - rect.top,
    imageWidth: imageRect.width,
    imageHeight: imageRect.height,
    imageNaturalWidth: img.naturalWidth,
    imageNaturalHeight: img.naturalHeight,
    sourceKind:
      sourceEl.dataset.dcPageExpandSourceKind === "summary-keyhole" ||
      sourceEl.dataset.dcPageExpandSourceKind === "expanded-keyhole"
        ? sourceEl.dataset.dcPageExpandSourceKind
        : null,
    sourceAnchorX: readAnchorDataset(sourceEl, "X"),
    sourceAnchorY: readAnchorDataset(sourceEl, "Y"),
    borderRadius: getComputedStyle(sourceEl).borderRadius || "0px",
  };
}

/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export function capturePageExpandSource(root: ParentNode): GhostSnapshot | null {
  const primedSource = takePrimedPageExpandSource(root);
  const candidates = primedSource
    ? [primedSource]
    : Array.from(root.querySelectorAll<HTMLElement>("[data-dc-page-expand-source]"));
  for (const sourceEl of candidates) {
    const snapshot = buildPageExpandSnapshot(sourceEl);
    if (snapshot) return snapshot;
  }
  return null;
}

/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export type PageExpandTarget = {
  markerRect: DOMRect;
  ghostRect: DOMRect;
  /** Spotlight rect in viewport coords, used for clip-path convergence. Null when no spotlight. */
  spotlightRect: DOMRect | null;
};

/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export function buildGhostTarget(
  snapshot: GhostSnapshot,
  targetEl: HTMLElement,
  markerRect: DOMRect,
): { ghostRect: DOMRect; spotlightRect: DOMRect | null } {
  // Pure translate — the keyhole image is already at the correct rendered scale,
  // so the ghost keeps the keyhole's exact dimensions and slides into position
  // like a key into a keyhole. No scale = no squash/stretch.
  //
  // The keyhole viewport may be scrolled so only part of the evidence crop is
  // visible (e.g. right half when the match is on the right). We align the
  // annotation center WITHIN the ghost with the annotation center on the
  // expanded page.
  const srcW = snapshot.viewportRect.width;
  const srcH = snapshot.viewportRect.height;

  // Annotation center within the ghost element.
  // Formula: imageOffsetLeft + sourceAnchorX × imageWidth = annotation X in ghost-local coords.
  //
  // Why this works in both cases:
  //   Scrolled (non-clamped): imageOffsetLeft = −scrollLeft = srcW/2 − annX·zoom,
  //     so imageOffsetLeft + annX·zoom = srcW/2.  The annotation ends up at the
  //     viewport center because EvidenceKeyhole's centering scroll placed it there.
  //   Width-filling (scrollLeft=0): imageOffsetLeft = 0, so anchor = annX·zoom =
  //     sourceAnchorX × imageWidth — the annotation's actual pixel position in
  //     the displayed image.  Using srcW/2 here is wrong when annX ≠ imageW/2.
  //
  // sourceAnchorX/Y is set by EvidenceKeyhole (summary-keyhole) and
  // InlineExpandedImage (expanded-keyhole) via data-dc-source-anchor-x/y.
  // Falls back to 0.5 when no attribute is set (legacy or non-annotated sources).
  const anchorInGhostX = snapshot.imageOffsetLeft + snapshot.sourceAnchorX * snapshot.imageWidth;
  const anchorInGhostY = snapshot.imageOffsetTop + snapshot.sourceAnchorY * snapshot.imageHeight;

  // Annotation center on the expanded page — use spotlight center (annotation
  // center with symmetric padding) or marker center.
  const spotlightEl = targetEl.parentElement?.querySelector<HTMLElement>("[data-dc-spotlight]");
  if (spotlightEl) {
    const spotRect = spotlightEl.getBoundingClientRect();
    if (isVisibleRect(spotRect)) {
      const pageCX = spotRect.left + spotRect.width / 2;
      const pageCY = spotRect.top + spotRect.height / 2;
      return {
        ghostRect: new DOMRect(pageCX - anchorInGhostX, pageCY - anchorInGhostY, srcW, srcH),
        spotlightRect: spotRect,
      };
    }
  }
  const pageCX = markerRect.left + markerRect.width / 2;
  const pageCY = markerRect.top + markerRect.height / 2;
  return {
    ghostRect: new DOMRect(pageCX - anchorInGhostX, pageCY - anchorInGhostY, srcW, srcH),
    spotlightRect: null,
  };
}

/**
 * Fallback ghost target for miss/not_found states where no annotation marker
 * exists. Maps the keyhole's visible viewport onto the expanded page's visible
 * image area — the ghost lands on whatever region the user was already viewing.
 *
 * @internal — exported for unit testing only, not part of the public API
 */
export function buildGhostTargetFromViewport(root: ParentNode, snapshot: GhostSnapshot): PageExpandTarget | null {
  // Only match containers that have no annotation data (miss/not_found).
  // data-dc-no-annotation is set by InlineExpandedImage when fill=true and
  // scrollTarget is null — derived from props, not layout measurements, so
  // it's available immediately after flushSync (no useEffect timing issues).
  const containers = root.querySelectorAll<HTMLElement>("[data-dc-inline-expanded][data-dc-no-annotation]");
  for (const container of containers) {
    const containerRect = container.getBoundingClientRect();
    if (!isVisibleRect(containerRect)) continue;
    const img = container.querySelector<HTMLImageElement>("img");
    if (!img) continue;
    const imgRect = img.getBoundingClientRect();
    if (!isVisibleRect(imgRect)) continue;
    // Visible intersection of the container and the page image.
    const left = Math.max(containerRect.left, imgRect.left);
    const top = Math.max(containerRect.top, imgRect.top);
    const right = Math.min(containerRect.right, imgRect.right);
    const bottom = Math.min(containerRect.bottom, imgRect.bottom);
    if (right <= left || bottom <= top) continue;
    const visibleRect = new DOMRect(left, top, right - left, bottom - top);
    // Keep ghost at source keyhole dimensions — no scale-up for miss/not_found.
    // Anchor = visible viewport center (srcW/2, srcH/2).
    // Unlike buildGhostTarget, we use the viewport center here rather than
    // the annotation position, because miss/not_found has no annotation:
    //   • No scroll applied → imageOffsetLeft/Top = 0
    //   • sourceAnchorX/Y defaults to 0.5, but imageWidth may exceed srcW
    //     (tall image, width-fill zoom), making imageHeight/2 >> srcH
    // Using srcW/2, srcH/2 keeps the visible center of the ghost on the target.
    const srcW = snapshot.viewportRect.width;
    const srcH = snapshot.viewportRect.height;
    const anchorInGhostX = srcW / 2;
    const anchorInGhostY = srcH / 2;
    const pageCX = visibleRect.left + visibleRect.width / 2;
    const pageCY = visibleRect.top + visibleRect.height / 2;
    const ghostRect = new DOMRect(pageCX - anchorInGhostX, pageCY - anchorInGhostY, srcW, srcH);
    return { markerRect: visibleRect, ghostRect, spotlightRect: null };
  }
  return null;
}

function findPageExpandTarget(root: ParentNode, snapshot: GhostSnapshot): PageExpandTarget | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[data-dc-page-expand-target]"));
  for (const targetEl of candidates) {
    if (targetEl.dataset.dcPageExpandReady !== "true") continue;
    const rect = targetEl.getBoundingClientRect();
    if (!isVisibleRect(rect)) continue;
    const { ghostRect, spotlightRect } = buildGhostTarget(snapshot, targetEl, rect);
    return { markerRect: rect, ghostRect, spotlightRect };
  }
  // Annotation target elements exist but aren't ready yet — keep polling.
  if (candidates.length > 0) return null;
  // No annotation target at all (miss/not_found without annotation data).
  // Fall back to the visible viewport of the expanded page image.
  // The ready-attribute selector in buildGhostTargetFromViewport ensures we
  // don't fire prematurely — pageExpandReady is only set after the component's
  // useEffect has run and (for success states) annotation targets are rendered.
  return buildGhostTargetFromViewport(root, snapshot);
}

function createPageExpandGhost(snapshot: GhostSnapshot): HTMLDivElement | null {
  // Defensive re-validation: the source image was already validated before
  // rendering, but a DOM mutation (e.g. browser extension) could have changed it.
  if (!isValidProofImageSrc(snapshot.imageSrc)) return null;
  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.dataset.dcPageExpandGhost = "";
  ghost.style.position = "fixed";
  ghost.style.left = `${snapshot.viewportRect.left}px`;
  ghost.style.top = `${snapshot.viewportRect.top}px`;
  ghost.style.width = `${snapshot.viewportRect.width}px`;
  ghost.style.height = `${snapshot.viewportRect.height}px`;
  ghost.style.overflow = "hidden";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "2147483646";
  ghost.style.borderRadius = snapshot.borderRadius;
  ghost.style.transformOrigin = "0 0";
  // Include filter in will-change: blur() animation needs a compositor layer
  // hint; without it the GPU can't promote the element ahead of time and the
  // first blur frame causes a synchronous paint that produces a visible stutter.
  ghost.style.willChange = "transform, opacity, filter";
  const debugPhase = getPageExpandDebugPhase();
  if (debugPhase && debugPhase !== "both") {
    ghost.style.outline =
      debugPhase === "source"
        ? `2px solid ${DEBUG_PAGE_EXPAND_SOURCE_COLOR}`
        : `2px solid ${DEBUG_PAGE_EXPAND_TARGET_COLOR}`;
    ghost.style.outlineOffset = "0";
  }

  const img = document.createElement("img");
  img.src = snapshot.imageSrc;
  img.alt = "";
  img.draggable = false;
  img.style.position = "absolute";
  img.style.left = `${snapshot.imageOffsetLeft}px`;
  img.style.top = `${snapshot.imageOffsetTop}px`;
  img.style.width = `${snapshot.imageWidth}px`;
  img.style.height = `${snapshot.imageHeight}px`;
  img.style.maxWidth = "none";
  img.style.userSelect = "none";
  img.style.pointerEvents = "none";
  // Promote the image to its own compositor layer so the parent's overflow clip
  // and border-radius don't trigger repaints each frame.
  img.style.willChange = "transform";
  ghost.appendChild(img);
  document.body.appendChild(ghost);
  return ghost;
}

const PAGE_EXPAND_SCRIM_ATTR = "data-dc-page-expand-scrim";

/**
 * Create a fixed-position scrim at the popover's CURRENT rect (before it
 * expands). Inserted before the popover wrapper in the DOM so it sits behind
 * the popover at the same z-index. When the popover is dimmed to near-zero
 * opacity:
 *   - Pre-expand area: scrim provides solid backing (same visual as before)
 *   - Expansion area: no scrim → 0.03 popover → nearly invisible over page
 *
 * This prevents BOTH bleed-through (scrim blocks it in the old area) AND
 * white-rectangle flash (expansion area stays transparent).
 */
function createPreExpandScrim(popoverRoot: HTMLElement): HTMLDivElement | null {
  const wrapper = popoverRoot.parentElement;
  if (!wrapper?.parentElement) return null;
  const rect = popoverRoot.getBoundingClientRect();
  const cs = getComputedStyle(popoverRoot);
  const wrapperZ = getComputedStyle(wrapper).zIndex;

  const scrim = document.createElement("div");
  scrim.setAttribute(PAGE_EXPAND_SCRIM_ATTR, "");
  scrim.setAttribute("aria-hidden", "true");
  scrim.style.position = "fixed";
  scrim.style.left = `${rect.left}px`;
  scrim.style.top = `${rect.top}px`;
  scrim.style.width = `${rect.width}px`;
  scrim.style.height = `${rect.height}px`;
  scrim.style.borderRadius = cs.borderRadius;
  scrim.style.backgroundColor = cs.backgroundColor;
  scrim.style.pointerEvents = "none";
  scrim.style.zIndex = wrapperZ;
  // Insert before the wrapper → same z-index, earlier in DOM = renders behind
  wrapper.parentElement.insertBefore(scrim, wrapper);
  return scrim;
}

/** Remove the pre-expand scrim and restore popover styles. */
function cleanupPageExpandScrim(popoverRoot: HTMLElement | null): void {
  if (!popoverRoot) return;
  popoverRoot.style.opacity = "";
  popoverRoot.style.transition = "";
  // Scrim is a sibling of the wrapper, find by attribute
  const scrim = document.querySelector(`[${PAGE_EXPAND_SCRIM_ATTR}]`);
  scrim?.remove();
}

function applyGhostRect(ghost: HTMLDivElement, rect: DOMRect): void {
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
}

type GhostMorphDirection = "expand" | "collapse";

interface GhostMorphOpts {
  direction: GhostMorphDirection;
  /** Spotlight rect in viewport coords (null → no iris). */
  spotlightRect: DOMRect | null;
  /** Border-radius at t=0 and t=1 respectively. */
  srcRadius: string;
  tgtRadius: string;
  duration: number;
  easing: string;
  /**
   * Citation anchor offset from ghost top-left (ghost-local coords).
   * Dev-only: passed through to the debug store so the overlay can draw the
   * anchor's viewport trajectory on top of each sampled ghost rect. If the
   * anchor trajectory drifts from the spotlight center, the aim is wrong.
   */
  anchorInGhostX?: number;
  anchorInGhostY?: number;
}

/**
 * Shared animation pipeline for page-expand and page-collapse ghosts.
 *
 * Both directions share pure-translate math, the same 6-keyframe opacity and
 * blur profile, and the same clip-path iris — with the iris timeline flipped
 * by `opts.direction`. Keeping them on one code path prevents drift: any fix
 * to aim, iris timing, or fade profile applies to both halves of the round trip.
 *
 * Clip-path iris behaviour:
 *   • expand  — ghost starts unclipped at source, iris CLOSES onto spotlight
 *               as the ghost lands (focus into the citation).
 *   • collapse — ghost starts clipped to the spotlight, iris OPENS to the
 *               full keyhole frame as the ghost lands (emerge from citation).
 *
 * The inset values are identical either way (the ghost is the same size at
 * both ends under pure translate, and its anchor coincides with the spotlight
 * at the expand-end and the collapse-start). Only the 0→1 interpolation
 * direction differs.
 */
function applyGhostMorph(ghost: HTMLDivElement, fromRect: DOMRect, toRect: DOMRect, opts: GhostMorphOpts): Animation {
  const translateX = toRect.left - fromRect.left;
  const translateY = toRect.top - fromRect.top;
  const tfAt = (t: number) => `translate(${translateX * t}px, ${translateY * t}px)`;
  const blurAt = (px: number) => (px > 0 ? `blur(${px}px)` : "none");

  // Clip-path iris inset math. The "convergence" rect is whichever end the
  // ghost overlaps with the spotlight: toRect for expand, fromRect for collapse.
  const convergenceRect = opts.direction === "expand" ? toRect : fromRect;
  const spot = opts.spotlightRect;
  let clipTop = 0;
  let clipRight = 0;
  let clipBottom = 0;
  let clipLeft = 0;
  if (spot) {
    const spotInGhostLeft = spot.left - convergenceRect.left;
    const spotInGhostTop = spot.top - convergenceRect.top;
    // `fromRect.width/height` are the ghost element's CSS dimensions (set at creation
    // from `snapshot.viewportRect`). Under pure-translate, toRect.width === fromRect.width,
    // so this is correct in both directions — these are the ghost's pixel dimensions, not
    // the convergence rect's.
    const spotInGhostRight = fromRect.width - (spotInGhostLeft + spot.width);
    const spotInGhostBottom = fromRect.height - (spotInGhostTop + spot.height);
    clipLeft = Math.max(0, spotInGhostLeft);
    clipTop = Math.max(0, spotInGhostTop);
    clipRight = Math.max(0, spotInGhostRight);
    clipBottom = Math.max(0, spotInGhostBottom);
  }
  const hasClip = clipTop > 0 || clipRight > 0 || clipBottom > 0 || clipLeft > 0;

  // Iris ramp differs by direction:
  //   • expand   — closes during translation (0.15→0.88). Closing-iris vector
  //                aligns with translate vector; both focus toward the destination.
  //   • collapse — stays fully clipped to spotlight until ghost has landed,
  //                then opens (0.55→0.88). Opening-iris during translation
  //                reveals image pixels asymmetrically (whichever inset is
  //                larger reveals more pixels per unit time), and the eye sums
  //                that lateral drift with the diagonal translate as
  //                "shoots sideways then down". With the open deferred to
  //                after the ghost arrives, the spotlight chunk travels on a
  //                clean line; the late open reveals the keyhole-shaped end
  //                frame in place. Endpoints align — the ghost is keyhole-sized
  //                and lands exactly on the keyhole strip — so the revealed
  //                pixels match the strip behind.
  const clipAt = (t: number) => {
    let ct: number;
    if (opts.direction === "expand") {
      ct = Math.min(1, Math.max(0, (t - 0.15) / 0.73));
    } else {
      ct = 1 - Math.min(1, Math.max(0, (t - 0.55) / 0.33));
    }
    return `inset(${clipTop * ct}px ${clipRight * ct}px ${clipBottom * ct}px ${clipLeft * ct}px)`;
  };

  // Choreography keyframes: opacity / blur / clip / radius only.
  // `transform` is animated separately (see below) so the eased curve is
  // applied once across the whole translate path. WAAPI applies an
  // animation-level easing PER KEYFRAME-PAIR, so packing transform into this
  // 6-keyframe array produces 5 mini ease-outs stitched together — the
  // ghost's velocity drops to ~0 at every internal offset, reading as a
  // pulsing motion. With transform on its own 2-keyframe animation the
  // eased curve covers the full path and velocity stays continuous.
  const keyframes: Keyframe[] = [
    {
      opacity: GHOST_OPACITY_START,
      filter: blurAt(GHOST_BLUR_START_PX),
      borderRadius: opts.srcRadius,
      ...(hasClip && { clipPath: clipAt(0) }),
    },
    {
      opacity: GHOST_OPACITY_EARLY,
      filter: blurAt(GHOST_BLUR_EARLY_PX),
      borderRadius: opts.srcRadius,
      offset: GHOST_OFFSET_EARLY,
      ...(hasClip && { clipPath: clipAt(GHOST_OFFSET_EARLY) }),
    },
    {
      opacity: GHOST_OPACITY_MID,
      filter: blurAt(GHOST_BLUR_MID_PX),
      borderRadius: opts.srcRadius,
      offset: GHOST_OFFSET_MID,
      ...(hasClip && { clipPath: clipAt(GHOST_OFFSET_MID) }),
    },
    {
      opacity: GHOST_OPACITY_LATE,
      filter: blurAt(GHOST_BLUR_LATE_PX),
      borderRadius: opts.tgtRadius,
      offset: GHOST_OFFSET_LATE,
      ...(hasClip && { clipPath: clipAt(GHOST_OFFSET_LATE) }),
    },
    {
      opacity: GHOST_OPACITY_PEAK,
      filter: blurAt(GHOST_BLUR_PEAK_PX),
      borderRadius: opts.tgtRadius,
      offset: GHOST_OFFSET_PEAK,
      ...(hasClip && { clipPath: clipAt(GHOST_OFFSET_PEAK) }),
    },
    {
      opacity: 0,
      filter: blurAt(0),
      borderRadius: opts.tgtRadius,
      ...(hasClip && { clipPath: clipAt(1) }),
    },
  ];

  const animation = ghost.animate(keyframes, { duration: opts.duration, easing: opts.easing, fill: "both" });
  const transformAnim = ghost.animate([{ transform: tfAt(0) }, { transform: tfAt(1) }], {
    duration: opts.duration,
    easing: opts.easing,
    fill: "both",
  });

  // Both animations must freeze and step together so harness scrub stays coherent.
  // Caller awaits `animation.finished` for cleanup; `transformAnim` is detached
  // when the caller removes the ghost element.
  if (process.env.NODE_ENV !== "production") {
    const debugKind = opts.direction === "expand" ? "page-expand" : "page-collapse";
    applyDebugFreeze(animation, debugKind, opts.duration);
    applyDebugFreeze(transformAnim, debugKind, opts.duration);
    registerActiveAnimations([animation, transformAnim]);
  }

  // Dev-only: capture endpoint rects AND per-rAF samples of the ghost's real
  // bounding rect during playback. Math-based overlays repeatedly diverged
  // from what appeared on screen (layout wrapping, compositor rounding,
  // iris-clip visual bounds, etc.) so we stop predicting and just record.
  // `getBoundingClientRect()` after each rAF is the definitive position the
  // user saw the ghost at during that frame.
  if (process.env.NODE_ENV !== "production") {
    const samples: Array<{ t: number; rect: DOMRect }> = [];
    const pushSample = (t: number) => samples.push({ t, rect: ghost.getBoundingClientRect() });
    pushSample(0);
    const tick = () => {
      if (!ghost.isConnected) return;
      const current = animation.currentTime;
      const progress = typeof current === "number" ? Math.max(0, Math.min(1, current / opts.duration)) : 0;
      pushSample(progress);
      setLastGhostRects({
        source: fromRect,
        target: toRect,
        direction: opts.direction,
        spotlight: opts.spotlightRect,
        anchorInGhostX: opts.anchorInGhostX,
        anchorInGhostY: opts.anchorInGhostY,
        samples: [...samples],
      });
      if (animation.playState === "running") {
        requestAnimationFrame(tick);
      }
    };
    // Seed the store with endpoints immediately so overlays work even on the
    // very first paint; rAF refinement kicks in from here.
    setLastGhostRects({
      source: fromRect,
      target: toRect,
      direction: opts.direction,
      spotlight: opts.spotlightRect,
      anchorInGhostX: opts.anchorInGhostX,
      anchorInGhostY: opts.anchorInGhostY,
      samples: [...samples],
    });
    requestAnimationFrame(tick);
  }

  return animation;
}

function runPageExpandGhostAnimation(
  ghost: HTMLDivElement,
  snapshot: GhostSnapshot,
  target: PageExpandTarget,
  popoverRoot: HTMLElement | null,
): void {
  const { ghostRect } = target;
  const debugPhase = getPageExpandDebugPhase();
  if (debugPhase === "source") {
    cleanupPageExpandScrim(popoverRoot);
    return;
  }
  if (debugPhase === "target") {
    cleanupPageExpandScrim(popoverRoot);
    applyGhostRect(ghost, ghostRect);
    return;
  }
  if (debugPhase === "both") {
    cleanupPageExpandScrim(popoverRoot);
    // "both" mode: hide the real ghost, draw persistent debug overlays for both rects
    ghost.remove();
    clearDebugOverlays();
    const kindLabel =
      snapshot.sourceKind === "summary-keyhole"
        ? "summary keyhole"
        : snapshot.sourceKind === "expanded-keyhole"
          ? "expanded keyhole"
          : "source";
    createDebugOverlay(
      snapshot.viewportRect,
      DEBUG_PAGE_EXPAND_SOURCE_COLOR,
      `SOURCE (${kindLabel})`,
      `anchor: (${snapshot.sourceAnchorX.toFixed(2)}, ${snapshot.sourceAnchorY.toFixed(2)})`,
    );
    createDebugOverlay(ghostRect, DEBUG_PAGE_EXPAND_TARGET_COLOR, "TARGET (ghost destination)");
    createDebugOverlay(target.markerRect, "#3b82f6", "MARKER (annotation VT rect)");
    if (process.env.NODE_ENV !== "production") {
      console.groupCollapsed("[DC debug] page-expand geometry");
      console.table({
        source: {
          left: snapshot.viewportRect.left,
          top: snapshot.viewportRect.top,
          width: snapshot.viewportRect.width,
          height: snapshot.viewportRect.height,
        },
        ghostTarget: {
          left: ghostRect.left,
          top: ghostRect.top,
          width: ghostRect.width,
          height: ghostRect.height,
        },
        marker: {
          left: target.markerRect.left,
          top: target.markerRect.top,
          width: target.markerRect.width,
          height: target.markerRect.height,
        },
      });
      console.log("snapshot:", snapshot);
      console.groupEnd();
    }
    return;
  }

  // Shared pipeline — see applyGhostMorph. Expand = iris CLOSES onto spotlight.
  const ghostDuration = scaleDuration(VT_EVIDENCE_PAGE_EXPAND_MS);
  const animation = applyGhostMorph(ghost, snapshot.viewportRect, ghostRect, {
    direction: "expand",
    spotlightRect: target.spotlightRect,
    srcRadius: snapshot.borderRadius,
    tgtRadius: "0px",
    duration: ghostDuration,
    easing: EASE_GHOST_EXPAND,
    anchorInGhostX: snapshot.imageOffsetLeft + snapshot.sourceAnchorX * snapshot.imageWidth,
    anchorInGhostY: snapshot.imageOffsetTop + snapshot.sourceAnchorY * snapshot.imageHeight,
  });

  // Page reveal starts immediately (t=0) with a slow ease-in, reaching full
  // opacity by ~0.85 — before the ghost lands at GHOST_OFFSET_PEAK (0.92).
  // The page is fully solid when the key snaps into the keyhole.
  if (popoverRoot) {
    const contentAnim = popoverRoot.animate(
      [
        { opacity: PAGE_EXPAND_CONTENT_OPACITY_FLOOR },
        { opacity: 0.08, offset: 0.18 },
        { opacity: 0.2, offset: 0.35 },
        { opacity: 0.4, offset: 0.5 },
        { opacity: 0.7, offset: 0.65 },
        { opacity: 0.92, offset: 0.78 },
        { opacity: 1, offset: 0.85 },
        { opacity: 1 },
      ],
      { duration: ghostDuration, easing: EASE_CONTENT_REVEAL, fill: "forwards" },
    );
    applyDebugFreeze(contentAnim, "page-expand", ghostDuration);
    contentAnim.finished
      .catch(() => {})
      .finally(() => {
        contentAnim.cancel();
        cleanupPageExpandScrim(popoverRoot);
      });
  }

  animation.finished
    .catch(() => {})
    .finally(() => {
      ghost.remove();
    });
}

function applyDebugFreeze(anim: Animation, kind: "page-expand" | "page-collapse", duration: number): void {
  if (process.env.NODE_ENV === "production") return;
  const frozen = getFrozen(kind);
  if (frozen === null) return;
  try {
    anim.pause();
    anim.currentTime = frozen * duration;
  } catch (err) {
    console.debug("[dc-debug] freeze failed — animation likely already settled", err);
  }
}

function waitForPageExpandTarget(
  root: ParentNode,
  snapshot: GhostSnapshot,
  callback: (target: PageExpandTarget | null) => void,
  attemptsLeft = 12,
  previousStableRect: DOMRect | null = null,
  stableFrames = 0,
): void {
  requestAnimationFrame(() => {
    const target = findPageExpandTarget(root, snapshot);
    const targetRect = target?.markerRect ?? null;
    const debugPhase = getPageExpandDebugPhase();
    if (
      targetRect &&
      isVisibleRect(targetRect) &&
      targetRect.bottom > 0 &&
      targetRect.right > 0 &&
      targetRect.top < window.innerHeight &&
      targetRect.left < window.innerWidth
    ) {
      if (debugPhase === "target" || debugPhase === "both") {
        callback(target);
        return;
      }
      const isStable =
        previousStableRect &&
        Math.abs(targetRect.left - previousStableRect.left) <= 1 &&
        Math.abs(targetRect.top - previousStableRect.top) <= 1 &&
        Math.abs(targetRect.width - previousStableRect.width) <= 1 &&
        Math.abs(targetRect.height - previousStableRect.height) <= 1;
      if (isStable && stableFrames >= 0) {
        callback(target);
        return;
      }
      if (attemptsLeft <= 1) {
        callback(target);
        return;
      }
      waitForPageExpandTarget(root, snapshot, callback, attemptsLeft - 1, targetRect, isStable ? stableFrames + 1 : 0);
      return;
    }
    if (attemptsLeft <= 1) {
      callback(target);
      return;
    }
    waitForPageExpandTarget(root, snapshot, callback, attemptsLeft - 1, null, 0);
  });
}

export function startEvidencePageExpandTransition(
  update: () => void,
  options?: { root?: ParentNode | null; skipAnimation?: boolean },
): void {
  const root = options?.root ?? null;
  if (options?.skipAnimation || typeof document === "undefined" || !root) {
    // Guard the transition depth even in the synchronous fallback so dismiss
    // handlers see a consistent in-flight state during the state update.
    _transitionDepth++;
    try {
      update();
    } finally {
      _transitionDepth = Math.max(0, _transitionDepth - 1);
    }
    return;
  }

  const debugPhase = getPageExpandDebugPhase();
  // Clear stale debug overlays from a previous transition / popover session
  // so every page-expand attempt starts fresh.
  if (debugPhase) clearDebugOverlays();

  // Resolve root to an HTMLElement for style manipulation. The root is
  // popoverContentRef.current — always an HTMLElement at runtime.
  const rootEl = root instanceof HTMLElement ? root : null;

  // Commit the state update and run the ghost transition in a microtask.
  // This matches the timing of the View Transition API (which defers its
  // callback), and avoids mutating the DOM via flushSync while the browser
  // is still processing the click event that triggered the expand — React
  // can lose track of the event target when it's replaced mid-handler.
  //
  // queueMicrotask typically fires before the next paint (within the same
  // task frame during React event batching), so the pre-dim + flushSync
  // + ghost creation all complete within the same visual frame.
  const commitAndAnimate = () => {
    // Guard: if another transition is already in flight, apply the state change
    // without animation to avoid dual-ghost / orphaned-scrim races.
    if (_transitionDepth > 0) {
      flushSync(update);
      return;
    }
    _transitionDepth++;
    const source = capturePageExpandSource(root);

    // Pre-dim the popover content BEFORE flushSync so when the expanded-page
    // slot becomes visible, it's already nearly invisible — preventing a flash
    // of the final layout. The reveal animation starts immediately (t=0) with
    // a slow ease-in so the page materialises subliminally under the ghost.
    //
    // Disable CSS transitions first so the blink-motion `transition: opacity 60ms`
    // doesn't compete. Cancel lingering WAAPI from a previous page-expand so
    // fill: "forwards" doesn't override the inline opacity.
    if (rootEl) {
      for (const anim of rootEl.getAnimations()) anim.cancel();
      rootEl.style.transition = "none";
      createPreExpandScrim(rootEl);
      rootEl.style.opacity = String(PAGE_EXPAND_CONTENT_OPACITY_FLOOR);
    }

    flushSync(update);

    if (!source) {
      cleanupPageExpandScrim(rootEl);
      if (debugPhase) {
        clearDebugOverlays();
        const primedEls = root.querySelectorAll?.("[data-dc-page-expand-source]");
        console.warn(
          "[DC debug] source capture FAILED — no visible source element found.",
          `${primedEls?.length ?? 0} [data-dc-page-expand-source] elements in root.`,
        );
      }
      _transitionDepth = Math.max(0, _transitionDepth - 1);
      return;
    }
    const ghost = createPageExpandGhost(source);
    if (!ghost) {
      cleanupPageExpandScrim(rootEl);
      if (debugPhase) {
        console.warn("[DC debug] ghost creation FAILED — image validation rejected:", source.imageSrc);
      }
      _transitionDepth = Math.max(0, _transitionDepth - 1);
      return;
    }
    waitForPageExpandTarget(root, source, target => {
      _transitionDepth = Math.max(0, _transitionDepth - 1);
      if (!target) {
        ghost.remove();
        cleanupPageExpandScrim(rootEl);
        if (debugPhase) {
          clearDebugOverlays();
          const targetEls = root.querySelectorAll?.("[data-dc-page-expand-target]");
          const readyEls = root.querySelectorAll?.('[data-dc-page-expand-ready="true"]');
          const kindLabel =
            source.sourceKind === "summary-keyhole"
              ? "summary keyhole"
              : source.sourceKind === "expanded-keyhole"
                ? "expanded keyhole"
                : "source";
          createDebugOverlay(
            source.viewportRect,
            DEBUG_PAGE_EXPAND_SOURCE_COLOR,
            `SOURCE (${kindLabel}) — TARGET NOT FOUND`,
            `anchor: (${source.sourceAnchorX.toFixed(2)}, ${source.sourceAnchorY.toFixed(2)})`,
          );
          console.warn(
            "[DC debug] target NOT FOUND after 12 rAF polls.",
            `\n  [data-dc-page-expand-target] elements: ${targetEls?.length ?? 0}`,
            `\n  [data-dc-page-expand-ready="true"] elements: ${readyEls?.length ?? 0}`,
            "\n  This usually means annotationVtRect is null (no text match on the page — not_found/miss state).",
            "\n  Source snapshot:",
            source,
          );
        }
        return;
      }
      runPageExpandGhostAnimation(ghost, source, target, rootEl);
    });
  };

  queueMicrotask(commitAndAnimate);
}

// =============================================================================
// PAGE COLLAPSE (reverse of page-expand ghost)
// =============================================================================

/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export type CollapsePreflushData = {
  /** Spotlight center in viewport coords — the ghost's starting anchor. */
  spotlightCX: number;
  spotlightCY: number;
  /** Full spotlight rect — used to drive the inverse clip-path iris on collapse. */
  spotlightRect: DOMRect;
  /** Evidence snippet image src (same image the keyhole strip shows). */
  keyholeImageSrc: string;
  keyholeNaturalWidth: number;
  keyholeNaturalHeight: number;
  /** Border-radius from the keyhole container's computed style. */
  borderRadius: string;
};

/**
 * Pre-flushSync capture for the collapse ghost.
 *
 * Reads the spotlight center (the visual anchor while the page view is still
 * shown) and the keyhole snippet image source. The keyhole element is in the
 * DOM (EvidenceZone triple-always-render) but `display:none`, so only src and
 * natural dimensions are accessible — layout dims come post-flushSync.
 *
 * Returns null when no spotlight is visible (miss/not_found states — no ghost).
 */
/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export function captureCollapsePreflushData(root: ParentNode): CollapsePreflushData | null {
  const spotlightEl = root.querySelector<HTMLElement>("[data-dc-spotlight]");
  const spotRect = spotlightEl?.getBoundingClientRect();
  if (!spotRect || !isVisibleRect(spotRect)) return null;

  // [data-dc-keyhole] is always in the DOM (EvidenceZone triple-always-render),
  // just display:none during expanded-page. Natural image dims are accessible.
  const keyholeEl = root.querySelector<HTMLElement>("[data-dc-keyhole]");
  if (!keyholeEl) return null;
  const keyholeImg = keyholeEl.querySelector<HTMLImageElement>("img");
  const keyholeImageSrc = keyholeImg?.currentSrc || keyholeImg?.src || "";
  if (!keyholeImg || !keyholeImageSrc || !isValidProofImageSrc(keyholeImageSrc)) return null;
  if (!keyholeImg.naturalWidth || !keyholeImg.naturalHeight) return null;

  return {
    spotlightCX: spotRect.left + spotRect.width / 2,
    spotlightCY: spotRect.top + spotRect.height / 2,
    spotlightRect: spotRect,
    keyholeImageSrc,
    keyholeNaturalWidth: keyholeImg.naturalWidth,
    keyholeNaturalHeight: keyholeImg.naturalHeight,
    borderRadius: getComputedStyle(keyholeEl).borderRadius || "0px",
  };
}

/**
 * Post-flushSync: builds the collapse ghost snapshot using the now-visible
 * destination element's layout. The ghost is destination-sized and centered
 * on the pre-captured spotlight so its annotation anchor aligns with the
 * spotlight center — exact reverse of the expand ghost's `buildGhostTarget`.
 *
 * Handles both collapse-to-summary ([data-dc-keyhole] visible) and
 * collapse-to-expanded-keyhole ([data-dc-inline-expanded] visible).
 */
/** @internal — exported for `./debug/viewTransitionOverlay.ts`, not part of the public API. */
export function buildCollapseGhostSnapshot(data: CollapsePreflushData, root: ParentNode): GhostSnapshot | null {
  // Find the visible destination — same priority as findPageCollapseTarget.
  let destEl: HTMLElement | null = null;
  let destRect: DOMRect | null = null;
  const keyholeEl = root.querySelector<HTMLElement>("[data-dc-keyhole]");
  if (keyholeEl) {
    const r = keyholeEl.getBoundingClientRect();
    if (isVisibleRect(r)) {
      destEl = keyholeEl;
      destRect = r;
    }
  }
  if (!destEl) {
    const expandedEl = root.querySelector<HTMLElement>("[data-dc-inline-expanded]");
    if (expandedEl) {
      const r = expandedEl.getBoundingClientRect();
      if (isVisibleRect(r)) {
        destEl = expandedEl;
        destRect = r;
      }
    }
  }
  if (!destEl || !destRect) return null;

  const destImg = destEl.querySelector<HTMLImageElement>("img");
  const imgRect = destImg?.getBoundingClientRect();
  const hasImgRect = !!imgRect && isVisibleRect(imgRect);
  const imageOffsetLeft = hasImgRect ? imgRect.left - destRect.left : 0;
  const imageOffsetTop = hasImgRect ? imgRect.top - destRect.top : 0;
  const imageWidth = hasImgRect ? imgRect.width : destRect.width;
  const imageHeight = hasImgRect ? imgRect.height : destRect.height;

  // The destination keyhole / expanded-keyhole already advertises the
  // annotation anchor ratio via data-dc-source-anchor-x/y (it doubles as a
  // page-expand-source when clicked). Reading those values here makes the
  // collapse a TRUE inverse of expand: both sides align the SAME annotation
  // anchor with the spotlight. Using imageWidth/2 (image center) instead
  // works only when the annotation happens to sit at the image midpoint —
  // for off-center matches it produces a constant pixel offset between the
  // ghost's annotation and the spotlight, which reads as x/y-axis overshoot
  // when the ghost hands off to the real element.
  const sourceAnchorX = readAnchorDataset(destEl, "X");
  const sourceAnchorY = readAnchorDataset(destEl, "Y");

  const anchorInGhostX = imageOffsetLeft + sourceAnchorX * imageWidth;
  const anchorInGhostY = imageOffsetTop + sourceAnchorY * imageHeight;

  return {
    viewportRect: new DOMRect(
      data.spotlightCX - anchorInGhostX,
      data.spotlightCY - anchorInGhostY,
      destRect.width,
      destRect.height,
    ),
    imageSrc: data.keyholeImageSrc,
    imageOffsetLeft,
    imageOffsetTop,
    imageWidth,
    imageHeight,
    imageNaturalWidth: data.keyholeNaturalWidth,
    imageNaturalHeight: data.keyholeNaturalHeight,
    sourceKind: null,
    sourceAnchorX,
    sourceAnchorY,
    borderRadius: data.borderRadius,
  };
}

/**
 * After flushSync to summary, find the keyhole strip as the collapse target.
 * Polls with rAF like the expand path — the keyhole image may need a frame
 * to load/render.
 */
function findPageCollapseTarget(root: ParentNode): DOMRect | null {
  // Summary keyhole strip (most common collapse target)
  const keyhole = root.querySelector<HTMLElement>("[data-dc-keyhole]");
  if (keyhole) {
    const rect = keyhole.getBoundingClientRect();
    if (isVisibleRect(rect)) return rect;
  }
  // Fallback: expanded-keyhole container (when collapsing page → expanded-keyhole)
  const expanded = root.querySelector<HTMLElement>("[data-dc-inline-expanded]");
  if (expanded) {
    const rect = expanded.getBoundingClientRect();
    if (isVisibleRect(rect)) return rect;
  }
  return null;
}

function waitForPageCollapseTarget(
  root: ParentNode,
  callback: (rect: DOMRect | null) => void,
  attemptsLeft = 12,
  previousRect: DOMRect | null = null,
  stableFrames = 0,
): void {
  requestAnimationFrame(() => {
    const rect = findPageCollapseTarget(root);
    if (rect && isVisibleRect(rect)) {
      const isStable =
        previousRect &&
        Math.abs(rect.left - previousRect.left) <= 1 &&
        Math.abs(rect.top - previousRect.top) <= 1 &&
        Math.abs(rect.width - previousRect.width) <= 1 &&
        Math.abs(rect.height - previousRect.height) <= 1;
      if (isStable && stableFrames >= 0) {
        callback(rect);
        return;
      }
      if (attemptsLeft <= 1) {
        callback(rect);
        return;
      }
      waitForPageCollapseTarget(root, callback, attemptsLeft - 1, rect, isStable ? stableFrames + 1 : 0);
      return;
    }
    if (attemptsLeft <= 1) {
      callback(rect);
      return;
    }
    waitForPageCollapseTarget(root, callback, attemptsLeft - 1, null, 0);
  });
}

/**
 * Runs the reverse ghost animation: spotlight → keyhole strip.
 * Pure translate (no scale) — like the expand, the ghost keeps its source
 * dimensions and slides into position. Blur masks any size mismatch during
 * the fast animation. Faster and more decisive than expand.
 */
function runPageCollapseGhostAnimation(
  ghost: HTMLDivElement,
  snapshot: GhostSnapshot,
  keyholeRect: DOMRect,
  spotlightRect: DOMRect | null,
  popoverRoot: HTMLElement | null,
  onDone: () => void,
): void {
  const src = snapshot.viewportRect;

  // Pure translate: seat the ghost on the keyhole strip's top-left. The ghost's
  // inner <img> was already positioned at the destination strip's live
  // imageOffsetLeft by createPageExpandGhost (see buildCollapseGhostSnapshot),
  // so the ghost's annotation anchor lands at the same viewport position as the
  // real keyhole's annotation when ghostLeft === stripLeft. Prior code used
  // keyholeRect.center − anchorInGhost, which only coincided with stripLeft
  // when the strip width-filled (imageOffsetLeft = 0 and anchor ≈ stripW/2);
  // when the strip was pannable, that formula parked the ghost at strip center
  // regardless of pan, producing a (stripCenter − anchorViewport) gap on
  // handoff.
  const anchorInGhostX = snapshot.imageOffsetLeft + snapshot.sourceAnchorX * snapshot.imageWidth;
  const anchorInGhostY = snapshot.imageOffsetTop + snapshot.sourceAnchorY * snapshot.imageHeight;
  const toRect = new DOMRect(keyholeRect.left, keyholeRect.top, src.width, src.height);

  // Shared pipeline — see applyGhostMorph. Collapse = iris OPENS from spotlight.
  const collapseDuration = scaleDuration(PAGE_COLLAPSE_GHOST_MS);
  const animation = applyGhostMorph(ghost, src, toRect, {
    direction: "collapse",
    spotlightRect,
    srcRadius: snapshot.borderRadius || "0px",
    tgtRadius: KEYHOLE_STRIP_BORDER_RADIUS,
    duration: collapseDuration,
    easing: EASE_COLLAPSE,
    anchorInGhostX,
    anchorInGhostY,
  });

  let pendingAnimations = popoverRoot ? 2 : 1;
  const markAnimationDone = () => {
    pendingAnimations -= 1;
    if (pendingAnimations === 0) onDone();
  };

  // Content reveal: holds at floor until GHOST_OFFSET_LATE (~68% of flight),
  // then ramps to 35% by GHOST_OFFSET_PEAK (~92%), then finishes 35%→1.0
  // after the ghost exits. These offsets match the collapse ghost's fade
  // schedule from applyGhostMorph. Collapse needs a LATE reveal because
  // destination content can occupy area the ghost hasn't covered yet (large
  // vertical travel from page to keyhole). Revealing earlier caused pop-through.
  if (popoverRoot) {
    const contentAnim = popoverRoot.animate(
      [
        { opacity: PAGE_EXPAND_CONTENT_OPACITY_FLOOR },
        { opacity: PAGE_EXPAND_CONTENT_OPACITY_FLOOR, offset: GHOST_OFFSET_LATE },
        { opacity: 0.35, offset: GHOST_OFFSET_PEAK },
        { opacity: 1 },
      ],
      { duration: collapseDuration, easing: EASE_CONTENT_REVEAL, fill: "forwards" },
    );
    applyDebugFreeze(contentAnim, "page-collapse", collapseDuration);
    contentAnim.finished
      .catch(() => {})
      .finally(() => {
        contentAnim.cancel();
        cleanupPageExpandScrim(popoverRoot);
        markAnimationDone();
      });
  }

  animation.finished
    .catch(() => {})
    .finally(() => {
      ghost.remove();
      markAnimationDone();
    });
}

/**
 * Page-collapse transition: expanded-page → summary/expanded-keyhole.
 * Reverse of `startEvidencePageExpandTransition`.
 *
 * Ghost uses the keyhole evidence snippet image (same src as the expand ghost)
 * for visual continuity — the "key" slides back out of the page and returns
 * to the keyhole. Two-phase capture:
 *
 * 1. Pre-flushSync: spotlight center + keyhole image src/natural dims.
 * 2. Post-flushSync: destination layout (now visible) → compute ghost start rect.
 *
 * The ghost is destination-sized, centered on the spotlight, and translates
 * to the destination rect — exact reverse of the expand ghost path.
 */
export function startEvidencePageCollapseTransition(
  update: () => void,
  options?: { root?: ParentNode | null; skipAnimation?: boolean },
): void {
  const root = options?.root ?? null;
  if (options?.skipAnimation || typeof document === "undefined" || !root) {
    _transitionDepth++;
    try {
      update();
    } finally {
      _transitionDepth = Math.max(0, _transitionDepth - 1);
    }
    return;
  }

  const rootEl = root instanceof HTMLElement ? root : null;

  const commitAndAnimate = () => {
    // Guard: if another transition is already in flight, apply the state change
    // without animation to avoid dual-ghost / orphaned-scrim races.
    if (_transitionDepth > 0) {
      flushSync(update);
      return;
    }
    _transitionDepth++;

    // Phase 1 (pre-flushSync): capture spotlight center + keyhole image info.
    // The keyhole element is display:none but in the DOM — src/naturalDims accessible.
    const preflush = captureCollapsePreflushData(root);

    // Pre-dim before flushSync — same pattern as expand.
    if (rootEl) {
      for (const anim of rootEl.getAnimations()) anim.cancel();
      rootEl.style.transition = "none";
      createPreExpandScrim(rootEl);
      rootEl.style.opacity = String(PAGE_EXPAND_CONTENT_OPACITY_FLOOR);
    }

    flushSync(update);

    // No spotlight (miss/not_found) — skip ghost, just let content reveal.
    if (!preflush) {
      cleanupPageExpandScrim(rootEl);
      _transitionDepth = Math.max(0, _transitionDepth - 1);
      return;
    }

    // Phase 2 (post-flushSync): destination is now visible — read its layout
    // and compute the ghost's starting rect (spotlight-aligned, dest-sized).
    const snapshot = buildCollapseGhostSnapshot(preflush, root);
    if (!snapshot) {
      cleanupPageExpandScrim(rootEl);
      _transitionDepth = Math.max(0, _transitionDepth - 1);
      return;
    }

    const ghost = createPageExpandGhost(snapshot);
    if (!ghost) {
      cleanupPageExpandScrim(rootEl);
      _transitionDepth = Math.max(0, _transitionDepth - 1);
      return;
    }

    waitForPageCollapseTarget(root, keyholeRect => {
      if (!keyholeRect) {
        ghost.remove();
        cleanupPageExpandScrim(rootEl);
        _transitionDepth = Math.max(0, _transitionDepth - 1);
        return;
      }
      // Re-measure against the now-stable layout. Late horizontal settles
      // (useViewportBoundaryGuard's safety timer at BLINK_ENTER_TOTAL_MS+16,
      // and usePopoverAlignOffset's ResizeObserver-driven recompute) can shift
      // the destination after the initial post-flushSync snapshot. Without this
      // re-measure, the ghost's start position and image-anchor come from the
      // pre-settle layout while `keyholeRect` comes from the settled layout —
      // visible as an x-axis "overshoot" of the ghost past where the real
      // keyhole reveals.
      const stableSnapshot = buildCollapseGhostSnapshot(preflush, root) ?? snapshot;
      applyGhostRect(ghost, stableSnapshot.viewportRect);
      const ghostImg = ghost.querySelector<HTMLImageElement>("img");
      if (ghostImg) {
        ghostImg.style.left = `${stableSnapshot.imageOffsetLeft}px`;
        ghostImg.style.top = `${stableSnapshot.imageOffsetTop}px`;
        ghostImg.style.width = `${stableSnapshot.imageWidth}px`;
        ghostImg.style.height = `${stableSnapshot.imageHeight}px`;
      }
      runPageCollapseGhostAnimation(ghost, stableSnapshot, keyholeRect, preflush.spotlightRect, rootEl, () => {
        _transitionDepth = Math.max(0, _transitionDepth - 1);
      });
    });
  };

  queueMicrotask(commitAndAnimate);
}
