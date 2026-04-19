import { expect, test } from "@playwright/experimental-ct-react";
import { AsymmetricAnchorCitation } from "./AsymmetricAnchorCitation";
import { WideEvidenceCitation } from "./WideEvidenceCitation";

// =============================================================================
// Collapse / expand anchor-handoff regression suite
//
// Reproduces the visual offset shown in scratch/collapse5/6/7.png.
//
// Root cause: resolveEvidenceSourceAnchorRatio() had a primary path that used
// sourceContextDeepItem coordinates (PDF/page space) divided by
// evidence.dimensions (evidence-image space). When the coordinates are from
// different spaces the ratio overflows [0,1] and is clamped — e.g. the
// AsymmetricAnchorCitation fixture has sourceContextDeepItem.y = 790 in an
// evidence image only 120 px tall, so the y-center (807) is clamped to 1.0,
// placing the ghost anchor at the bottom edge rather than at the annotation.
//
// Correct anchor source: evidence.textItems positions ARE in evidence-image
// space. For AsymmetricAnchorCitation, textItem "installation" is at
// x=280, width=100 in 400 px → center 330 → ratio 0.825.
//
// Test strategy: use the DOM (data-dc-source-anchor-x attribute and the
// debug store's anchorInGhostX) as ground truth — not a helper that mirrors
// the resolver formula, which would trivially pass regardless of the bug.
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
        __dcAnimationDebug: { enable: () => void; setSpeed: (x: number) => void };
      }
    ).__dcAnimationDebug;
    api.enable();
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
  await page.keyboard.press("Escape");
}

// Click the keyhole strip to open the expanded-keyhole (focus) view.
// Works only when the evidence image overflows the strip (canExpand = true).
async function expandToKeyhole(popover: import("@playwright/test").Locator) {
  const keyhole = popover.locator("[data-dc-keyhole]").first();
  await expect(keyhole).toBeVisible();
  await keyhole.click();
  // Expanded-keyhole is visible when [data-dc-inline-expanded] becomes visible
  // and [data-dc-keyhole] is hidden.
  await expect(popover.locator("[data-dc-inline-expanded]").first()).toBeVisible();
}

// =============================================================================

