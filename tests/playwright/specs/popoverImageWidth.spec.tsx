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

// Create a wide test image (800x100 pixels, solid gray)
// This simulates a wide verification image that could overflow the popover
// Using a proper PNG instead of SVG to avoid SVG scaling issues in tests
const wideImageBase64 = (() => {
  // Generate a simple gray PNG programmatically using canvas
  // This creates an 800x100 gray rectangle image
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#cccccc";
      ctx.fillRect(0, 0, 800, 100);
      ctx.fillStyle = "#333333";
      ctx.font = "14px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Wide verification image (800px)", 400, 55);
      return canvas.toDataURL("image/png");
    }
  }
  // Fallback: minimal 1x1 gray PNG for SSR/Node environments
  // This is a valid PNG that won't cause scaling issues
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
})();

const verificationWithWideImage: Verification = {
  status: "found",
  verifiedMatchSnippet: "Functional status: He is at baseline",
  document: {
    verifiedPageNumber: 5,
    verificationImageBase64: wideImageBase64,
  },
};

const verificationWithPartialMatch: Verification = {
  status: "partial_text_found",
  verifiedMatchSnippet: "Functional status: at baseline",
  document: {
    verifiedPageNumber: 5,
    verificationImageBase64: wideImageBase64,
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

    // Strip should have a fixed height of 60px (default)
    const stripHeight = await strip.evaluate(el =>
      parseFloat(window.getComputedStyle(el as HTMLElement).height)
    );
    expect(stripHeight).toBe(60);
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

    const image = popover.locator("img");
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
  test("clicking image within popover opens full-size overlay", async ({ mount, page }) => {
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

    // Click the image within the popover to expand to full size
    const popoverImage = popover.locator("img");
    await expect(popoverImage).toBeVisible();
    await popoverImage.click();

    // Check that the full-size image overlay appeared
    // Use the specific aria-label to distinguish from popover
    const overlay = page.getByRole("dialog", { name: "Full size verification image" });
    await expect(overlay).toBeVisible();

    // The overlay image should be visible
    const overlayImage = overlay.locator("img");
    await expect(overlayImage).toBeVisible();
  });

  test("pressing Escape closes overlay", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "50px" }}>
        <CitationComponent citation={baseCitation} verification={verificationWithWideImage} />
      </div>,
    );

    // First click opens popover (lazy mode)
    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Wait for popover and click image to expand
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();
    const popoverImage = popover.locator("img");
    await popoverImage.click();

    // Verify overlay is open
    const overlay = page.getByRole("dialog", { name: "Full size verification image" });
    await expect(overlay).toBeVisible();

    // Press Escape to close
    await page.keyboard.press("Escape");

    // Overlay should be closed
    await expect(overlay).not.toBeVisible();
  });
});
