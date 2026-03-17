import { flushSync } from "react-dom";
import { EASE_COLLAPSE, VT_EVIDENCE_PAGE_EXPAND_MS } from "./constants.js";

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
export function isViewTransitioning(): boolean {
  return _transitionDepth > 0;
}

export function primeEvidencePageExpandSource(sourceEl: HTMLElement | null): void {
  _primedPageExpandSource = sourceEl;
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
  borderRadius: string;
};

function isVisibleRect(rect: DOMRect): boolean {
  return rect.width > 0.5 && rect.height > 0.5;
}

function getPageExpandDebugPhase(): "source" | "target" | null {
  if (typeof document === "undefined") return null;
  const phase = document.documentElement.dataset.dcPageExpandDebugPhase;
  return phase === "source" || phase === "target" ? phase : null;
}

function takePrimedPageExpandSource(root: ParentNode): HTMLElement | null {
  const sourceEl = _primedPageExpandSource;
  _primedPageExpandSource = null;
  if (!sourceEl) return null;
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
      borderRadius: getComputedStyle(sourceEl).borderRadius || "0px",
    };
  }
  return null;
}

type PageExpandTarget = {
  markerRect: DOMRect;
  ghostRect: DOMRect;
};

function buildGhostTargetRect(snapshot: GhostSnapshot, targetEl: HTMLElement, markerRect: DOMRect): DOMRect {
  if (snapshot.sourceKind === "summary-keyhole") {
    return markerRect;
  }
  const markerNaturalWidth = Number.parseFloat(targetEl.dataset.dcTargetNaturalWidth ?? "");
  const markerNaturalHeight = Number.parseFloat(targetEl.dataset.dcTargetNaturalHeight ?? "");
  if (
    Number.isFinite(markerNaturalWidth) &&
    markerNaturalWidth > 0 &&
    Number.isFinite(markerNaturalHeight) &&
    markerNaturalHeight > 0 &&
    snapshot.imageNaturalWidth > 0 &&
    snapshot.imageNaturalHeight > 0
  ) {
    const scaleX = markerRect.width / markerNaturalWidth;
    const scaleY = markerRect.height / markerNaturalHeight;
    const targetWidth = Math.max(markerRect.width, snapshot.imageNaturalWidth * scaleX);
    const targetHeight = Math.max(markerRect.height, snapshot.imageNaturalHeight * scaleY);
    const centerX = markerRect.left + markerRect.width / 2;
    const centerY = markerRect.top + markerRect.height / 2;
    return new DOMRect(centerX - targetWidth / 2, centerY - targetHeight / 2, targetWidth, targetHeight);
  }

  const pageImg = targetEl.parentElement?.querySelector<HTMLImageElement>("img");
  const pageImgRect = pageImg?.getBoundingClientRect();
  const pageImgNaturalWidth = pageImg?.naturalWidth ?? 0;
  const pageImgNaturalHeight = pageImg?.naturalHeight ?? 0;

  if (
    !pageImg ||
    !pageImgRect ||
    !isVisibleRect(pageImgRect) ||
    pageImgNaturalWidth <= 0 ||
    pageImgNaturalHeight <= 0 ||
    snapshot.imageNaturalWidth <= 0 ||
    snapshot.imageNaturalHeight <= 0
  ) {
    return markerRect;
  }

  const scaleX = pageImgRect.width / pageImgNaturalWidth;
  const scaleY = pageImgRect.height / pageImgNaturalHeight;
  const targetWidth = Math.max(markerRect.width, snapshot.imageNaturalWidth * scaleX);
  const targetHeight = Math.max(markerRect.height, snapshot.imageNaturalHeight * scaleY);
  const centerX = markerRect.left + markerRect.width / 2;
  const centerY = markerRect.top + markerRect.height / 2;
  return new DOMRect(centerX - targetWidth / 2, centerY - targetHeight / 2, targetWidth, targetHeight);
}

function findPageExpandTarget(root: ParentNode, snapshot: GhostSnapshot): PageExpandTarget | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[data-dc-page-expand-target]"));
  for (const targetEl of candidates) {
    if (targetEl.dataset.dcPageExpandReady !== "true") continue;
    const rect = targetEl.getBoundingClientRect();
    if (!isVisibleRect(rect)) continue;
    return { markerRect: rect, ghostRect: buildGhostTargetRect(snapshot, targetEl, rect) };
  }
  return null;
}

