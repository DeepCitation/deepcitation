import { expect, test } from "@playwright/experimental-ct-react";
import { AsymmetricAnchorCitation } from "./AsymmetricAnchorCitation";

// =============================================================================
// Ghost-path symmetry regression suite
//
// These tests capture three animation failures observed in dev (see jank5.png
// and docs/agents/animation-transition-rules.md § Page-Expand Ghost Animation):
//
//   1. Collapse-end ≠ expand-start when sourceAnchorX ≠ 0.5.
//      buildGhostTarget (expand) seats the ghost at `keyhole.left` while
//      runPageCollapseGhostAnimation (collapse) seats it at
//      `keyhole.centerX − anchorInGhostX`. The two positions diverge by
//      `(sourceAnchorX − 0.5) × srcW` px, visible as the ghost "landing"
//      a ghost-width away from where it took off.
//
//   2. Collapse-start ≠ expand-end on the spotlight anchor — preflush spotlight
//      coordinates vs post-flushSync spotlight coordinates disagree after the
//      popover reflows. The ghost appears to "shoot to the right" before
//      heading back to the keyhole.
//
//   3. The two ghost trajectories should be time-reverses of each other.
//      Different easing + asymmetric endpoints make them trace visibly
//      different arcs, so a user collapsing back sees motion that doesn't
//      rewind the expand.
//
// Approach: drive real page-expand + page-collapse transitions on a fixture
// whose evidence is width-fill with an off-center annotation (sourceAnchorX
// ≈ 0.825). Read the per-rAF sample trajectory the animation pipeline
// records in the animation debug store via `__dcAnimationDebug.snapshot()`.
//
// =============================================================================

type SampleRect = { x: number; y: number; width: number; height: number };
type CapturedGhost = {
  source: SampleRect | null;
  target: SampleRect | null;
  direction: "expand" | "collapse" | undefined;
  anchorInGhostX: number | undefined;
  anchorInGhostY: number | undefined;
  spotlight: SampleRect | null;
  samples: Array<{ t: number; rect: SampleRect }>;
};

async function enableDebugStore(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const api = (
      window as unknown as {
        __dcAnimationDebug: {
          enable: () => void;
          setSpeed: (x: number) => void;
          disable: () => void;
        };
      }
    ).__dcAnimationDebug;
    api.enable();
    // 0.5 = runs at 2× duration so we get many more rAF samples on the
    // trajectory without changing easing/endpoint math.
    api.setSpeed(0.5);
  });
}

async function readGhostSnapshot(page: import("@playwright/test").Page): Promise<CapturedGhost | null> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __dcAnimationDebug: { snapshot: () => { lastGhostRects: unknown } };
      }
    ).__dcAnimationDebug;
    const raw = api.snapshot().lastGhostRects as {
      source: DOMRect | null;
      target: DOMRect | null;
      direction?: "expand" | "collapse";
      anchorInGhostX?: number;
      anchorInGhostY?: number;
      spotlight?: DOMRect | null;
      samples?: Array<{ t: number; rect: DOMRect }>;
    } | null;
    if (!raw) return null;
    const toPlain = (r: DOMRect | null | undefined) =>
      r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    return {
      source: toPlain(raw.source),
      target: toPlain(raw.target),
      direction: raw.direction,
      anchorInGhostX: raw.anchorInGhostX,
      anchorInGhostY: raw.anchorInGhostY,
      spotlight: toPlain(raw.spotlight ?? null),
      samples: (raw.samples ?? []).map(s => ({ t: s.t, rect: toPlain(s.rect)! })),
    };
  });
}

/** Poll until an animation of the expected direction has recorded >= 6 rAF
 *  samples AND the ghost element has left the DOM (guaranteed post-finish). */
