import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react/Citation";
import { POPOVER_CONTAINER_SELECTOR } from "../snapshotHelpers";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";
import { GeneratedImageCitation } from "./GeneratedImageCitation";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  type: "document",
  citationNumber: 1,
  anchorText: "Functional status",
  fullPhrase: "Functional status: He is at baseline, no assistance needed, independent ADLs",
  pageNumber: 5,
};

// Static 800×1600 white PNG (1-bit grayscale, ~600 bytes).
// Portrait aspect ratio (2:1 height-to-width) triggers the bug where
// fitZoomH < fitZoomW, causing Math.min(fitZoomW, fitZoomH) to shrink width.
const tallImageBase64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAAZAAQAAAACpxxs4AAACPklEQVR42u3NMQEAAAwCIPuX1hZ7BgVID0QikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUTyNRnb9LNzJVTWGwAAAABJRU5ErkJggg==";

// Verification with pages[] array so resolveExpandedImage finds a match page,
// enabling the "Expand to full page" button.
const verificationWithTallImage: Verification = {
  status: "found",
  verifiedMatchSnippet: "Functional status: He is at baseline",
  document: {
    verifiedPageNumber: 5,
    verificationImageSrc: tallImageBase64,
  },
  pages: [
    {
      pageNumber: 5,
      dimensions: { width: 800, height: 1600 },
      source: tallImageBase64,
      isMatchPage: true,
    },
  ],
};

// =============================================================================
// HELPERS
// =============================================================================

/** Open popover → click "Expand to full page" → wait for expanded image to appear. */
async function expandToFullPage(page: import("@playwright/test").Page) {
  const citation = page.locator("[data-citation-id]");
  await citation.click();

  const popover = page.locator("[data-dc-popover-wrapper]");
  await expect(popover).toBeVisible();

  // The content element (role="dialog") is the one that receives the viewport
  // boundary guard's CSS translate correction — use it for bounding box checks.
  const popoverContent = popover.locator("[role='dialog']");

  // Use .first() to handle the triple always-render EvidenceZone pattern where
  // hidden (display:none) views may contain duplicate aria-labels in the DOM.
  const expandButton = popover.getByLabel(/Expand to full page/).first();
  await expect(expandButton).toBeVisible({ timeout: 5000 });
  await expandButton.click();

  // Triple always-render pattern: both evidence and page InlineExpandedImage instances exist
  // in the DOM simultaneously; filter to the visible one (parent display:none hides inactive views).
  const expandedView = popover.locator("[data-dc-inline-expanded]").filter({ visible: true });
  await expect(expandedView).toBeVisible({ timeout: 5000 });

  // Let layout, zoom calculation, onNaturalSize callback, and Floating UI
  // autoUpdate repositioning fully settle before measuring positions.
  await page.waitForTimeout(1000);

  return { popover, popoverContent, expandedView };
}

/** Assert the popover is fully within (or nearly within) the viewport. */
async function expectPopoverInViewport(
  page: import("@playwright/test").Page,
  popover: import("@playwright/test").Locator,
  tolerance = 2,
) {
  const viewport = page.viewportSize()!;
  const box = await popover.boundingBox();
  expect(box, "popover should have a bounding box").toBeTruthy();

  expect(box!.y).toBeGreaterThanOrEqual(-tolerance);
  expect(box!.x).toBeGreaterThanOrEqual(-tolerance);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + tolerance);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + tolerance);
}

