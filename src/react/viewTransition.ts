import { flushSync } from "react-dom";
import {
  DEBUG_PAGE_EXPAND_SOURCE_COLOR,
  DEBUG_PAGE_EXPAND_TARGET_COLOR,
  EASE_COLLAPSE,
  EASE_CONTENT_REVEAL,
  EASE_GHOST_EXPAND,
  GHOST_BLUR_COLLAPSE_EARLY_PX,
  GHOST_BLUR_COLLAPSE_LATE_PX,
  GHOST_BLUR_COLLAPSE_MID_PX,
  GHOST_BLUR_EARLY_PX,
  GHOST_BLUR_LATE_PX,
  GHOST_BLUR_MID_PX,
  GHOST_BLUR_PEAK_PX,
  GHOST_BLUR_START_PX,
  GHOST_OFFSET_COLLAPSE_EARLY,
  GHOST_OFFSET_COLLAPSE_MID,
  GHOST_OFFSET_COLLAPSE_PEAK,
  GHOST_OFFSET_EARLY,
  GHOST_OFFSET_LATE,
  GHOST_OFFSET_MID,
  GHOST_OFFSET_PEAK,
  GHOST_OPACITY_COLLAPSE_MID,
  GHOST_OPACITY_COLLAPSE_PEAK,
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

type GhostSnapshot = {
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

function isVisibleRect(rect: DOMRect): boolean {
  return rect.width > 0.5 && rect.height > 0.5;
}

type DebugPhase = "source" | "target" | "both" | null;

function getPageExpandDebugPhase(): DebugPhase {
  if (typeof document === "undefined") return null;
  const phase = document.documentElement.dataset.dcPageExpandDebugPhase;
  if (phase === "source" || phase === "target" || phase === "both") return phase;
  return null;
}

/** Remove all debug overlays from the DOM. */
function clearDebugOverlays(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-dc-debug-overlay]").forEach(el => el.remove());
}

/** Shared font for debug labels. */
const DEBUG_LABEL_FONT = "10px/1.2 ui-monospace, SFMono-Regular, monospace";

/** Create a debug overlay box at the given rect with a colored outline and label. */
function createDebugOverlay(rect: DOMRect, color: string, label: string, sublabel?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.dataset.dcDebugOverlay = "";
  el.style.position = "fixed";
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.outline = `2px solid ${color}`;
  el.style.outlineOffset = "-1px";
  el.style.backgroundColor = `${color}22`;
  el.style.pointerEvents = "none";
  el.style.zIndex = "2147483647";
  el.style.overflow = "visible";

  // Label badge
  const badge = document.createElement("div");
  badge.style.position = "absolute";
  badge.style.top = "-18px";
  badge.style.left = "0";
  badge.style.background = color;
  badge.style.color = "#fff";
  badge.style.font = DEBUG_LABEL_FONT;
  badge.style.padding = "1px 5px";
  badge.style.borderRadius = "3px 3px 0 0";
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

function capturePageExpandSource(root: ParentNode): GhostSnapshot | null {
  const primedSource = takePrimedPageExpandSource(root);
  const candidates = primedSource
    ? [primedSource]
    : Array.from(root.querySelectorAll<HTMLElement>("[data-dc-page-expand-source]"));
  for (const sourceEl of candidates) {
    const rect = sourceEl.getBoundingClientRect();
    if (!isVisibleRect(rect)) continue;
    const img = sourceEl.querySelector<HTMLImageElement>("img");
    const imageRect = img?.getBoundingClientRect();
    const imageSrc = img?.currentSrc || img?.src;
    if (!img || !imageRect || !imageSrc || !isVisibleRect(imageRect)) continue;
    const sourceAnchorXRaw = Number.parseFloat(sourceEl.dataset.dcSourceAnchorX ?? "");
    const sourceAnchorYRaw = Number.parseFloat(sourceEl.dataset.dcSourceAnchorY ?? "");
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
      sourceAnchorX:
        Number.isFinite(sourceAnchorXRaw) && sourceAnchorXRaw >= 0 && sourceAnchorXRaw <= 1 ? sourceAnchorXRaw : 0.5,
      sourceAnchorY:
        Number.isFinite(sourceAnchorYRaw) && sourceAnchorYRaw >= 0 && sourceAnchorYRaw <= 1 ? sourceAnchorYRaw : 0.5,
      borderRadius: getComputedStyle(sourceEl).borderRadius || "0px",
    };
  }
  return null;
}

type PageExpandTarget = {
  markerRect: DOMRect;
  ghostRect: DOMRect;
  /** Spotlight rect in viewport coords, used for clip-path convergence. Null when no spotlight. */
  spotlightRect: DOMRect | null;
};

function buildGhostTarget(
  snapshot: GhostSnapshot,
  targetEl: HTMLElement,
  markerRect: DOMRect,
): { ghostRect: DOMRect; spotlightRect: DOMRect | null } {
  // Pure translate — the keyhole image is already at the correct rendered scale,
  // so the ghost keeps the keyhole's exact dimensions and slides into position
  // like a key into a keyhole. No scale = no squash/stretch.
  //
  // The keyhole viewport may be scrolled so only part of the evidence crop is
  // visible (e.g. right half when the match is on the right). We find the
  // annotation center WITHIN the ghost (imageOffset + imageSize/2) and align
  // that point with the annotation center on the expanded page. This ensures
  // content alignment regardless of keyhole scroll position.
  const srcW = snapshot.viewportRect.width;
  const srcH = snapshot.viewportRect.height;

  // Annotation center within the ghost element: the evidence crop image is
  // centered on the annotation, so the image center ≈ annotation center.
  // imageOffset accounts for keyhole scroll position.
  const anchorInGhostX = snapshot.imageOffsetLeft + snapshot.imageWidth / 2;
  const anchorInGhostY = snapshot.imageOffsetTop + snapshot.imageHeight / 2;

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
 */
function buildGhostTargetFromViewport(root: ParentNode): PageExpandTarget | null {
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
    // Ghost target = intersection of the container viewport and the image rect
    // (the visible portion of the page image on screen).
    const left = Math.max(containerRect.left, imgRect.left);
    const top = Math.max(containerRect.top, imgRect.top);
    const right = Math.min(containerRect.right, imgRect.right);
    const bottom = Math.min(containerRect.bottom, imgRect.bottom);
    if (right <= left || bottom <= top) continue;
    const visibleRect = new DOMRect(left, top, right - left, bottom - top);
    return { markerRect: visibleRect, ghostRect: visibleRect, spotlightRect: null };
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
  return buildGhostTargetFromViewport(root);
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
  ghost.style.willChange = "transform, opacity";
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

  // Animate transform + opacity + blur + clip-path + borderRadius.
  // All compositor-friendly — no layout thrash per frame.
  const src = snapshot.viewportRect;
  const scaleX = ghostRect.width / src.width;
  const scaleY = ghostRect.height / src.height;
  const translateX = ghostRect.left - src.left;
  const translateY = ghostRect.top - src.top;

  const tfAt = (t: number) =>
    `translate(${translateX * t}px, ${translateY * t}px) scale(${1 + (scaleX - 1) * t}, ${1 + (scaleY - 1) * t})`;
  const blurAt = (px: number) => (px > 0 ? `blur(${px}px)` : "none");

  // --- #3 Clip-path convergence ---
  // In the last ~30%, iris the ghost's visible area down to the spotlight rect.
  // Trims the excess keyhole padding so the ghost visually converges onto the
  // landing zone instead of just vanishing as an oversized strip.
  const spotlight = target.spotlightRect;
  let clipTop = 0;
  let clipRight = 0;
  let clipBottom = 0;
  let clipLeft = 0;
  if (spotlight) {
    // Spotlight rect relative to the ghost element at landing (t=1).
    // Ghost element sits at ghostRect in viewport coords; spotlight is also viewport.
    const spotInGhostLeft = spotlight.left - ghostRect.left;
    const spotInGhostTop = spotlight.top - ghostRect.top;
    const spotInGhostRight = src.width - (spotInGhostLeft + spotlight.width);
    const spotInGhostBottom = src.height - (spotInGhostTop + spotlight.height);
    clipLeft = Math.max(0, spotInGhostLeft);
    clipTop = Math.max(0, spotInGhostTop);
    clipRight = Math.max(0, spotInGhostRight);
    clipBottom = Math.max(0, spotInGhostBottom);
  }
  const hasClip = clipTop > 0 || clipRight > 0 || clipBottom > 0 || clipLeft > 0;
  // Clip ramps 0.42→0.88 so it's fully converged before the ghost's last visible
  // frame (GHOST_OFFSET_PEAK = 0.92, opacity 0.4). The key must be fully seated
  // in the keyhole by the time it becomes visible through the fading ghost.
  const clipAt = (t: number) => {
    const ct = Math.min(1, Math.max(0, (t - 0.42) / 0.46));
    return `inset(${clipTop * ct}px ${clipRight * ct}px ${clipBottom * ct}px ${clipLeft * ct}px)`;
  };

  // --- #5 Border-radius morph ---
  const srcRadius = snapshot.borderRadius;
  const tgtRadius = "0px";

  // Motion blur is the sole mid-flight cue — ghost stays fully opaque (1.0)
  // through flight, fades only during handoff to page content.
  const keyframes: Keyframe[] = [
    {
      transform: tfAt(0),
      opacity: GHOST_OPACITY_START,
      filter: blurAt(GHOST_BLUR_START_PX),
      borderRadius: srcRadius,
      ...(hasClip && { clipPath: clipAt(0) }),
    },
    {
      transform: tfAt(GHOST_OFFSET_EARLY),
      opacity: GHOST_OPACITY_EARLY,
      filter: blurAt(GHOST_BLUR_EARLY_PX),
      borderRadius: srcRadius,
      offset: GHOST_OFFSET_EARLY,
      ...(hasClip && { clipPath: clipAt(GHOST_OFFSET_EARLY) }),
    },
    {
      transform: tfAt(GHOST_OFFSET_MID),
      opacity: GHOST_OPACITY_MID,
      filter: blurAt(GHOST_BLUR_MID_PX),
      borderRadius: srcRadius,
      offset: GHOST_OFFSET_MID,
      ...(hasClip && { clipPath: clipAt(GHOST_OFFSET_MID) }),
    },
    {
      transform: tfAt(GHOST_OFFSET_LATE),
      opacity: GHOST_OPACITY_LATE,
      filter: blurAt(GHOST_BLUR_LATE_PX),
      borderRadius: tgtRadius,
      offset: GHOST_OFFSET_LATE,
      ...(hasClip && { clipPath: clipAt(GHOST_OFFSET_LATE) }),
    },
    {
      transform: tfAt(1),
      opacity: GHOST_OPACITY_PEAK,
      filter: blurAt(GHOST_BLUR_PEAK_PX),
      borderRadius: tgtRadius,
      offset: GHOST_OFFSET_PEAK,
      ...(hasClip && { clipPath: clipAt(GHOST_OFFSET_PEAK) }),
    },
    {
      transform: tfAt(1),
      opacity: 0,
      filter: blurAt(0),
      borderRadius: tgtRadius,
      ...(hasClip && { clipPath: clipAt(1) }),
    },
  ];

  // #6 — EASE_GHOST_EXPAND: deliberate departure, confident arrival.
  const animation = ghost.animate(keyframes, {
    duration: VT_EVIDENCE_PAGE_EXPAND_MS,
    easing: EASE_GHOST_EXPAND,
    fill: "both",
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
      { duration: VT_EVIDENCE_PAGE_EXPAND_MS, easing: EASE_CONTENT_REVEAL, fill: "forwards" },
    );
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

type CollapsePreflushData = {
  /** Spotlight center in viewport coords — the ghost's starting anchor. */
  spotlightCX: number;
  spotlightCY: number;
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
function captureCollapsePreflushData(root: ParentNode): CollapsePreflushData | null {
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
function buildCollapseGhostSnapshot(data: CollapsePreflushData, root: ParentNode): GhostSnapshot | null {
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

  // Ghost is destination-sized. Position it so the image center (annotation
  // anchor within the ghost) aligns with the spotlight center — the exact
  // reverse of buildGhostTarget in the expand path.
  const anchorInGhostX = imageOffsetLeft + imageWidth / 2;
  const anchorInGhostY = imageOffsetTop + imageHeight / 2;

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
    sourceAnchorX: 0.5,
    sourceAnchorY: 0.5,
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
  popoverRoot: HTMLElement | null,
): void {
  const src = snapshot.viewportRect;

  // Pure translate: align the ghost's annotation anchor (image center in ghost
  // coords, same formula as buildGhostTarget in the expand path) with the
  // keyhole center. Using src.width/2 would only be correct when the image
  // exactly fills the ghost container with no scroll offset.
  const anchorInGhostX = snapshot.imageOffsetLeft + snapshot.imageWidth / 2;
  const anchorInGhostY = snapshot.imageOffsetTop + snapshot.imageHeight / 2;
  const targetCX = keyholeRect.left + keyholeRect.width / 2;
  const targetCY = keyholeRect.top + keyholeRect.height / 2;
  const translateX = targetCX - anchorInGhostX - src.left;
  const translateY = targetCY - anchorInGhostY - src.top;

  const tfAt = (t: number) => `translate(${translateX * t}px, ${translateY * t}px)`;
  const blurAt = (px: number) => (px > 0 ? `blur(${px}px)` : "none");

  // Collapse: solid at start, blur mid-flight, fade out at keyhole.
  // Faster profile — fewer keyframes, sharper curve than expand.
  // Ghost starts with the keyhole's border-radius (the snippet image frame)
  // and maintains it throughout — no radius morph needed for this direction.
  const startRadius = snapshot.borderRadius || "0px";
  const keyframes: Keyframe[] = [
    { transform: tfAt(0), opacity: 1, filter: blurAt(GHOST_BLUR_START_PX), borderRadius: startRadius },
    {
      transform: tfAt(GHOST_OFFSET_COLLAPSE_EARLY),
      opacity: 1,
      filter: blurAt(GHOST_BLUR_COLLAPSE_EARLY_PX),
      borderRadius: startRadius,
      offset: GHOST_OFFSET_COLLAPSE_EARLY,
    },
    {
      transform: tfAt(GHOST_OFFSET_COLLAPSE_MID),
      opacity: GHOST_OPACITY_COLLAPSE_MID,
      filter: blurAt(GHOST_BLUR_COLLAPSE_MID_PX),
      borderRadius: startRadius,
      offset: GHOST_OFFSET_COLLAPSE_MID,
    },
    {
      transform: tfAt(1),
      opacity: GHOST_OPACITY_COLLAPSE_PEAK,
      filter: blurAt(GHOST_BLUR_COLLAPSE_LATE_PX),
      borderRadius: KEYHOLE_STRIP_BORDER_RADIUS,
      offset: GHOST_OFFSET_COLLAPSE_PEAK,
    },
    { transform: tfAt(1), opacity: 0, filter: blurAt(GHOST_BLUR_PEAK_PX), borderRadius: KEYHOLE_STRIP_BORDER_RADIUS },
  ];

  // EASE_COLLAPSE: fast departure, decisive deceleration — appropriate for exits.
  const animation = ghost.animate(keyframes, {
    duration: PAGE_COLLAPSE_GHOST_MS,
    easing: EASE_COLLAPSE,
    fill: "both",
  });

  // Popover content reveals quickly — collapse is decisive, page should snap in.
  if (popoverRoot) {
    const contentAnim = popoverRoot.animate(
      [
        { opacity: PAGE_EXPAND_CONTENT_OPACITY_FLOOR },
        { opacity: 0.15, offset: 0.2 },
        { opacity: 0.5, offset: 0.45 },
        { opacity: 0.85, offset: 0.7 },
        { opacity: 1, offset: 0.85 },
        { opacity: 1 },
      ],
      { duration: PAGE_COLLAPSE_GHOST_MS, easing: EASE_CONTENT_REVEAL, fill: "forwards" },
    );
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
      _transitionDepth = Math.max(0, _transitionDepth - 1);
      if (!keyholeRect) {
        ghost.remove();
        cleanupPageExpandScrim(rootEl);
        return;
      }
      runPageCollapseGhostAnimation(ghost, snapshot, keyholeRect, rootEl);
    });
  };

  queueMicrotask(commitAndAnimate);
}

// =============================================================================
// CONSOLE DEBUG API
// =============================================================================
//
// Usage from browser DevTools:
//   __dcDebugPageExpand("both")   — show source + target + marker overlays
//   __dcDebugPageExpand("source") — freeze ghost at source rect
//   __dcDebugPageExpand("target") — freeze ghost at target rect
//   __dcDebugPageExpand(null)     — disable debug mode
//   __dcDebugPageExpand()         — toggle: off → "both" → "source" → "target" → off
//   __dcDebugPageExpand.clear()   — remove debug overlays without changing mode

if (typeof window !== "undefined") {
  const CYCLE: DebugPhase[] = ["both", "source", "target", null];

  const api = (phase?: DebugPhase | undefined) => {
    if (phase === undefined) {
      // Cycle through modes
      const current = getPageExpandDebugPhase();
      const idx = CYCLE.indexOf(current);
      const next = CYCLE[(idx + 1) % CYCLE.length];
      return api(next ?? null);
    }
    if (phase === null) {
      delete document.documentElement.dataset.dcPageExpandDebugPhase;
      clearDebugOverlays();
      console.log("[DC debug] page-expand debug OFF");
    } else {
      document.documentElement.dataset.dcPageExpandDebugPhase = phase;
      if (phase !== "both") clearDebugOverlays();
      console.log(
        `[DC debug] page-expand debug: %c${phase}`,
        `color: ${phase === "source" ? DEBUG_PAGE_EXPAND_SOURCE_COLOR : phase === "target" ? DEBUG_PAGE_EXPAND_TARGET_COLOR : "#3b82f6"}; font-weight: bold`,
        "— click a page pill / View Page to trigger",
      );
    }
    return phase;
  };
  api.clear = () => {
    clearDebugOverlays();
    console.log("[DC debug] overlays cleared");
  };

  /** Scan the live DOM and outline all page-expand source/target elements without triggering a transition. */
  api.scan = () => {
    clearDebugOverlays();
    const sources = document.querySelectorAll<HTMLElement>("[data-dc-page-expand-source]");
    const targets = document.querySelectorAll<HTMLElement>("[data-dc-page-expand-target]");
    let sourceCount = 0;
    let targetCount = 0;
    sources.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (!isVisibleRect(rect)) return;
      sourceCount++;
      const kind = el.dataset.dcPageExpandSourceKind ?? "unknown";
      const anchorX = el.dataset.dcSourceAnchorX ?? "—";
      const anchorY = el.dataset.dcSourceAnchorY ?? "—";
      createDebugOverlay(rect, DEBUG_PAGE_EXPAND_SOURCE_COLOR, `SOURCE (${kind})`, `anchor: (${anchorX}, ${anchorY})`);
    });
    targets.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (!isVisibleRect(rect)) return;
      targetCount++;
      const ready = el.dataset.dcPageExpandReady;
      const color = ready === "true" ? DEBUG_PAGE_EXPAND_TARGET_COLOR : "#f59e0b";
      createDebugOverlay(rect, color, `TARGET (ready=${ready ?? "?"})`);
    });
    console.log(
      `[DC debug] scan: ${sourceCount} visible source(s), ${targetCount} visible target(s)`,
      `\n  Total in DOM: ${sources.length} source(s), ${targets.length} target(s)`,
    );
    return { sources: sourceCount, targets: targetCount };
  };

  (window as unknown as Record<string, unknown>).__dcDebugPageExpand = api;
}
