import { expect, test } from "@playwright/experimental-ct-react";
import { PannedKeyholeCitation } from "./PannedKeyholeCitation";

// =============================================================================
// Keyhole-pan vs ghost endpoint regression suite
//
// Guards the fix in runPageCollapseGhostAnimation: the collapse ghost end rect
// is now seated at `keyholeRect.left, keyholeRect.top` (not the center-based
// `keyholeRect.centerX − anchorInGhostX` which diverged from the real anchor
// position whenever the strip was pannable and the annotation was off-center).
//
// Bug that was fixed: the old center-based formula produced a `stripWidth/2 −
// anchorInGhostX` pixel gap between where the collapse ghost landed and where
// the real keyhole's annotation was rendered. This appeared as the ghost
// "shooting past" the destination strip before the real element revealed.
//
// Expand path is included as a control/regression guard — it was already
// pan-correct because it started at `snapshot.viewportRect` (the real strip rect)
// with the image offset baked into the ghost's inner <img>.
//
// All tests drive pan via `container.scrollLeft = N` (not drag) — deterministic
// and immune to the `keyholeInitAppliedRef` one-shot init guard in
// EvidenceKeyhole.tsx:101-225.
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

// ------------------------- harness / capture helpers -------------------------

async function enableDebugStore(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const api = (
      window as unknown as {
        __dcAnimationDebug: { enable: () => void; setSpeed: (x: number) => void };
      }
    ).__dcAnimationDebug;
    api.enable();
    // 0.5 = 2× duration, denser rAF sample grid — better resolution for anchor
    // trajectory assertions without changing endpoint math.
    api.setSpeed(0.5);
  });
}

async function readGhostSnapshot(
  page: import("@playwright/test").Page,
): Promise<CapturedGhost | null> {
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
    if (
      snapshot &&
      snapshot.direction === direction &&
      snapshot.samples.length >= 6 &&
      ghostCount === 0
    ) {
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

async function expandToPage(
  _page: import("@playwright/test").Page,
  popover: import("@playwright/test").Locator,
) {
  const expandButton = popover.getByLabel(/Expand to full page/).first();
  await expect(expandButton).toBeVisible();
  // Scrolling the keyhole causes a fade-mask + arrow-visibility reflow which
  // Playwright's actionability check reads as "element unstable". A bare
  // `click()` retries forever while scroll chains bounce around; `{ force:
  // true, noWaitAfter: true }` is the only sequence that reliably delivers
  // the click after a programmatic scroll.
  await expandButton.click({ force: true, noWaitAfter: true });
}

async function collapseBackToSummary(page: import("@playwright/test").Page) {
  await page.keyboard.press("Escape");
}

const anchorViewportOf = (g: CapturedGhost, rect: SampleRect) => ({
  x: rect.x + (g.anchorInGhostX ?? rect.width / 2),
  y: rect.y + (g.anchorInGhostY ?? rect.height / 2),
});

// ------------------------- pan-specific helpers -------------------------

/**
 * Read the live keyhole geometry: strip rect, image rect, current scrollLeft,
 * and derived anchor positions (where the anchor CURRENTLY sits visually, and
 * where it'd sit if the animation used strip-center instead of strip-left).
 *
 * Returns null if keyhole not in DOM.
 */
async function readKeyholeGeometry(page: import("@playwright/test").Page): Promise<{
  stripLeft: number;
  stripTop: number;
  stripWidth: number;
  stripHeight: number;
  imageOffsetLeft: number;
  imageOffsetTop: number;
  imageWidth: number;
  imageHeight: number;
  scrollLeft: number;
  maxScroll: number;
  sourceAnchorX: number;
  sourceAnchorY: number;
  /** Anchor's actual viewport X right now, given current scroll. */
  anchorViewportX: number;
  /** Anchor's actual viewport Y right now. */
  anchorViewportY: number;
  /** What viewport X the collapse-bug target would land on (strip center). */
  stripCenterX: number;
} | null> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-dc-keyhole]");
    if (!el) return null;
    const img = el.querySelector<HTMLImageElement>("img");
    if (!img) return null;
    const stripRect = el.getBoundingClientRect();
    const imageRect = img.getBoundingClientRect();
    const sax = Number.parseFloat(el.dataset.dcSourceAnchorX ?? "NaN");
    const say = Number.parseFloat(el.dataset.dcSourceAnchorY ?? "NaN");
    if (!Number.isFinite(sax) || !Number.isFinite(say)) return null;
    const anchorInGhostX = (imageRect.left - stripRect.left) + sax * imageRect.width;
    const anchorInGhostY = (imageRect.top - stripRect.top) + say * imageRect.height;
    return {
      stripLeft: stripRect.left,
      stripTop: stripRect.top,
      stripWidth: stripRect.width,
      stripHeight: stripRect.height,
      imageOffsetLeft: imageRect.left - stripRect.left,
      imageOffsetTop: imageRect.top - stripRect.top,
      imageWidth: imageRect.width,
      imageHeight: imageRect.height,
      scrollLeft: el.scrollLeft,
      maxScroll: el.scrollWidth - el.clientWidth,
      sourceAnchorX: sax,
      sourceAnchorY: say,
      anchorViewportX: stripRect.left + anchorInGhostX,
      anchorViewportY: stripRect.top + anchorInGhostY,
      stripCenterX: stripRect.left + stripRect.width / 2,
    };
  });
}