async function waitForGhostDirection(
  page: import("@playwright/test").Page,
  direction: "expand" | "collapse",
  timeoutMs = 4000,
): Promise<CapturedGhost> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snapshot = await readGhostSnapshot(page);
    const ghostCount = await page.locator("[data-dc-page-expand-ghost]").count();
    if (snapshot && snapshot.direction === direction && snapshot.samples.length >= 6 && ghostCount === 0) {
      return snapshot;
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`Timed out waiting for ghost direction=${direction}`);
}

async function openSummaryPopover(page: import("@playwright/test").Page) {
  await page.locator("[data-citation-id]").click();
  const popover = page.locator("[data-dc-popover-wrapper]");
  await expect(popover).toBeVisible();
  return popover;
}

async function expandToPage(_page: import("@playwright/test").Page, popover: import("@playwright/test").Locator) {
  const expandButton = popover.getByLabel(/Expand to full page/).first();
  await expect(expandButton).toBeVisible();
  await expandButton.click();
}

async function collapseBackToSummary(page: import("@playwright/test").Page) {
  // onEscapeKeyDown at prevBefore="summary" routes through the page-collapse
  // pipeline (usePopoverViewState.ts § isPageCollapse).
  await page.keyboard.press("Escape");
}

/** Captures a full expand + collapse cycle and returns both snapshots. */
async function captureExpandCollapseCycle(
  page: import("@playwright/test").Page,
): Promise<{ expand: CapturedGhost; collapse: CapturedGhost }> {
  await enableDebugStore(page);
  const popover = await openSummaryPopover(page);
  await expandToPage(page, popover);
  const expand = await waitForGhostDirection(page, "expand");
  // Small settle so the popover layout guards (boundary + alignOffset) run
  // their late horizontal settles before we invert.
  await page.waitForTimeout(150);
  await collapseBackToSummary(page);
  const collapse = await waitForGhostDirection(page, "collapse");
  return { expand, collapse };
}

const anchorViewportOf = (g: CapturedGhost, rect: SampleRect) => ({
  x: rect.x + (g.anchorInGhostX ?? rect.width / 2),
  y: rect.y + (g.anchorInGhostY ?? rect.height / 2),
});

// =============================================================================

