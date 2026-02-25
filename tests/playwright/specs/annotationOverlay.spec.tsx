import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react/CitationComponent";
import type { DeepTextItem } from "../../../src/types/boxes";
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
const tallImageBase64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAAZAAQAAAACpxxs4AAACPklEQVR42u3NMQEAAAwCIPuX1hZ7BgVID0QikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUTyNRnb9LNzJVTWGwAAAABJRU5ErkJggg==";

// Phrase item at y=200 (PDF bottom-up) on 800×1600 image.
// → imageY = 1600 - 200 = 1400px from top (87.5% — below fold)
// renderScale 1:1 so PDF coords = image pixels.
const PHRASE_ITEM: DeepTextItem = {
  x: 100,
  y: 200,
  width: 400,
  height: 20,
  text: "Functional status: He is at baseline, no assistance needed, independent ADLs",
};

// Anchor item — different text from phrase item, so anchor highlight renders.
const ANCHOR_ITEM: DeepTextItem = {
  x: 120,
  y: 200,
  width: 150,
  height: 20,
  text: "Functional status",
};

// Verification with phraseMatchDeepItem, anchorTextMatchDeepItems, and renderScale.
const verificationWithAnnotation: Verification = {
  status: "found",
  verifiedMatchSnippet: "Functional status: He is at baseline",
  verifiedAnchorText: "Functional status",
  verifiedFullPhrase: "Functional status: He is at baseline, no assistance needed, independent ADLs",
  document: {
    verifiedPageNumber: 5,
    verificationImageSrc: tallImageBase64,
    phraseMatchDeepItem: PHRASE_ITEM,
    anchorTextMatchDeepItems: [ANCHOR_ITEM],
  },
  pages: [
    {
      pageNumber: 5,
      dimensions: { width: 800, height: 1600 },
      source: tallImageBase64,
      isMatchPage: true,
      renderScale: { x: 1, y: 1 },
    },
  ],
};

// Same verification but without renderScale — annotation should not render.
const verificationNoRenderScale: Verification = {
  status: "found",
  verifiedMatchSnippet: "Functional status: He is at baseline",
  verifiedAnchorText: "Functional status",
  verifiedFullPhrase: "Functional status: He is at baseline, no assistance needed, independent ADLs",
  document: {
    verifiedPageNumber: 5,
    verificationImageSrc: tallImageBase64,
    phraseMatchDeepItem: PHRASE_ITEM,
    anchorTextMatchDeepItems: [ANCHOR_ITEM],
  },
  pages: [
    {
      pageNumber: 5,
      dimensions: { width: 800, height: 1600 },
      source: tallImageBase64,
      isMatchPage: true,
      // no renderScale
    },
  ],
};

// Same verification but without phraseMatchDeepItem — annotation should not render.
const verificationNoPhraseItem: Verification = {
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
      renderScale: { x: 1, y: 1 },
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

  // Use .first() to handle the triple always-render EvidenceZone pattern where
  // hidden (display:none) views may contain duplicate aria-labels in the DOM.
  const expandButton = popover.getByLabel(/Expand to full page/).first();
  await expect(expandButton).toBeVisible({ timeout: 5000 });
  await expandButton.click();

  // Triple always-render pattern: both evidence and page InlineExpandedImage instances exist
  // in the DOM simultaneously; filter to the visible one (parent display:none hides inactive views).
  const expandedView = popover.locator("[data-dc-inline-expanded]").filter({ visible: true });
  await expect(expandedView).toBeVisible({ timeout: 5000 });

  // Let layout, zoom calculation, and onNaturalSize callback settle
  await page.waitForTimeout(500);

  return { popover, expandedView };
}

// =============================================================================
// ANNOTATION OVERLAY — RENDERING
// =============================================================================

test.describe("Annotation Overlay — rendering", () => {
  test("annotation overlay renders in expanded-page view", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithAnnotation} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);

    // The overlay should be visible (filter for visible handles triple-render pattern)
    const overlay = popover.locator("[data-dc-annotation-overlay]").filter({ visible: true });
    await expect(overlay).toBeVisible();
  });

  test("spotlight, left bracket, right bracket elements are present", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithAnnotation} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);

    const overlay = popover.locator("[data-dc-annotation-overlay]").filter({ visible: true });
    await expect(overlay).toBeVisible();

    await expect(overlay.locator("[data-dc-spotlight]")).toBeVisible();
    await expect(overlay.locator("[data-dc-bracket-left]")).toBeVisible();
    await expect(overlay.locator("[data-dc-bracket-right]")).toBeVisible();
  });

  test("anchor highlight renders when fullPhrase has enough words beyond anchorText", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithAnnotation} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);

    const overlay = popover.locator("[data-dc-annotation-overlay]").filter({ visible: true });
    await expect(overlay).toBeVisible();

    await expect(overlay.locator("[data-dc-anchor-highlight]")).toBeVisible();
  });

  test("annotation overlay absent when no renderScale on match page", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationNoRenderScale} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);

    // No annotation overlay should be present (visible)
    const overlay = popover.locator("[data-dc-annotation-overlay]").filter({ visible: true });
    await expect(overlay).toHaveCount(0);
  });
});

// =============================================================================
// ANNOTATION OVERLAY — SCROLL-TO
// =============================================================================

test.describe("Annotation Overlay — scroll-to", () => {
  test("auto-scroll on mount: scrollTop > 100 (annotation below fold at y=1400 on 1600px image)", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithAnnotation} />
      </div>,
    );

    const { expandedView } = await expandToFullPage(page);

    const scrollTop = await expandedView.evaluate(el => (el as HTMLElement).scrollTop);
    // Annotation is at ~87.5% from top (y=1400 of 1600px image, scaled by zoom).
    // After auto-scroll, scrollTop should be significantly > 0.
    expect(scrollTop).toBeGreaterThan(100);
  });

  test("scroll-to-annotation button visible when annotation data present", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithAnnotation} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);

    const scrollToBtn = popover.locator("[data-dc-scroll-to-annotation]");
    await expect(scrollToBtn).toBeVisible();
  });

  test("scroll-to-annotation button: after scrolling to top, click re-centers near annotation", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithAnnotation} />
      </div>,
    );

    const { popover, expandedView } = await expandToFullPage(page);

    // Scroll to the very top manually
    await expandedView.evaluate(el => {
      (el as HTMLElement).scrollTop = 0;
    });

    // Verify we're at the top
    const scrollTopBefore = await expandedView.evaluate(el => (el as HTMLElement).scrollTop);
    expect(scrollTopBefore).toBe(0);

    // Click the scroll-to-annotation button
    const scrollToBtn = popover.locator("[data-dc-scroll-to-annotation]");
    await scrollToBtn.click();

    // Wait for smooth scroll to reach the annotation (polling instead of fixed timeout)
    await expandedView.evaluate(
      el =>
        new Promise<void>(resolve => {
          const check = () => {
            if ((el as HTMLElement).scrollTop > 100) return resolve();
            requestAnimationFrame(check);
          };
          check();
        }),
    );

    const scrollTopAfter = await expandedView.evaluate(el => (el as HTMLElement).scrollTop);
    // Should have scrolled back down toward the annotation
    expect(scrollTopAfter).toBeGreaterThan(100);
  });

  test("scroll-to-annotation button hidden when no phraseMatchDeepItem", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationNoPhraseItem} />
      </div>,
    );

    const { popover } = await expandToFullPage(page);

    const scrollToBtn = popover.locator("[data-dc-scroll-to-annotation]");
    await expect(scrollToBtn).toHaveCount(0);
  });
});