/**
 * Set the keyhole's scrollLeft directly and fire a scroll event so useDragToPan
 * updates its fade state. Returns the applied scrollLeft (may be clamped by the
 * browser to the valid [0, maxScroll] range).
 */
async function setKeyholeScrollLeft(
  page: import("@playwright/test").Page,
  scrollLeft: number,
): Promise<number> {
  return page.evaluate(x => {
    const el = document.querySelector<HTMLElement>("[data-dc-keyhole]");
    if (!el) return Number.NaN;
    const max = el.scrollWidth - el.clientWidth;
    const clamped = Math.max(0, Math.min(x, max));
    el.scrollLeft = clamped;
    el.dispatchEvent(new Event("scroll"));
    return el.scrollLeft;
  }, scrollLeft);
}

type CycleResult = {
  pre: NonNullable<Awaited<ReturnType<typeof readKeyholeGeometry>>>;
  expand: CapturedGhost;
  post: NonNullable<Awaited<ReturnType<typeof readKeyholeGeometry>>>;
  collapse: CapturedGhost;
};

/**
 * Sets scroll to the caller's target, captures the live keyhole geometry
 * PRE-expand (this is the handoff truth for the expand-start), then runs a
 * full expand+collapse cycle and records geometry again after the keyhole
 * remounts (collapse-end handoff truth).
 */
async function captureCycleAtPan(
  page: import("@playwright/test").Page,
  popover: import("@playwright/test").Locator,
  targetScrollLeft: number,
): Promise<CycleResult> {
  // Caller must have already called mount() AND openSummaryPopover().
  // We avoid toggling the popover here because clicking the citation a
  // second time would close it.
  await enableDebugStore(page);
  await expect(popover.locator("[data-dc-keyhole]").first()).toBeVisible();
  await setKeyholeScrollLeft(page, targetScrollLeft);
  // Scroll-induced fade-mask / arrow-visibility reflow needs several rAFs
  // plus the 120ms opacity transition on the arrow hints to settle before
  // Playwright's actionability check will consider the keyhole subtree
  // "stable". 400ms >> (2 rAFs + 120ms) is enough slack.
  await page.waitForTimeout(400);
  const pre = await readKeyholeGeometry(page);
  if (!pre) throw new Error("readKeyholeGeometry(pre) returned null after pan");

  await expandToPage(page, popover);
  const expand = await waitForGhostDirection(page, "expand");
  await page.waitForTimeout(150);
  await collapseBackToSummary(page);
  const collapse = await waitForGhostDirection(page, "collapse");

  // The keyhole element remounts after collapse; wait for its next paint.
  await expect(page.locator("[data-dc-keyhole]").first()).toBeVisible();
  await page.waitForTimeout(32);
  const post = await readKeyholeGeometry(page);
  if (!post) throw new Error("readKeyholeGeometry(post) returned null");

  return { pre, expand, post, collapse };
}

// =============================================================================

