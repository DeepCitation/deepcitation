import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react/CitationComponent";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  citationNumber: 1,
  anchorText: "Functional status",
  fullPhrase: "Functional status: He is at baseline, no assistance needed, independent ADLs",
  pageNumber: 5,
};

// Static 800×100 gray PNG — generated offline so dimensions are reliable in both
// Node (test compilation) and browser (Playwright runtime) environments.
const wideImageBase64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAABkCAAAAABbOgtTAAABGElEQVR4nO3TMQEAIAzAsPnXhigUrC8ciYI+nQOs5nUA/MwgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwC4QIk+xSYleLzlwAAAABJRU5ErkJggg==";

const verificationWithWideImage: Verification = {
  status: "found",
  verifiedMatchSnippet: "Functional status: He is at baseline",
  document: {
    verifiedPageNumber: 5,
    verificationImageSrc: wideImageBase64,
  },
};

const verificationWithPartialMatch: Verification = {
  status: "partial_text_found",
  verifiedMatchSnippet: "Functional status: at baseline",
  document: {
    verifiedPageNumber: 5,
    verificationImageSrc: wideImageBase64,
  },
};

const verificationWithMiss: Verification = {
  status: "not_found",
  document: {
    verifiedPageNumber: -1,
  },
};

// =============================================================================
// POPOVER IMAGE — KEYHOLE STRIP TESTS
// =============================================================================

test.describe("Popover Image Keyhole Strip", () => {
  test("popover container has constrained width", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the inner popover container
    const container = popover.locator(".shadow-md.rounded-lg");
    await expect(container).toBeVisible();

    // The container should have a constrained width (~480px)
    const containerWidth = await container.evaluate(el =>
      parseFloat(window.getComputedStyle(el as HTMLElement).width)
    );
    expect(containerWidth).toBeGreaterThanOrEqual(476);
    expect(containerWidth).toBeLessThanOrEqual(480);
  });

  test("keyhole strip has fixed height", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the keyhole strip container (has data-dc-keyhole attribute)
    const strip = popover.locator("[data-dc-keyhole]");
    await expect(strip).toBeVisible();

    // Strip should have a fixed height of 120px (default, set by KEYHOLE_STRIP_HEIGHT_DEFAULT)
    const stripHeight = await strip.evaluate(el =>
      parseFloat(window.getComputedStyle(el as HTMLElement).height)
    );
    expect(stripHeight).toBe(120);
  });

  test("image renders at natural scale (not squashed)", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Use keyhole-strip img — triple always-render pattern puts extra imgs in DOM (display:none)
    const image = popover.locator("[data-dc-keyhole] img");
    await expect(image).toBeVisible();

    // Image should have max-w-none class (no max-width constraint)
    const hasMaxWNone = await image.evaluate(el => el.classList.contains("max-w-none"));
    expect(hasMaxWNone).toBe(true);

    // Image should NOT use object-fit (no squashing)
    const objectFit = await image.evaluate(el => (el as HTMLElement).style.objectFit);
    expect(objectFit).toBe("");
  });

  test("strip container has horizontal overflow scroll", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the keyhole strip container
    const strip = popover.locator("[data-dc-keyhole]");
    await expect(strip).toBeVisible();

    // Container should have overflow-x: auto
    const overflowX = await strip.evaluate(el =>
      window.getComputedStyle(el as HTMLElement).overflowX
    );
    expect(overflowX).toBe("auto");

    // Container should have overflow-y: hidden
    const overflowY = await strip.evaluate(el =>
      window.getComputedStyle(el as HTMLElement).overflowY
    );
    expect(overflowY).toBe("hidden");
  });

  test("strip has hidden scrollbar", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    const strip = popover.locator("[data-dc-keyhole]");
    await expect(strip).toBeVisible();

    // Scrollbar should be hidden via scrollbar-width: none
    const scrollbarWidth = await strip.evaluate(el =>
      window.getComputedStyle(el as HTMLElement).scrollbarWidth
    );
    expect(scrollbarWidth).toBe("none");
  });
});

