// Dev-only view-transition overlay module.
//
// Everything in this file is for visual debugging of the expand/collapse
// ghost animations. It is intentionally sequestered from `viewTransition.ts`
// so the entire feature can be stripped from production builds by either:
//
//   1. Relying on tree-shaking: every exported function early-returns under
//      `process.env.NODE_ENV === "production"`, and no runtime code path in
//      `viewTransition.ts` statically imports from here. Bundlers fold the
//      dynamic `import("./viewTransitionOverlay.js")` in `animationDebugStore`
//      into dead code when that module's own NODE_ENV guards evaluate true.
//   2. Deleting the file outright (and removing the `lazyOverlay()` loader in
//      `animationDebugStore.ts`). The runtime has zero static dependency on
//      anything declared here.
//
// Runtime debug-phase hooks (`[data-dc-page-expand-debug-phase]` dataset)
// deliberately stay in `viewTransition.ts` — they interleave with the
// animation flow and rely on the overlay *primitives* (`createDebugOverlay`,
// etc.) at synchronous call sites where a dynamic import would paint too late.

import { DEBUG_PAGE_EXPAND_SOURCE_COLOR, DEBUG_PAGE_EXPAND_TARGET_COLOR } from "../keyholeGeometry.js";
import {
  buildCollapseGhostSnapshot,
  buildGhostTarget,
  buildGhostTargetFromViewport,
  captureCollapsePreflushData,
  capturePageExpandSource,
  clearDebugOverlays,
  createDebugCrosshair,
  createDebugOverlay,
  type DebugPhase,
  type GhostSnapshot,
  getPageExpandDebugPhase,
  isVisibleRect,
  type PageExpandTarget,
} from "../viewTransition.js";
import { getDebugSnapshot } from "./animationDebugStore.js";

// =============================================================================
// DEBUG-ONLY MEASUREMENT HELPERS
// =============================================================================

/**
 * Temporarily clears `style.display = "none"` on `el` and every ancestor that
 * has it inline, forces a synchronous layout, runs `fn`, then restores every
 * display in reverse order. Used to measure rects of triple-always-render slots
 * that are currently hidden so the debug tool can show start/end boxes without
 * requiring a transition.
 *
 * Caveat: unhiding does not change sibling slots' sizes, so the measured rect
 * reflects the current popover width — not the width the popover would snap
 * to during a real transition. Still useful as an orientation aid.
 */
function withForcedVisibility<T>(el: HTMLElement, fn: () => T): T {
  const restores: Array<() => void> = [];
  let node: HTMLElement | null = el;
  while (node) {
    if (node.style.display === "none") {
      const prev = node.style.display;
      node.style.display = "";
      const captured = node;
      restores.push(() => {
        captured.style.display = prev;
      });
    }
    node = node.parentElement;
  }
  try {
    void el.offsetHeight;
    return fn();
  } finally {
    for (let i = restores.length - 1; i >= 0; i--) restores[i]();
  }
}

function measureForced(el: HTMLElement): DOMRect {
  return withForcedVisibility(el, () => el.getBoundingClientRect());
}

/**
 * Find the popover root the animations operate on. Callers may pass one
 * explicitly; otherwise we default to `[data-dc-popover-content]`.
 */
function resolveDebugRoot(root?: ParentNode | null): ParentNode | null {
  if (root) return root;
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>("[data-dc-popover-content]") ?? document;
}

/** Build a page-expand ghost-end rect and marker/spotlight from a given snapshot + target element. */
function computeGhostEndFor(snapshot: GhostSnapshot, targetEl: HTMLElement, markerRect: DOMRect): PageExpandTarget {
  const { ghostRect, spotlightRect } = buildGhostTarget(snapshot, targetEl, markerRect);
  return { ghostRect, spotlightRect, markerRect };
}

// =============================================================================
// KEYFRAME DEBUG: draw the exact start/end rects each animation will use
// =============================================================================

/**
 * Dev-only: draw colored outline boxes showing the EXACT rects each animation
 * would use for its start and end positions, computed with the same functions
 * the real transitions call.
 *
 * Colors
 * ------
 *   blue    page-expand source (ghost start rect, identical to source viewport rect)
 *   green   page-expand ghost end (landing rect after translate)
 *   purple  page-expand marker (annotation VT rect on the page)
 *   amber   page-expand spotlight (annotation-centered with symmetric padding)
 *   pink    page-collapse ghost start (spotlight-anchored, dest-sized)
 *   teal    page-collapse ghost end (dest-center aligned)
 *   yellow  page-collapse destination rect (real keyhole / inline-expanded)
 */
