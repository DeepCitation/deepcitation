import { flushSync } from "react-dom";
import { BOX_PADDING, SPOTLIGHT_PADDING } from "../drawing/citationDrawing.js";
import {
  BLINK_ENTER_EASING,
  DEBUG_PAGE_EXPAND_SOURCE_COLOR,
  DEBUG_PAGE_EXPAND_TARGET_COLOR,
  EASE_COLLAPSE,
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
  PAGE_EXPAND_CONTENT_OPACITY_FLOOR,
  PAGE_EXPAND_RECESSION_MS,
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
  options?: { isCollapse?: boolean; isPageExpand?: boolean; skipAnimation?: boolean },
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
};

function buildGhostTargetRect(_snapshot: GhostSnapshot, targetEl: HTMLElement, markerRect: DOMRect): DOMRect {
  // The ghost lands on the annotation spotlight — the "light area" cutout in
  // the dimming overlay (annotation rect + SPOTLIGHT_PADDING). This is the
  // visual focal point of the expanded page, sized to give surrounding context
  // without covering the full page (which would create a giant flash).
  const spotlight = targetEl.parentElement?.querySelector<HTMLElement>("[data-dc-spotlight]");
  if (spotlight) {
    const spotRect = spotlight.getBoundingClientRect();
    if (isVisibleRect(spotRect)) return spotRect;
  }
  // Overlay dismissed or not yet rendered — synthesize the spotlight rect from
  // the annotation marker + padding. The spotlight is the annotation bounding
  // box expanded by (BOX_PADDING + SPOTLIGHT_PADDING) in natural image pixels,
  // scaled to the rendered image size.
  const img = targetEl.parentElement?.querySelector<HTMLImageElement>("img");
  if (img && img.naturalWidth > 0 && targetEl.parentElement) {
    const containerRect = targetEl.parentElement.getBoundingClientRect();
    const scale = containerRect.width / img.naturalWidth;
    const pad = (BOX_PADDING + SPOTLIGHT_PADDING) * scale;
    return new DOMRect(
      markerRect.left - pad,
      markerRect.top - pad,
      markerRect.width + 2 * pad,
      markerRect.height + 2 * pad,
    );
  }
  return markerRect;
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
    return { markerRect: visibleRect, ghostRect: visibleRect };
  }
  return null;
}