test.describe("Keyhole pan ↔ ghost endpoint alignment", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const api = (window as unknown as { __dcAnimationDebug?: { disable: () => void } })
        .__dcAnimationDebug;
      if (api && typeof api.disable === "function") api.disable();
    });
  });

  test("fixture gives a horizontally-scrollable keyhole with off-center anchor", async ({
    mount,
    page,
  }) => {
    await mount(<PannedKeyholeCitation />);
    await openSummaryPopover(page);
    await expect(page.locator("[data-dc-keyhole]").first()).toBeVisible();
    const geo = await readKeyholeGeometry(page);
    expect(geo).not.toBeNull();
    // Image must overflow the strip — otherwise there's nothing to pan.
    expect(geo!.maxScroll).toBeGreaterThan(40);
    // Anchor must be meaningfully off-center for the bug to be visible.
    expect(geo!.sourceAnchorX).toBeGreaterThan(0.7);
    expect(geo!.sourceAnchorX).toBeLessThan(0.95);
  });

  test("[diagnostic] expand works on this fixture without any prior scroll manipulation", async ({
    mount,
    page,
  }) => {
    // If this test fails, the fixture itself is broken (not the scroll logic).
    await mount(<PannedKeyholeCitation />);
    await enableDebugStore(page);
    const popover = await openSummaryPopover(page);
    await expect(popover.locator("[data-dc-keyhole]").first()).toBeVisible();
    await expandToPage(page, popover);
    const expand = await waitForGhostDirection(page, "expand");
    expect(expand.samples.length).toBeGreaterThan(4);
  });

  // -------------------------------------------------------------------------
  // EXPAND PATH — regression controls. These SHOULD pass today.
  // -------------------------------------------------------------------------

  test("expand ghost starts at anchor's viewport position when anchor panned LEFT", async ({
    mount,
    page,
  }) => {
    await mount(<PannedKeyholeCitation />);
    // Pan so the anchor sits near the left side of the strip.
    // We'll drive scroll to (anchor_image_x − stripWidth × 0.2) so anchor is
    // visually ~20% from the strip's left edge.
    const popover = await openSummaryPopover(page);
    await expect(popover.locator("[data-dc-keyhole]").first()).toBeVisible();
    const geo0 = (await readKeyholeGeometry(page))!;
    const anchorImageX = geo0.sourceAnchorX * geo0.imageWidth;
    const targetVisibleAnchor = geo0.stripWidth * 0.2;
    const { pre, expand } = await captureCycleAtPan(
      page,
      popover,
      anchorImageX - targetVisibleAnchor,
    );

    // Expand start rect should be the actual strip rect — its anchor is
    // at strip.left + anchorInGhostX, i.e. the visually-panned position.
    expect(expand.source).not.toBeNull();
    const startAnchor = anchorViewportOf(expand, expand.source!);
    // Tolerate ±3px for pixel rounding / subpixel scrolls.
    expect(startAnchor.x).toBeGreaterThan(pre.anchorViewportX - 3);
    expect(startAnchor.x).toBeLessThan(pre.anchorViewportX + 3);
    // And it must NOT be at the strip's geometric center — that would mean
    // the animation ignored pan.
    expect(Math.abs(startAnchor.x - pre.stripCenterX)).toBeGreaterThan(20);
  });

  test("expand ghost starts at anchor's viewport position when anchor panned RIGHT", async ({
    mount,
    page,
  }) => {
    await mount(<PannedKeyholeCitation />);
    const popover = await openSummaryPopover(page);
    await expect(popover.locator("[data-dc-keyhole]").first()).toBeVisible();
    const geo0 = (await readKeyholeGeometry(page))!;
    const anchorImageX = geo0.sourceAnchorX * geo0.imageWidth;
    const targetVisibleAnchor = geo0.stripWidth * 0.8;
    const { pre, expand } = await captureCycleAtPan(
      page,
      popover,
      anchorImageX - targetVisibleAnchor,
    );
    expect(expand.source).not.toBeNull();
    const startAnchor = anchorViewportOf(expand, expand.source!);
    expect(startAnchor.x).toBeGreaterThan(pre.anchorViewportX - 3);
    expect(startAnchor.x).toBeLessThan(pre.anchorViewportX + 3);
    expect(Math.abs(startAnchor.x - pre.stripCenterX)).toBeGreaterThan(20);
  });

  // -------------------------------------------------------------------------
  // COLLAPSE PATH — these are the FAILING tests capturing the pan-bypass bug.
  //
  // Today the collapse ghost ends at `keyhole.center − anchorInGhost`, so the
  // ghost's anchor lands on the strip CENTER regardless of what's actually
  // visible in the strip. These tests assert the correct behavior: ghost's
  // anchor lands at the anchor's real viewport position in the keyhole.
  // -------------------------------------------------------------------------

  test("collapse ghost lands at anchor's viewport position when anchor panned LEFT", async ({
    mount,
    page,
  }) => {
    await mount(<PannedKeyholeCitation />);
    const popover = await openSummaryPopover(page);
    await expect(popover.locator("[data-dc-keyhole]").first()).toBeVisible();
    const geo0 = (await readKeyholeGeometry(page))!;
    const anchorImageX = geo0.sourceAnchorX * geo0.imageWidth;
    const { post, collapse } = await captureCycleAtPan(
      page,
      popover,
      anchorImageX - geo0.stripWidth * 0.2,
    );

    expect(collapse.target).not.toBeNull();
    const endAnchor = anchorViewportOf(collapse, collapse.target!);

    // The actual anchor position in the post-collapse keyhole — this is where
    // the real element sits, and where the ghost MUST end up to avoid a jump
    // at handoff.
    expect(endAnchor.x).toBeGreaterThan(post.anchorViewportX - 3);
    expect(endAnchor.x).toBeLessThan(post.anchorViewportX + 3);

    // Confirms the bug would fail this test: the ghost should NOT be landing
    // at the strip's geometric center. When anchor is pinned at 20% of strip
    // width, that's ~30% of stripWidth away from center — much bigger than 3px.
    expect(Math.abs(endAnchor.x - post.stripCenterX)).toBeGreaterThan(20);
  });

  test("collapse ghost lands at anchor's viewport position when anchor panned RIGHT", async ({
    mount,
    page,
  }) => {
    await mount(<PannedKeyholeCitation />);
    const popover = await openSummaryPopover(page);
    await expect(popover.locator("[data-dc-keyhole]").first()).toBeVisible();
    const geo0 = (await readKeyholeGeometry(page))!;
    const anchorImageX = geo0.sourceAnchorX * geo0.imageWidth;
    const { post, collapse } = await captureCycleAtPan(
      page,
      popover,
      anchorImageX - geo0.stripWidth * 0.8,
    );

    expect(collapse.target).not.toBeNull();
    const endAnchor = anchorViewportOf(collapse, collapse.target!);
    expect(endAnchor.x).toBeGreaterThan(post.anchorViewportX - 3);
    expect(endAnchor.x).toBeLessThan(post.anchorViewportX + 3);
    expect(Math.abs(endAnchor.x - post.stripCenterX)).toBeGreaterThan(20);
  });

  test("ghost anchor handoff on collapse leaves no gap vs real keyhole anchor", async ({
    mount,
    page,
  }) => {
    // End-to-end handoff assertion: at the last sampled frame, the ghost's
    // anchor viewport position must match the real keyhole element's anchor
    // viewport position within 3px. This is what makes the motion feel
    // "continuous" — a delta here is exactly the pop the user reports.
    await mount(<PannedKeyholeCitation />);
    const popover = await openSummaryPopover(page);
    await expect(popover.locator("[data-dc-keyhole]").first()).toBeVisible();
    const geo0 = (await readKeyholeGeometry(page))!;
    const anchorImageX = geo0.sourceAnchorX * geo0.imageWidth;
    const { post, collapse } = await captureCycleAtPan(
      page,
      popover,
      anchorImageX - geo0.stripWidth * 0.25,
    );
    expect(collapse.samples.length).toBeGreaterThan(5);
    const last = collapse.samples[collapse.samples.length - 1];
    const lastAnchor = anchorViewportOf(collapse, last.rect);
    const deltaX = Math.abs(lastAnchor.x - post.anchorViewportX);
    const deltaY = Math.abs(lastAnchor.y - post.anchorViewportY);
    expect(deltaX, `last-frame ghost anchor x=${lastAnchor.x}, real anchor x=${post.anchorViewportX}`)
      .toBeLessThanOrEqual(3);
    expect(deltaY, `last-frame ghost anchor y=${lastAnchor.y}, real anchor y=${post.anchorViewportY}`)
      .toBeLessThanOrEqual(6);
  });
});