export function debugDrawAnimationKeyFrames(root?: ParentNode | null): {
  pageExpand: ReturnType<typeof debugCapturePageExpandRects>;
  pageCollapse: ReturnType<typeof debugCapturePageCollapseRects>;
} | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof document === "undefined") return null;
  clearDebugOverlays();
  const scope = resolveDebugRoot(root);
  if (!scope) {
    console.warn("[DC debug] drawAnimationKeyFrames: no popover root found. Open a citation popover first.");
    return null;
  }

  const expand = debugCapturePageExpandRects(scope);
  if (expand) {
    createDebugOverlay(
      expand.ghostStartRect,
      "#3b82f6",
      `PAGE-EXPAND start (${expand.sourceKind ?? "source"})`,
      `anchor: (${expand.sourceAnchorX.toFixed(2)}, ${expand.sourceAnchorY.toFixed(2)})`,
    );
    createDebugOverlay(expand.ghostEndRect, "#22c55e", "PAGE-EXPAND end (ghost landing)");
    createDebugOverlay(expand.markerRect, "#a855f7", "MARKER (annotation VT rect)");
    if (expand.spotlightRect) {
      createDebugOverlay(expand.spotlightRect, "#f59e0b", "SPOTLIGHT (annotation + padding)");
    }
  }

  const collapse = debugCapturePageCollapseRects(scope);
  if (collapse) {
    createDebugOverlay(
      collapse.ghostStartRect,
      "#ec4899",
      "PAGE-COLLAPSE start (spotlight-anchored)",
      `spotlight: (${collapse.spotlightCX.toFixed(0)}, ${collapse.spotlightCY.toFixed(0)})`,
    );
    createDebugOverlay(collapse.ghostEndRect, "#14b8a6", "PAGE-COLLAPSE end (dest-aligned)");
    createDebugOverlay(collapse.destRect, "#fbbf24", "DESTINATION (real keyhole)");
  }

  if (!expand && !collapse) {
    console.warn("[DC debug] drawAnimationKeyFrames: no source elements found in scope.", scope);
  } else {
    console.groupCollapsed("[DC debug] animation keyframes");
    if (expand) console.log("page-expand:", expand);
    if (collapse) console.log("page-collapse:", collapse);
    console.groupEnd();
  }

  return { pageExpand: expand, pageCollapse: collapse };
}

/** @internal — compute page-expand rects without drawing. */
export function debugCapturePageExpandRects(root: ParentNode): {
  ghostStartRect: DOMRect;
  ghostEndRect: DOMRect;
  markerRect: DOMRect;
  spotlightRect: DOMRect | null;
  sourceKind: GhostSnapshot["sourceKind"];
  sourceAnchorX: number;
  sourceAnchorY: number;
} | null {
  const snapshot = capturePageExpandSource(root);
  if (!snapshot) return null;
  const targetEls = Array.from(root.querySelectorAll<HTMLElement>("[data-dc-page-expand-target]"));
  let chosenTarget: PageExpandTarget | null = null;
  for (const el of targetEls) {
    const rect = measureForced(el);
    if (!isVisibleRect(rect)) continue;
    chosenTarget = computeGhostEndFor(snapshot, el, rect);
    break;
  }
  if (!chosenTarget) {
    chosenTarget = buildGhostTargetFromViewport(root, snapshot);
  }
  if (!chosenTarget) return null;
  return {
    ghostStartRect: snapshot.viewportRect,
    ghostEndRect: chosenTarget.ghostRect,
    markerRect: chosenTarget.markerRect,
    spotlightRect: chosenTarget.spotlightRect,
    sourceKind: snapshot.sourceKind,
    sourceAnchorX: snapshot.sourceAnchorX,
    sourceAnchorY: snapshot.sourceAnchorY,
  };
}

/**
 * @internal — compute page-collapse start/end rects using the EXACT same
 * helpers the runtime path uses. `buildCollapseGhostSnapshot` returns the
 * ghost's start rect (spotlight-anchored, dest-sized, using the destination's
 * `data-dc-source-anchor-x/y` dataset). The end rect mirrors the runtime:
 * the ghost is seated at `destRect.left, destRect.top` (top-left of the
 * keyhole / inline-expanded element). Do not reinvent this formula — the
 * old center-based math `(destCenter - anchorInGhost)` was wrong for pannable
 * strips where `anchorInGhostX ≠ destRect.width / 2`.
 */
export function debugCapturePageCollapseRects(root: ParentNode): {
  ghostStartRect: DOMRect;
  ghostEndRect: DOMRect;
  destRect: DOMRect;
  spotlightCX: number;
  spotlightCY: number;
} | null {
  const preflush = captureCollapsePreflushData(root);
  if (!preflush) return null;
  const destEl =
    root.querySelector<HTMLElement>("[data-dc-keyhole]") ??
    root.querySelector<HTMLElement>("[data-dc-inline-expanded]");
  if (!destEl) return null;

  return withForcedVisibility(destEl, () => {
    const destRect = destEl.getBoundingClientRect();
    if (!isVisibleRect(destRect)) return null;

    const snapshot = buildCollapseGhostSnapshot(preflush, root);
    if (!snapshot) return null;

    const src = snapshot.viewportRect;
    const ghostEndRect = new DOMRect(destRect.left, destRect.top, src.width, src.height);

    return {
      ghostStartRect: src,
      ghostEndRect,
      destRect,
      spotlightCX: preflush.spotlightCX,
      spotlightCY: preflush.spotlightCY,
    };
  });
}