/** Dispatch Ctrl+wheel from a specific viewport point. */
async function dispatchCtrlWheel(
  locator: import("@playwright/test").Locator,
  clientX: number,
  clientY: number,
  deltaY: number,
) {
  await locator.evaluate(
    (el, args) => {
      const event = new WheelEvent("wheel", {
        deltaY: args.deltaY,
        clientX: args.clientX,
        clientY: args.clientY,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
    },
    { clientX, clientY, deltaY },
  );
}

// =============================================================================
// BASIC SCENARIOS — image loading, rendering, and scroll container sizing
// =============================================================================

test.describe("Expanded-Page Basics", () => {
  test("image renders at a width that fills available space, not shrunk by height constraint", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);

    // Triple always-render: filter to visible InlineExpandedImage before locating img inside.
    const img = popover.locator("[data-dc-inline-expanded]").filter({ visible: true }).locator("img");
    await expect(img).toBeVisible();

    const renderedWidth = await img.evaluate(el => (el as HTMLImageElement).getBoundingClientRect().width);
    expect(renderedWidth).toBeGreaterThan(600);
  });

  test("expanded page surface uses contrasted canvas background in light mode", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { expandedView } = await expandToFullPage(page);

    const backgroundColor = await expandedView.evaluate(el => window.getComputedStyle(el as HTMLElement).backgroundColor);
    expect(backgroundColor).toBe("rgb(243, 244, 246)");

    const expandedImage = expandedView.locator("img").first();
    await expect(expandedImage).toBeVisible();
    const hasEdgeRing = await expandedImage.evaluate(el => el.classList.contains("ring-1"));
    expect(hasEdgeRing).toBe(true);
  });

  test("scroll container has usable height, not collapsed to content", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { expandedView } = await expandToFullPage(page);

    const containerHeight = await expandedView.evaluate(
      el => (el as HTMLElement).clientHeight,
    );

    expect(containerHeight).toBeGreaterThan(300);
  });

  test("tall image is scrollable within the container", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { expandedView } = await expandToFullPage(page);

    const { scrollHeight, clientHeight } = await expandedView.evaluate(el => ({
      scrollHeight: (el as HTMLElement).scrollHeight,
      clientHeight: (el as HTMLElement).clientHeight,
    }));

    expect(scrollHeight).toBeGreaterThan(clientHeight);
    expect(scrollHeight / clientHeight).toBeGreaterThan(1.5);
  });
});

test.describe("Expanded-Page Basics - Dark Mode", () => {
  test.use({ colorScheme: "dark" });

  test("expanded page surface uses contrasted canvas background in dark mode", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { expandedView } = await expandToFullPage(page);

    const backgroundColor = await expandedView.evaluate(el => window.getComputedStyle(el as HTMLElement).backgroundColor);
    expect(backgroundColor).toBe("rgb(31, 41, 55)");
  });
});

// =============================================================================
// VIEWPORT CONTAINMENT — popover must stay within visible viewport
//
// Test across viewport sizes (desktop, tablet) and trigger positions (top,
// center, bottom). The expanded-page popover fills the viewport
// (width/height: calc(100dvw/dvh - 2rem)). The viewport boundary guard
// (Layer 3) applies corrective CSS translate to the content element.
// =============================================================================

test.describe("Expanded-Page Viewport Containment", () => {
  // ── Desktop (1280×720 — default CT viewport) ──────────────────────────

  test("desktop: trigger near top — popover stays in viewport", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "20px", paddingLeft: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popoverContent } = await expandToFullPage(page);
    await expectPopoverInViewport(page, popoverContent);
  });

  test("desktop: trigger in center — popover stays in viewport", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "300px", paddingLeft: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popoverContent } = await expandToFullPage(page);
    await expectPopoverInViewport(page, popoverContent);
  });

  test("desktop: trigger near bottom — popover stays in viewport", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "600px", paddingLeft: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popoverContent } = await expandToFullPage(page);
    await expectPopoverInViewport(page, popoverContent);
  });

  test("desktop: scroll-lock layout shift re-clamps expanded popover near left edge", async ({ mount, page }) => {
    await mount(
      <div style={{ position: "relative", height: "2600px" }}>
        <div style={{ position: "absolute", top: "1600px", left: "2px" }}>
          <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
        </div>
      </div>,
    );

    // Ensure the document has a visible scrollbar before opening; entering
    // expanded-page will lock body scroll and remove that scrollbar.
    await page.evaluate(() => window.scrollTo(0, 1300));

    const { popoverContent } = await expandToFullPage(page);
    await expectPopoverInViewport(page, popoverContent);
  });

  // ── Tablet portrait (768×1024) ────────────────────────────────────────

  test.describe("Tablet (768×1024)", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("tablet: trigger near top — popover stays in viewport", async ({ mount, page }) => {
      await mount(
        <div style={{ paddingTop: "20px", paddingLeft: "50px" }}>
          <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
        </div>,
      );

      const { popoverContent } = await expandToFullPage(page);
      await expectPopoverInViewport(page, popoverContent);
    });

    test("tablet: trigger in center — popover stays in viewport", async ({ mount, page }) => {
      await mount(
        <div style={{ paddingTop: "450px", paddingLeft: "50px" }}>
          <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
        </div>,
      );

      const { popoverContent } = await expandToFullPage(page);
      await expectPopoverInViewport(page, popoverContent);
    });

    test("tablet: trigger near bottom — popover stays in viewport", async ({ mount, page }) => {
      await mount(
        <div style={{ paddingTop: "900px", paddingLeft: "50px" }}>
          <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
        </div>,
      );

      const { popoverContent } = await expandToFullPage(page);
      await expectPopoverInViewport(page, popoverContent);
    });

    test("tablet: image width fills available space", async ({ mount, page }) => {
      await mount(
        <div style={{ paddingTop: "100px", paddingLeft: "50px" }}>
          <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
        </div>,
      );

      const { popover } = await expandToFullPage(page);

      // At 768px viewport, image should fill most of the width
      // (800px natural, capped to ~768 - 2rem = 736px)
      // Triple always-render: filter to visible InlineExpandedImage before locating img inside.
      const img = popover.locator("[data-dc-inline-expanded]").filter({ visible: true }).locator("img");
      await expect(img).toBeVisible();
      const renderedWidth = await img.evaluate(el => (el as HTMLImageElement).getBoundingClientRect().width);
      expect(renderedWidth).toBeGreaterThan(500);
    });

    test("tablet: scroll container fills available height", async ({ mount, page }) => {
      await mount(
        <div style={{ paddingTop: "100px", paddingLeft: "50px" }}>
          <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
        </div>,
      );

      const { expandedView } = await expandToFullPage(page);

      const containerHeight = await expandedView.evaluate(
        el => (el as HTMLElement).clientHeight,
      );
      // 1024px viewport - 2rem margin - header zones ≈ should be >500px
      expect(containerHeight).toBeGreaterThan(500);
    });
  });

  // ── Tablet landscape (1024×768) ───────────────────────────────────────

  test.describe("Tablet landscape (1024×768)", () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test("tablet landscape: trigger in center — popover stays in viewport", async ({
      mount,
      page,
    }) => {
      await mount(
        <div style={{ paddingTop: "300px", paddingLeft: "100px" }}>
          <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
        </div>,
      );

      const { popoverContent } = await expandToFullPage(page);
      await expectPopoverInViewport(page, popoverContent);
    });
  });
});

