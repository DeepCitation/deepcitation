import { expect, test } from "@playwright/experimental-ct-react";
import { AsymmetricAnchorCitation } from "./AsymmetricAnchorCitation";

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
});