function createPageExpandGhost(snapshot: GhostSnapshot): HTMLDivElement {
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
  ghost.style.willChange = "left, top, width, height, opacity";
  const debugPhase = getPageExpandDebugPhase();
  if (debugPhase) {
    ghost.style.outline = debugPhase === "source" ? "2px solid #ef4444" : "2px solid #22c55e";
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

function runPageExpandGhostAnimation(ghost: HTMLDivElement, snapshot: GhostSnapshot, target: PageExpandTarget): void {
  const { ghostRect } = target;
  const debugPhase = getPageExpandDebugPhase();
  if (debugPhase === "source") {
    return;
  }
  if (debugPhase === "target") {
    applyGhostRect(ghost, ghostRect);
    return;
  }
  const keyframes: Keyframe[] = [
    {
      left: `${snapshot.viewportRect.left}px`,
      top: `${snapshot.viewportRect.top}px`,
      width: `${snapshot.viewportRect.width}px`,
      height: `${snapshot.viewportRect.height}px`,
      opacity: 0.06,
    },
    {
      left: `${snapshot.viewportRect.left + (ghostRect.left - snapshot.viewportRect.left) * 0.18}px`,
      top: `${snapshot.viewportRect.top + (ghostRect.top - snapshot.viewportRect.top) * 0.18}px`,
      width: `${snapshot.viewportRect.width + (ghostRect.width - snapshot.viewportRect.width) * 0.18}px`,
      height: `${snapshot.viewportRect.height + (ghostRect.height - snapshot.viewportRect.height) * 0.18}px`,
      opacity: 0.1,
      offset: 0.18,
    },
    {
      left: `${snapshot.viewportRect.left + (ghostRect.left - snapshot.viewportRect.left) * 0.42}px`,
      top: `${snapshot.viewportRect.top + (ghostRect.top - snapshot.viewportRect.top) * 0.42}px`,
      width: `${snapshot.viewportRect.width + (ghostRect.width - snapshot.viewportRect.width) * 0.42}px`,
      height: `${snapshot.viewportRect.height + (ghostRect.height - snapshot.viewportRect.height) * 0.42}px`,
      opacity: 0.22,
      offset: 0.42,
    },
    {
      left: `${snapshot.viewportRect.left + (ghostRect.left - snapshot.viewportRect.left) * 0.68}px`,
      top: `${snapshot.viewportRect.top + (ghostRect.top - snapshot.viewportRect.top) * 0.68}px`,
      width: `${snapshot.viewportRect.width + (ghostRect.width - snapshot.viewportRect.width) * 0.68}px`,
      height: `${snapshot.viewportRect.height + (ghostRect.height - snapshot.viewportRect.height) * 0.68}px`,
      opacity: 0.48,
      offset: 0.68,
    },
    {
      left: `${ghostRect.left}px`,
      top: `${ghostRect.top}px`,
      width: `${ghostRect.width}px`,
      height: `${ghostRect.height}px`,
      opacity: 0.96,
      offset: 0.92,
    },
    {
      left: `${ghostRect.left}px`,
      top: `${ghostRect.top}px`,
      width: `${ghostRect.width}px`,
      height: `${ghostRect.height}px`,
      opacity: 0,
    },
  ];

  const animation = ghost.animate(keyframes, {
    duration: VT_EVIDENCE_PAGE_EXPAND_MS,
    easing: EASE_COLLAPSE,
    fill: "both",
  });
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
      if (debugPhase === "target") {
        callback(target);
        return;
      }
      const isStable =
        previousStableRect &&
        Math.abs(targetRect.left - previousStableRect.left) <= 1 &&
        Math.abs(targetRect.top - previousStableRect.top) <= 1 &&
        Math.abs(targetRect.width - previousStableRect.width) <= 1 &&
        Math.abs(targetRect.height - previousStableRect.height) <= 1;
      if (isStable && stableFrames >= 1) {
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
    update();
    return;
  }

  const source = capturePageExpandSource(root);
  flushSync(update);
  if (!source) return;
  const ghost = createPageExpandGhost(source);
  waitForPageExpandTarget(root, source, target => {
    if (!target) {
      ghost.remove();
      return;
    }
    runPageExpandGhostAnimation(ghost, source, target);
  });
}