// =============================================================================
// POPOVER-LEVEL SIZING
// =============================================================================

test.describe("Expanded-Page Popover Sizing", () => {
  test("popover width exceeds default for tall images", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);

    const popoverBox = await popover.boundingBox();
    expect(popoverBox).toBeTruthy();
    expect(popoverBox!.width).toBeGreaterThan(600);
  });

  test("popover height fills most of viewport", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);

    const popoverBox = await popover.boundingBox();
    expect(popoverBox).toBeTruthy();
    expect(popoverBox!.height).toBeGreaterThan(500);
  });

  test("expanded-page width is adaptive and clamped to viewport bounds", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <GeneratedImageCitation width={520} height={300} />
      </div>,
    );

    const { popoverContent } = await expandToFullPage(page);
    const viewport = page.viewportSize()!;

    const popoverWidth = await popoverContent.evaluate(el => el.getBoundingClientRect().width);

    // Adaptive width: can be narrower than viewport, but never exceed the
    // viewport clamp (calc(100dvw - 2rem)).
    const maxWidth = viewport.width - 32; // 2rem = 32px
    expect(popoverWidth).toBeLessThanOrEqual(maxWidth + 2);
    expect(popoverWidth).toBeGreaterThan(500);
  });

  test("expanded-page stays centered on trigger when viewport has room", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "260px", display: "flex", justifyContent: "center" }}>
        <GeneratedImageCitation width={520} height={300} />
      </div>,
    );

    const { popoverContent } = await expandToFullPage(page);
    const trigger = page.locator("[data-citation-id]");

    const [popoverBox, triggerBox] = await Promise.all([popoverContent.boundingBox(), trigger.boundingBox()]);
    expect(popoverBox).toBeTruthy();
    expect(triggerBox).toBeTruthy();

    const popoverCenterX = popoverBox!.x + popoverBox!.width / 2;
    const triggerCenterX = triggerBox!.x + triggerBox!.width / 2;
    expect(Math.abs(popoverCenterX - triggerCenterX)).toBeLessThanOrEqual(24);
  });

  test("expanded width adapts across viewport resize", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <GeneratedImageCitation width={900} height={1200} />
      </div>,
    );

    const { popoverContent } = await expandToFullPage(page);

    const readWidth = async () =>
      popoverContent.evaluate(el => el.getBoundingClientRect().width);

    const initial = await readWidth();
    // Adaptive width may be below the viewport max clamp.
    expect(initial).toBeLessThanOrEqual(1280 - 32 + 2);
    expect(initial).toBeGreaterThan(700);

    // Playwright CT doesn't fire window.resize on setViewportSize, so the
    // guard's resize listener never re-clamps --dc-guard-max-width. Simulate
    // the guard's clamp logic (set the CSS variable from clientWidth) directly.
    const reclampGuard = () =>
      page.evaluate(() => {
        const el = document.querySelector("[role='dialog']") as HTMLElement | null;
        if (!el) return;
        const vw = document.documentElement.clientWidth;
        el.style.setProperty("--dc-guard-max-width", `${vw - 32}px`);
      });

    await page.setViewportSize({ width: 700, height: 720 });
    await reclampGuard();
    const narrowed = await readWidth();
    expect(narrowed).toBeLessThan(initial);
    expect(narrowed).toBeLessThanOrEqual(700 - 32 + 2);
    expect(narrowed).toBeGreaterThan(400);

    await page.setViewportSize({ width: 1280, height: 720 });
    await reclampGuard();
    const widened = await readWidth();
    expect(widened).toBeGreaterThan(narrowed);
    expect(widened).toBeLessThanOrEqual(1280 - 32 + 2);
  });

  test("popover shell width stays stable during wheel zoom", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popoverContent, expandedView } = await expandToFullPage(page);
    const beforeWidth = await popoverContent.evaluate(el => el.getBoundingClientRect().width);

    const box = await expandedView.boundingBox();
    expect(box).toBeTruthy();

    const x = box!.x + box!.width * 0.65;
    const y = box!.y + box!.height * 0.35;

    await dispatchCtrlWheel(expandedView, x, y, -140);
    await dispatchCtrlWheel(expandedView, x, y, -140);
    await page.waitForTimeout(250);

    const afterWidth = await popoverContent.evaluate(el => el.getBoundingClientRect().width);
    expect(Math.abs(afterWidth - beforeWidth)).toBeLessThanOrEqual(2);
  });

  test("wheel zoom preserves non-zero viewport scroll (no top-left reset)", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { expandedView } = await expandToFullPage(page);

    // Zoom in first so the image overflows the container in both axes.
    // At initial fit-to-screen zoom, the image width matches the container width,
    // leaving zero horizontal scroll room.
    const initBox = await expandedView.boundingBox();
    expect(initBox).toBeTruthy();
    await dispatchCtrlWheel(expandedView, initBox!.x + initBox!.width / 2, initBox!.y + initBox!.height / 2, -200);
    await dispatchCtrlWheel(expandedView, initBox!.x + initBox!.width / 2, initBox!.y + initBox!.height / 2, -200);
    await page.waitForTimeout(250);

    await expandedView.evaluate(el => {
      const node = el as HTMLElement;
      node.scrollLeft = 220;
      node.scrollTop = 220;
    });
    await page.waitForTimeout(50);

    const before = await expandedView.evaluate(el => ({
      left: (el as HTMLElement).scrollLeft,
      top: (el as HTMLElement).scrollTop,
    }));
    expect(before.left).toBeGreaterThan(100);
    expect(before.top).toBeGreaterThan(100);

    const box = await expandedView.boundingBox();
    expect(box).toBeTruthy();
    const x = box!.x + box!.width * 0.6;
    const y = box!.y + box!.height * 0.4;

    await dispatchCtrlWheel(expandedView, x, y, -160);
    await page.waitForTimeout(250);

    const after = await expandedView.evaluate(el => ({
      left: (el as HTMLElement).scrollLeft,
      top: (el as HTMLElement).scrollTop,
    }));

    expect(after.left).toBeGreaterThan(80);
    expect(after.top).toBeGreaterThan(80);
  });
});

// =============================================================================
// REGRESSION: KEYHOLE STRIP UNCHANGED
// =============================================================================

test.describe("Expanded-Page Regression: Keyhole Strip", () => {
  test("keyhole strip remains at normal dimensions before expanding", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.locator("[data-dc-popover-wrapper]");
    await expect(popover).toBeVisible();

    const strip = popover.locator("[data-dc-keyhole]");
    await expect(strip).toBeVisible();

    const stripHeight = await strip.evaluate(el =>
      parseFloat(window.getComputedStyle(el as HTMLElement).height),
    );
    expect(stripHeight).toBe(120);

    const container = popover.locator(POPOVER_CONTAINER_SELECTOR);
    await expect(container).toBeVisible();
    const containerWidth = await container.evaluate(el =>
      parseFloat(window.getComputedStyle(el as HTMLElement).width),
    );
    expect(containerWidth).toBeGreaterThanOrEqual(476);
    expect(containerWidth).toBeLessThanOrEqual(480);
  });
});