/**
 * Dev-only: draw the animation path of the LAST transition that ran, using
 * per-rAF samples of the ghost's REAL bounding rect captured during playback
 * (see {@link applyGhostMorph}). Each overlay corresponds to a frame the
 * browser actually painted — no math, no keyframe prediction, no layout
 * re-measurement. If the overlay doesn't line up, the animation itself is
 * where it says it is; you're looking at ground truth.
 *
 * Precondition: trigger the transition at least once with the debug store
 * enabled (`__dcAnimationDebug.enable()`). Slow it down with `.setSpeed(0.1)`
 * for more samples.
 */
export function debugDrawAllAnimationKeyFrames(_root?: ParentNode | null): {
  direction: "expand" | "collapse";
  ghostStartRect: DOMRect;
  ghostEndRect: DOMRect;
  samples: Array<{ t: number; rect: DOMRect }>;
  spotlightRect: DOMRect | null;
} | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof document === "undefined") return null;

  clearDebugOverlays();

  const snap = getDebugSnapshot().lastGhostRects;
  if (!snap || !snap.source || !snap.target || !snap.direction) {
    console.warn(
      "[DC debug] drawAllAnimationKeyFrames: no captured animation yet. Trigger the transition once (click a citation pill or View Page), then call this again.",
    );
    return null;
  }

  const {
    source: fromRect,
    target: toRect,
    direction,
    spotlight = null,
    samples = [],
    anchorInGhostX,
    anchorInGhostY,
  } = snap;
  const hue = direction === "expand" ? "#06b6d4" : "#ec4899";
  const anchorHue = direction === "expand" ? "#facc15" : "#a855f7";
  const label = direction === "expand" ? "EXPAND" : "COLLAPSE";

  // Dedupe: rAF samples at the same progress produce visually identical rects.
  // Also skip frames whose top-left is within 0.5px of the previous — keeps
  // the overlay readable without dropping real motion.
  const unique: Array<{ t: number; rect: DOMRect }> = [];
  for (const s of samples) {
    const last = unique[unique.length - 1];
    if (
      last &&
      Math.abs(last.rect.left - s.rect.left) < 0.5 &&
      Math.abs(last.rect.top - s.rect.top) < 0.5 &&
      Math.abs(last.rect.width - s.rect.width) < 0.5 &&
      Math.abs(last.rect.height - s.rect.height) < 0.5
    ) {
      continue;
    }
    unique.push(s);
  }

  unique.forEach((s, i) => {
    const pct = `${Math.round(s.t * 100)}%`;
    const isFirst = i === 0;
    const isLast = i === unique.length - 1;
    const frameLabel = isFirst
      ? `${label} ${pct} (start — ghost frame)`
      : isLast
        ? `${label} ${pct} (end — ghost frame)`
        : `${label} ${pct}`;
    createDebugOverlay(s.rect, hue, frameLabel, undefined, {
      dashed: !isFirst && !isLast,
      fillAlpha: isFirst || isLast ? "22" : "06",
      labelBelow: i % 2 === 1,
    });
  });

  // Anchor-point trajectory: the citation text lives at a fixed offset inside
  // the ghost (ghost is pure-translate, so the offset is invariant across
  // frames). Rendering the anchor viewport position for every sample reveals
  // whether the aim math holds — endpoints should land on the spotlight
  // center, and intermediate points should trace a straight line between them.
  // If the start or end crosshair drifts off the spotlight, the aim is wrong
  // and the animation will visibly "search" for the citation.
  if (typeof anchorInGhostX === "number" && typeof anchorInGhostY === "number") {
    unique.forEach((s, i) => {
      const isFirst = i === 0;
      const isLast = i === unique.length - 1;
      const pct = `${Math.round(s.t * 100)}%`;
      const tag = isFirst ? `anchor start ${pct}` : isLast ? `anchor end ${pct}` : undefined;
      createDebugCrosshair(
        s.rect.left + anchorInGhostX,
        s.rect.top + anchorInGhostY,
        anchorHue,
        tag,
        isFirst || isLast ? 14 : 8,
      );
    });
  }

  if (spotlight) {
    createDebugOverlay(spotlight, "#f59e0b", "SPOTLIGHT (iris target)", undefined, { fillAlpha: "22" });
    // Crosshair at the spotlight center — the anchor start/end should sit here.
    createDebugCrosshair(
      spotlight.left + spotlight.width / 2,
      spotlight.top + spotlight.height / 2,
      "#f59e0b",
      "spotlight ctr",
      14,
    );
  }

  console.groupCollapsed(`[DC debug] ${label} ghost path (${unique.length} real samples)`);
  console.log("direction:", direction);
  console.log("fromRect (ghost start):", fromRect);
  console.log("toRect (ghost land):", toRect);
  console.log("spotlight:", spotlight);
  console.log("anchorInGhost:", { x: anchorInGhostX, y: anchorInGhostY });
  console.log("samples (per-rAF getBoundingClientRect of the ghost):", unique);
  console.groupEnd();

  return { direction, ghostStartRect: fromRect, ghostEndRect: toRect, samples: unique, spotlightRect: spotlight };
}

/** Clear all keyframe debug overlays. */
export function debugClearAnimationKeyFrames(): void {
  if (process.env.NODE_ENV === "production") return;
  clearDebugOverlays();
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