// =============================================================================
// VISUAL COMPARISON - ALL POPOVER STATES
// =============================================================================

// Skip visual snapshot tests in CI when baselines may not exist for the platform
const skipVisualTests = !!process.env.CI && !process.env.UPDATE_SNAPSHOTS;

test.describe("Popover Visual States", () => {
  test("visual comparison of all popover states combined in grid", async ({ mount, page }) => {
    test.skip(skipVisualTests, "Skipping visual test - no baseline for this platform");
    await mount(
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "120px",
          padding: "100px 50px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
          <strong>Verified</strong>
          <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
          <strong>Partial</strong>
          <CitationComponent citation={baseCitation} verification={verificationWithPartialMatch} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
          <strong>Not Found</strong>
          <CitationComponent citation={baseCitation} verification={verificationWithMiss} />
        </div>
      </div>,
    );

    // Take screenshot of the page for visual verification
    // This allows manual inspection of all states in a compact grid layout
    await expect(page).toHaveScreenshot("popover-states-grid.png", {
      fullPage: true,
    });
  });

  test("popover with verified image on click", async ({ mount, page }) => {
    test.skip(skipVisualTests, "Skipping visual test - no baseline for this platform");

    await mount(
      <div style={{ padding: "150px 50px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    // Click to open popover (lazy mode - hover no longer shows popover)
    await citation.click();

    // Wait for popover animation
    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot("popover-verified-click.png");
  });

  test("popover with partial match on click", async ({ mount, page }) => {
    test.skip(skipVisualTests, "Skipping visual test - no baseline for this platform");

    await mount(
      <div style={{ padding: "150px 50px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithPartialMatch} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    // Click to open popover (lazy mode - hover no longer shows popover)
    await citation.click();

    // Wait for popover animation
    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot("popover-partial-click.png");
  });

  test("popover with miss state on click", async ({ mount, page }) => {
    test.skip(skipVisualTests, "Skipping visual test - no baseline for this platform");

    await mount(
      <div style={{ padding: "150px 50px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithMiss} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    // Click to open popover (lazy mode - hover no longer shows popover)
    await citation.click();

    // Wait for popover animation
    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot("popover-miss-click.png");
  });
});

// =============================================================================
// IMAGE CLICK TO EXPAND TESTS
// =============================================================================

test.describe("Image Click to Expand", () => {
  test("clicking image within popover expands to inline evidence view", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "50px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
      </div>,
    );

    // First click opens popover (lazy mode)
    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Wait for popover to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Click the keyhole strip to expand (the strip is the interactive area, not the img directly)
    const keyholeStrip = popover.locator("[data-dc-keyhole]");
    await expect(keyholeStrip).toBeVisible();
    await keyholeStrip.click();

    // Triple always-render: both evidence and page InlineExpandedImage exist in DOM; filter to visible.
    const expandedView = popover.locator("[data-dc-inline-expanded]").filter({ visible: true });
    await expect(expandedView).toBeVisible({ timeout: 5000 });
  });

  test("pressing Escape closes popover from expanded state", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "50px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
      </div>,
    );

    // First click opens popover (lazy mode)
    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Wait for popover and click keyhole strip to expand
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();
    const keyholeStrip = popover.locator("[data-dc-keyhole]");
    await keyholeStrip.click();

    // Verify expanded view is active (filter to visible — triple always-render pattern)
    const expandedView = popover.locator("[data-dc-inline-expanded]").filter({ visible: true });
    await expect(expandedView).toBeVisible({ timeout: 5000 });

    // First Escape collapses expanded-evidence back to summary
    await page.keyboard.press("Escape");
    await expect(expandedView).not.toBeVisible();
    await expect(popover).toBeVisible();

    // Second Escape closes the popover
    await page.keyboard.press("Escape");
    await expect(popover).not.toBeVisible();
  });
});
