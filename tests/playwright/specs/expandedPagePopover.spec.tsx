import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react/CitationComponent";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

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

  const popover = page.locator("[data-radix-popper-content-wrapper]");
  await expect(popover).toBeVisible();

  const expandButton = popover.getByLabel(/Expand to full page/);
  await expect(expandButton).toBeVisible({ timeout: 5000 });
  await expandButton.click();

  const expandedView = popover.locator("[data-dc-inline-expanded]");
  await expect(expandedView).toBeVisible({ timeout: 5000 });

  // Let layout, zoom calculation, and onNaturalSize callback settle
  await page.waitForTimeout(500);

  return { popover, expandedView };
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

    const img = popover.locator("[data-dc-inline-expanded] img");
    await expect(img).toBeVisible();

    const renderedWidth = await img.evaluate(el => (el as HTMLImageElement).getBoundingClientRect().width);
    expect(renderedWidth).toBeGreaterThan(600);
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

// =============================================================================
// VIEWPORT CONTAINMENT — popover must stay within visible viewport
//
// Test across viewport sizes (desktop, tablet) and trigger positions (top,
// center, bottom). The expanded-page popover requests nearly full viewport
// height via height: calc(100dvh - 2rem). Radix's shift middleware must
// reposition it so nothing clips above or below.
// =============================================================================

test.describe("Expanded-Page Viewport Containment", () => {
  // ── Desktop (1280×720 — default CT viewport) ──────────────────────────

  test("desktop: trigger near top — popover stays in viewport", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "20px", paddingLeft: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);
    await expectPopoverInViewport(page, popover);
  });

  test("desktop: trigger in center — popover stays in viewport", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "300px", paddingLeft: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);
    await expectPopoverInViewport(page, popover);
  });

  test("desktop: trigger near bottom — popover stays in viewport", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "600px", paddingLeft: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);
    await expectPopoverInViewport(page, popover);
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

      const { popover } = await expandToFullPage(page);
      await expectPopoverInViewport(page, popover);
    });

    test("tablet: trigger in center — popover stays in viewport", async ({ mount, page }) => {
      await mount(
        <div style={{ paddingTop: "450px", paddingLeft: "50px" }}>
          <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
        </div>,
      );

      const { popover } = await expandToFullPage(page);
      await expectPopoverInViewport(page, popover);
    });

    test("tablet: trigger near bottom — popover stays in viewport", async ({ mount, page }) => {
      await mount(
        <div style={{ paddingTop: "900px", paddingLeft: "50px" }}>
          <CitationComponent citation={baseCitation} verification={verificationWithTallImage} />
        </div>,
      );

      const { popover } = await expandToFullPage(page);
      await expectPopoverInViewport(page, popover);
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
      const img = popover.locator("[data-dc-inline-expanded] img");
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

      const { popover } = await expandToFullPage(page);
      await expectPopoverInViewport(page, popover);
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

    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    const strip = popover.locator("[data-dc-keyhole]");
    await expect(strip).toBeVisible();

    const stripHeight = await strip.evaluate(el =>
      parseFloat(window.getComputedStyle(el as HTMLElement).height),
    );
    expect(stripHeight).toBe(90);

    const container = popover.locator(".shadow-md.rounded-lg");
    await expect(container).toBeVisible();
    const containerWidth = await container.evaluate(el =>
      parseFloat(window.getComputedStyle(el as HTMLElement).width),
    );
    expect(containerWidth).toBeGreaterThanOrEqual(476);
    expect(containerWidth).toBeLessThanOrEqual(480);
  });
});