test.describe("Anchor handoff: ghost ↔ keyhole (AsymmetricAnchorCitation)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const api = (window as unknown as { __dcAnimationDebug?: { disable: () => void } }).__dcAnimationDebug;
      if (api?.disable) api.disable();
    });
  });

  // ── Test 1: DOM attribute check ─────────────────────────────────────────
  // Reads data-dc-source-anchor-x directly. This is the resolver's output
  // stamped onto the keyhole element before any animation runs. Failing here
  // means the resolver produced the wrong coordinate-space ratio.
  test("keyhole sourceAnchorX is textItem-derived (not clamped sourceContextDeepItem)", async ({
    mount,
    page,
  }) => {
    await mount(<AsymmetricAnchorCitation />);
    await openSummaryPopover(page);

    const anchorX = await page
      .locator("[data-dc-source-anchor-x]")
      .first()
      .evaluate(el => Number.parseFloat((el as HTMLElement).dataset.dcSourceAnchorX ?? "1"));

    // textItem "installation" at x=280, width=100 in 400 px evidence image:
    //   center = 330, ratio = 330/400 = 0.825.
    //
    // Broken code: sourceContextDeepItem.center = (140+280)/400 = 1.05 → clamped 1.0.
    // The clamped value (1.0) is outside this range — that's the expected failure.
    expect(
      anchorX,
      `sourceAnchorX=${anchorX.toFixed(4)} — expected ~0.825 (textItem-based), got ${anchorX >= 0.95 ? "clamped sourceContextDeepItem" : "unknown"} value`,
    ).toBeGreaterThan(0.7);
    expect(anchorX).toBeLessThan(0.95);
  });

  // ── Test 2: Ghost anchor position at collapse-end ────────────────────────
  // Measures anchorInGhostX from the debug store after a full expand+collapse
  // cycle. At collapse-end the ghost is parked at the keyhole rect, so:
  //
  //   ghost anchor viewport X = collapse.target.x + anchorInGhostX
  //
  // For AsymmetricAnchorCitation (width-fill, imageOffsetLeft = 0):
  //   correct:  anchorInGhostX ≈ 0.825 × imageWidth  (annotation center)
  //   broken:   anchorInGhostX ≈ 1.0  × imageWidth   (right edge, 83 px too far)
  //
  // The test verifies the anchor is NOT at the right edge of the keyhole strip
  // and instead aligns with the 82.5% position expected from textItems.
  test("ghost anchor at collapse-end is at the annotation center, not the right edge", async ({
    mount,
    page,
  }) => {
    await mount(<AsymmetricAnchorCitation />);
    await enableDebugStore(page);

    const popover = await openSummaryPopover(page);
    await expandToPage(page, popover);
    await waitForGhostDirection(page, "expand");
    await page.waitForTimeout(150);
    await collapseBackToSummary(page);
    const collapse = await waitForGhostDirection(page, "collapse");

    expect(collapse.target, "collapse ghost target rect must be captured").not.toBeNull();
    expect(collapse.anchorInGhostX, "anchorInGhostX must be present in debug snapshot").not.toBeUndefined();

    const keyholeBox = await page.locator("[data-dc-keyhole]").first().boundingBox();
    expect(keyholeBox, "keyhole element must be visible after collapse").not.toBeNull();

    const ghostAnchorX = collapse.target!.x + (collapse.anchorInGhostX ?? 0);
    const keyholeRight = keyholeBox!.x + keyholeBox!.width;
    const keyholeLeft = keyholeBox!.x;

    // Broken: anchor = keyholeLeft + 1.0 * imageWidth ≈ keyholeRight (right edge).
    // Correct: anchor = keyholeLeft + 0.825 * imageWidth ≈ keyholeLeft + 83% width.
    // Tolerance 20 px accommodates rounding in zoom / width-fill computation.
    expect(
      ghostAnchorX,
      `ghost anchor at ${ghostAnchorX.toFixed(0)} px is at or past keyholeRight=${keyholeRight.toFixed(0)} px — anchor is clamped to the right edge`,
    ).toBeLessThan(keyholeRight - 20);

    expect(ghostAnchorX).toBeGreaterThan(keyholeLeft);

    // Positive check: anchor should be near 82.5% through the keyhole width.
    // For width-fill the evidence image fills the keyhole, so annotation at
    // 0.825 × evidence_natural_width = 0.825 × displayed_width.
    // displayed_width ≈ keyholeBox.width for a width-filling image.
    const expectedAnchorX = keyholeLeft + keyholeBox!.width * 0.825;
    expect(
      Math.abs(ghostAnchorX - expectedAnchorX),
      `ghost anchor (${ghostAnchorX.toFixed(0)}) should be within 15 px of expected (${expectedAnchorX.toFixed(0)})`,
    ).toBeLessThanOrEqual(15);
  });

  // ── Test 3: Collapse from expanded-page → expanded-keyhole ──────────────
  // Reproduces the user-reported flow: summary → expanded-keyhole → page → collapse.
  // When collapsing to expanded-keyhole (not summary), the ghost destination is
  // [data-dc-inline-expanded]. Its scroll may be seeded from the keyhole strip at
  // a different zoom, leaving anchorInGhostX >> elW/2. This pushes the ghost's
  // starting rect far off-screen left.
  //
  // Root cause without the fix:
  //   imageOffsetLeft = 0 (no annotation-centered scroll applied)
  //   anchorInGhostX  = sourceAnchorX × imageWidth = 0.867 × 1200 ≈ 1040
  //   viewportRect.x  = spotlightCX − 1040  (far off-screen left)
  //
  // Non-gamed invariant: anchorInGhostX ≤ containerWidth (anchor within ghost bounds).
  //   With fix: scroll-centering brings anchorInGhostX to ≤ elW (at most right edge).
  //   Without fix: anchorInGhostX ≈ 1040 >> containerWidth (≈ 680) — outside bounds.
  //
  // Narrow viewport required: at the default 1280px viewport the container can grow to
  // match the 1200px image width, making overflow (and the bug) invisible. 800px forces
  // ~680px available width so the 1200px image overflows and the fix is exercised.
  //
  // The gamed alternative (|source.x + anchorInGhostX − spotlightCX| ≤ tol) is a
  // tautology: source.x is DEFINED as spotlightCX − anchorInGhostX, so their sum
  // always equals spotlightCX regardless of whether the fix works. That check is
  // omitted here.
  test.describe("narrow viewport (800px) — forces image overflow in expanded-keyhole", () => {
    test.use({ viewport: { width: 800, height: 900 } });

  test("collapse ghost from expanded-page → expanded-keyhole: anchorInGhostX within ghost bounds (WideEvidenceCitation)", async ({
    mount,
    page,
  }) => {
    await mount(<WideEvidenceCitation />);
    await enableDebugStore(page);

    const popover = await openSummaryPopover(page);
    await expandToKeyhole(popover);
    await expandToPage(page, popover);
    await waitForGhostDirection(page, "expand");
    await page.waitForTimeout(150);
    await collapseBackToSummary(page);
    const collapse = await waitForGhostDirection(page, "collapse");

    expect(collapse.target, "collapse ghost target rect must be captured").not.toBeNull();
    expect(collapse.anchorInGhostX, "anchorInGhostX must be present").not.toBeUndefined();

    // Non-gamed invariant: anchorInGhostX must be WITHIN the ghost's width.
    //
    // Two bugs can break this (narrow viewport forces both to be visible):
    //
    // Bug A — missing scroll fix (original):
    //   imageLoaded=true, but scrollLeft never set → imageOffsetLeft = 0
    //   anchorInGhostX = 0.867 × 1200 ≈ 1040 >> containerWidth
    //   → ghost starts wildly off-screen left
    //
    // Bug B — wrong fallback when imageLoaded=false:
    //   !hasImgRect → imageWidth = containerWidth, imageOffsetLeft = 0
    //   anchorInGhostX = 0.867 × containerWidth ≈ 590
    //   → ghost shows wrong (compressed) image region; annotation doesn't align with spotlight
    //   → numerically ≤ containerWidth but visually broken (handoff snap)
    //   (not exercised by this test — canvas data URIs load synchronously, imageLoaded=true)
    //
    // Correct behavior:
    //   When image overflows container: scroll fix → anchorInGhostX = containerWidth/2.
    //   When image fits container: no scroll needed → anchorInGhostX = ax × imageWidth ≤ containerWidth.
    //
    // The gamed alternative (|source.x + anchorInGhostX − spotlightCX| ≤ tol) is a
    // tautology: source.x = spotlightCX − anchorInGhostX, so their sum is always spotlightCX.
    const anchorInGhostX = collapse.anchorInGhostX ?? 0;
    const containerWidth = collapse.target!.width;
    expect(
      anchorInGhostX,
      `anchorInGhostX (${anchorInGhostX.toFixed(0)}) must be ≤ containerWidth (${containerWidth.toFixed(0)}). ` +
        `Without the scroll fix it would be ≈ 1040 (0.867 × 1200px image), well past the ghost's right edge.`,
    ).toBeLessThanOrEqual(containerWidth);

    // Secondary: ghost did not start wildly off-screen to the left.
    expect(
      collapse.source!.x,
      `ghost source.x should not be further off-screen than one ghost-width (>= -containerWidth)`,
    ).toBeGreaterThanOrEqual(-containerWidth);
  });
  }); // end narrow-viewport describe

  // ── Test 4: Expand from expanded-keyhole → page (no spotlight) ─────────────
  // Reproduces the bug where expanding from expanded-keyhole without a spotlight
  // causes the ghost to fly off-screen.
  //
  // Root cause:
  //   buildPageExpandSnapshot reads img.getBoundingClientRect() before correcting
  //   the expanded-keyhole's scroll. The initialScroll prop is seeded from the
  //   keyhole strip at its zoom level (e.g. 0.5×) — not annotation-centered at
  //   natural size. So scrollLeft ≈ strip value → imageOffsetLeft ≠ −(ax × imgW − W/2)
  //   → anchorInGhostX = 0 + 0.867 × 1200 ≈ 1040 >> containerWidth.
  //   ghostEndX = pageCX − 990 → far off-screen left. With the iris clip
  //   (spotlight present) this is visually masked; without it the ghost flies to corner.
  //
  // Fix: buildPageExpandSnapshot force-scrolls the expanded-keyhole to annotation
  //   center before reading the image rect, mirroring buildCollapseGhostSnapshot.
  //
  // Non-gamed invariant: anchorInGhostX for the EXPAND ghost ≤ containerWidth.
  //   Without fix: 0.867 × 1200 ≈ 1040 >> containerWidth (≈ 680) at 800px viewport.
  //   With fix: scroll-centering → anchorInGhostX ≈ containerWidth/2.
  test.describe("narrow viewport (800px) — expand from expanded-keyhole without spotlight", () => {
    test.use({ viewport: { width: 800, height: 900 } });

    test("expand ghost from expanded-keyhole → page: anchorInGhostX within ghost bounds (WideEvidenceCitation)", async ({
      mount,
      page,
    }) => {
      await mount(<WideEvidenceCitation />);
      await enableDebugStore(page);

      const popover = await openSummaryPopover(page);
      await expandToKeyhole(popover);
      await expandToPage(page, popover);
      const expand = await waitForGhostDirection(page, "expand");

      expect(expand.source, "expand ghost source rect must be captured").not.toBeNull();
      expect(expand.anchorInGhostX, "anchorInGhostX must be present").not.toBeUndefined();

      // Non-gamed invariant: anchorInGhostX must be WITHIN the ghost's width.
      //
      // Without the scroll fix: imageOffsetLeft = 0, anchorInGhostX = 0.867 × 1200 ≈ 1040
      // which far exceeds containerWidth (~680 at 800px viewport). The ghost end
      // position is pageCX − 1040 ≈ far off-screen left — flies to corner.
      //
      // With fix: scroll-centering → anchorInGhostX ≈ containerWidth/2.
      const anchorInGhostX = expand.anchorInGhostX ?? 0;
      const containerWidth = expand.source!.width;
      expect(
        anchorInGhostX,
        `anchorInGhostX (${anchorInGhostX.toFixed(0)}) must be ≤ containerWidth (${containerWidth.toFixed(0)}). ` +
          `Without the scroll fix it would be ≈ 1040 (0.867 × 1200px image), well past the ghost's right edge.`,
      ).toBeLessThanOrEqual(containerWidth);

      expect(anchorInGhostX).toBeGreaterThan(0);
    });
  }); // end narrow-viewport describe (expand)
});