function findPageExpandTarget(root: ParentNode, snapshot: GhostSnapshot): PageExpandTarget | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[data-dc-page-expand-target]"));
  for (const targetEl of candidates) {
    if (targetEl.dataset.dcPageExpandReady !== "true") continue;
    const rect = targetEl.getBoundingClientRect();
    if (!isVisibleRect(rect)) continue;
    return { markerRect: rect, ghostRect: buildGhostTargetRect(snapshot, targetEl, rect) };
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
    if (popoverRoot) {
      for (const anim of popoverRoot.getAnimations()) anim.cancel();
      popoverRoot.style.transition = "";
      popoverRoot.style.opacity = "";
    }
    return;
  }
  if (debugPhase === "target") {
    if (popoverRoot) {
      for (const anim of popoverRoot.getAnimations()) anim.cancel();
      popoverRoot.style.transition = "";
      popoverRoot.style.opacity = "";
    }
    applyGhostRect(ghost, ghostRect);
    return;
  }
  if (debugPhase === "both") {
    if (popoverRoot) {
      for (const anim of popoverRoot.getAnimations()) anim.cancel();
      popoverRoot.style.transition = "";
      popoverRoot.style.opacity = "";
    }
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

  // Animate using transform (translate + scale) + opacity so the compositor
  // handles the interpolation without triggering layout on every frame.
  // The ghost is positioned at the source rect; we compute the transform needed
  // to move and scale it to the target rect.
  const src = snapshot.viewportRect;
  const scaleX = ghostRect.width / src.width;
  const scaleY = ghostRect.height / src.height;
  const translateX = ghostRect.left - src.left;
  const translateY = ghostRect.top - src.top;

  // Helper: build a transform string at a given interpolation fraction t ∈ [0, 1].
  const tfAt = (t: number) =>
    `translate(${translateX * t}px, ${translateY * t}px) scale(${1 + (scaleX - 1) * t}, ${1 + (scaleY - 1) * t})`;

  // Helper: build a blur filter string at a given blur radius.
  const blurAt = (px: number) => (px > 0 ? `blur(${px}px)` : "none");

  // Large-travel expand: EASE_COLLAPSE intentional (>200px travel, per animation-transition-rules.md large-motion rule)
  // Motion blur (filter: blur) masks the non-uniform scale distortion (squashed text)
  // and reads as cinematic motion blur. Peaks mid-flight, clears near landing.
  const keyframes: Keyframe[] = [
    { transform: tfAt(0), opacity: GHOST_OPACITY_START, filter: blurAt(GHOST_BLUR_START_PX) },
    {
      transform: tfAt(GHOST_OFFSET_EARLY),
      opacity: GHOST_OPACITY_EARLY,
      filter: blurAt(GHOST_BLUR_EARLY_PX),
      offset: GHOST_OFFSET_EARLY,
    },
    {
      transform: tfAt(GHOST_OFFSET_MID),
      opacity: GHOST_OPACITY_MID,
      filter: blurAt(GHOST_BLUR_MID_PX),
      offset: GHOST_OFFSET_MID,
    },
    {
      transform: tfAt(GHOST_OFFSET_LATE),
      opacity: GHOST_OPACITY_LATE,
      filter: blurAt(GHOST_BLUR_LATE_PX),
      offset: GHOST_OFFSET_LATE,
    },
    { transform: tfAt(1), opacity: GHOST_OPACITY_PEAK, filter: blurAt(GHOST_BLUR_PEAK_PX), offset: GHOST_OFFSET_PEAK },
    { transform: tfAt(1), opacity: 0, filter: blurAt(0) },
  ];

  const animation = ghost.animate(keyframes, {
    duration: VT_EVIDENCE_PAGE_EXPAND_MS,
    easing: EASE_COLLAPSE,
    fill: "both",
  });

  // Coordinated popover content reveal — continues from wherever the recession
  // fade-down left off, holds at the floor while the ghost dominates, then
  // reveals sharply in the last ~40%.
  //
  // The recession (started in commitAndAnimate) fades the popover gradually
  // via ease-in so the background stays perceptually solid during the first
  // frames. Here we capture its current opacity, cancel it, and start a
  // reveal animation that smoothly continues the journey.
  if (popoverRoot) {
    // getComputedStyle forces a style recalc — acceptable here (single element,
    // once per transition) to capture the recession's current animated opacity so
    // the reveal can continue from the same value without an inter-frame jump.
    const currentOpacity = Number(getComputedStyle(popoverRoot).opacity) || PAGE_EXPAND_CONTENT_OPACITY_FLOOR;
    for (const anim of popoverRoot.getAnimations()) anim.cancel();

    const contentAnim = popoverRoot.animate(
      [
        { opacity: currentOpacity },
        { opacity: PAGE_EXPAND_CONTENT_OPACITY_FLOOR, offset: 0.15 },
        { opacity: PAGE_EXPAND_CONTENT_OPACITY_FLOOR, offset: 0.45 },
        { opacity: 0.08, offset: 0.58 },
        { opacity: 0.35, offset: 0.72 },
        { opacity: 0.8, offset: 0.88 },
        { opacity: 1 },
      ],
      { duration: VT_EVIDENCE_PAGE_EXPAND_MS, easing: BLINK_ENTER_EASING, fill: "forwards" },
    );
    contentAnim.finished
      .catch(() => {})
      .finally(() => {
        // Cancel removes the WAAPI animation layer so its fill: "forwards"
        // no longer overrides inline styles on subsequent transitions.
        contentAnim.cancel();
        popoverRoot.style.opacity = "";
        popoverRoot.style.transition = "";
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
    _transitionDepth++;
    const source = capturePageExpandSource(root);
    let contentRecession: Animation | null = null;

    // Gradually fade ("recede") the popover content instead of instantly jumping
    // to near-zero opacity. The human eye is extremely sensitive to sudden
    // luminance changes in peripheral vision — an instant opacity jump makes the
    // popover background disappear in one frame, exposing page content underneath
    // and triggering the perception of a flash. A gradual ease-in recession keeps
    // the background perceptually solid for the first few frames while the ghost
    // captures attention via motion, then fades quickly to the floor.
    //
    // Disable CSS transitions first so the blink-motion `transition: opacity 60ms`
    // doesn't compete. Cancel lingering WAAPI from a previous page-expand so
    // fill: "forwards" doesn't override the new recession.
    if (rootEl) {
      for (const anim of rootEl.getAnimations()) anim.cancel();
      rootEl.style.transition = "none";
      const startOpacity = Number(getComputedStyle(rootEl).opacity) || 1;
      contentRecession = rootEl.animate([{ opacity: startOpacity }, { opacity: PAGE_EXPAND_CONTENT_OPACITY_FLOOR }], {
        duration: PAGE_EXPAND_RECESSION_MS,
        easing: "ease-in",
        fill: "forwards",
      });
    }

    flushSync(update);

    if (!source) {
      if (rootEl) {
        contentRecession?.cancel();
        rootEl.style.transition = "";
      }
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
      if (rootEl) {
        contentRecession?.cancel();
        rootEl.style.transition = "";
      }
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
        if (rootEl) {
          contentRecession?.cancel();
          rootEl.style.transition = "";
        }
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