test.describe("Ghost path symmetry (asymmetric anchor fixture)", () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic starting state in case a prior test polluted the store.
    await page.addInitScript(() => {
      const api = (window as unknown as { __dcAnimationDebug?: { disable: () => void } })
        .__dcAnimationDebug;
      if (api && typeof api.disable === "function") api.disable();
    });
  });

  test("fixture resolves sourceAnchorX ≠ 0.5 (precondition for the symmetry bugs)", async ({
    mount,
    page,
  }) => {
    await mount(<AsymmetricAnchorCitation />);
    const popover = await openSummaryPopover(page);
    const keyhole = popover.locator("[data-dc-keyhole]").first();
    await expect(keyhole).toBeVisible();

    const anchorX = await keyhole.evaluate(el => Number.parseFloat((el as HTMLElement).dataset.dcSourceAnchorX ?? ""));
    expect(anchorX).toBeGreaterThan(0.7); // ~0.825 by fixture construction
    expect(anchorX).toBeLessThan(0.95);
  });

  test("collapse-end matches expand-start for the ghost (anchor-symmetry bug)", async ({
    mount,
    page,
  }) => {
    await mount(<AsymmetricAnchorCitation />);
    const { expand, collapse } = await captureExpandCollapseCycle(page);

    // Expand starts at the real keyhole rect (snapshot.viewportRect).
    const expandStart = expand.source;
    // Collapse ends where applyGhostMorph translates the ghost to — toRect.
    const collapseEnd = collapse.target;
    expect(expandStart).not.toBeNull();
    expect(collapseEnd).not.toBeNull();

    // Anchor points (the pixel the eye tracks) must coincide within 2px.
    // Today: diverges by (anchorX − 0.5) × srcW ≈ 0.325 × ~400 ≈ 130px.
    const a = anchorViewportOf(expand, expandStart!);
    const b = anchorViewportOf(collapse, collapseEnd!);
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2);
  });

  test("collapse-start matches expand-end at the spotlight (handoff bug)", async ({
    mount,
    page,
  }) => {
    await mount(<AsymmetricAnchorCitation />);
    const { expand, collapse } = await captureExpandCollapseCycle(page);

    const expandEnd = expand.target;
    const collapseStart = collapse.source;
    expect(expandEnd).not.toBeNull();
    expect(collapseStart).not.toBeNull();

    const a = anchorViewportOf(expand, expandEnd!);
    const b = anchorViewportOf(collapse, collapseStart!);

    // This is the "shoot to the right" delta. Today the ghost is seated off
    // the real spotlight center by the popover reflow + useViewportBoundaryGuard
    // late settle. We allow 3px — the failing value in dev is typically > 20px.
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(3);
  });

  test("ghost never travels past its endpoints horizontally during collapse", async ({
    mount,
    page,
  }) => {
    await mount(<AsymmetricAnchorCitation />);
    const { collapse } = await captureExpandCollapseCycle(page);
    expect(collapse.samples.length).toBeGreaterThan(4);
    expect(collapse.source).not.toBeNull();
    expect(collapse.target).not.toBeNull();

    const startAnchorX = anchorViewportOf(collapse, collapse.source!).x;
    const endAnchorX = anchorViewportOf(collapse, collapse.target!).x;
    const lo = Math.min(startAnchorX, endAnchorX);
    const hi = Math.max(startAnchorX, endAnchorX);

    // Allow 2px slack for pixel rounding. Any farther and the ghost visibly
    // "shoots" past the destination before settling.
    const overshoots = collapse.samples
      .map(s => anchorViewportOf(collapse, s.rect).x)
      .filter(x => x < lo - 2 || x > hi + 2);

    expect(overshoots, `collapse ghost sampled outside [${lo}, ${hi}]: ${overshoots.join(", ")}`)
      .toHaveLength(0);
  });

  // TODO: expand uses EASE_GHOST_EXPAND, collapse uses EASE_COLLAPSE — different
  // curves produce ~88px trajectory asymmetry on a 400px travel. Fixing requires
  // either matching easing or using time-reverse math (ease_expand(t) = 1 − ease_collapse(1−t)).
  test.skip("expand and collapse trace time-reversed paths (within tolerance)", async ({
    mount,
    page,
  }) => {
    await mount(<AsymmetricAnchorCitation />);
    const { expand, collapse } = await captureExpandCollapseCycle(page);
    expect(expand.samples.length).toBeGreaterThan(6);
    expect(collapse.samples.length).toBeGreaterThan(6);

    // Build anchor-x(t) curves and resample both to the same 11-point grid.
    const curveOf = (g: CapturedGhost) =>
      g.samples
        .map(s => ({ t: s.t, x: anchorViewportOf(g, s.rect).x }))
        .sort((a, b) => a.t - b.t);

    const interp = (curve: Array<{ t: number; x: number }>, t: number): number => {
      if (curve.length === 0) return Number.NaN;
      if (t <= curve[0].t) return curve[0].x;
      if (t >= curve[curve.length - 1].t) return curve[curve.length - 1].x;
      for (let i = 1; i < curve.length; i++) {
        const a = curve[i - 1];
        const b = curve[i];
        if (t <= b.t) {
          const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
          return a.x + f * (b.x - a.x);
        }
      }
      return curve[curve.length - 1].x;
    };

    const expandCurve = curveOf(expand);
    const collapseCurve = curveOf(collapse);
    const grid = Array.from({ length: 11 }, (_, i) => i / 10);
    const deltas = grid.map(t => Math.abs(interp(expandCurve, t) - interp(collapseCurve, 1 - t)));
    const maxDelta = Math.max(...deltas);

    // Paths should be time-reverses of each other. Any per-sample deviation
    // larger than 8px is a visible asymmetry on a ~400px travel.
    expect(maxDelta, `max per-sample delta: ${deltas.map(d => d.toFixed(1)).join(", ")}`)
      .toBeLessThanOrEqual(8);
  });
});
