import { test, expect } from "@playwright/experimental-ct-react";
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
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(0, 0, 800, 100);
      ctx.fillStyle = '#333333';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Wide verification image (800px)', 400, 55);
      return canvas.toDataURL('image/png');
    }
  }
  // Fallback: minimal 1x1 gray PNG for SSR/Node environments
  // This is a valid PNG that won't cause scaling issues
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
})();

const verificationWithWideImage: Verification = {
  verifiedPageNumber: 5,
  status: "found",
  verificationImageBase64: wideImageBase64,
  verifiedMatchSnippet: "Functional status: He is at baseline",
};

const verificationWithPartialMatch: Verification = {
  verifiedPageNumber: 5,
  status: "partial_text_found",
  verificationImageBase64: wideImageBase64,
  verifiedMatchSnippet: "Functional status: at baseline",
};

const verificationWithMiss: Verification = {
  verifiedPageNumber: -1,
  status: "not_found",
};

// =============================================================================
// POPOVER IMAGE WIDTH TESTS
// =============================================================================

test.describe("Popover Image Width Constraint", () => {
  test("popover image has constrained max dimensions", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    // Click to open popover (lazy mode - hover no longer shows popover)
    await citation.click();

    // Wait for popover to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the popover container - new layout uses a fixed-width container
    // Implementation uses: style={{ width: "380px", maxWidth: "90vw" }}
    const container = popover.locator(".overflow-hidden.rounded-lg");
    await expect(container).toBeVisible();

    // The container should have a constrained width (400px or 90vw max)
    const containerWidth = await container.evaluate((el) => (el as HTMLElement).style.width);
    expect(containerWidth).toBe("400px");
  });

  test("popover image has max height constraint", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    // Click to open popover (lazy mode - hover no longer shows popover)
    await citation.click();

    // Wait for popover to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the image
    const image = popover.locator("img");
    await expect(image).toBeVisible();

    // Check that image has max-height constraint via inline style
    // Implementation uses: maxHeight: "min(50vh, 300px)"
    const maxHeight = await image.evaluate((el) => (el as HTMLElement).style.maxHeight);
    expect(maxHeight).toContain("300px");
  });

  test("image uses object-fit contain to maintain aspect ratio", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    // Click to open popover (lazy mode - hover no longer shows popover)
    await citation.click();

    // Wait for popover to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the image
    const image = popover.locator("img");
    await expect(image).toBeVisible();

    // Check that image uses object-fit: contain to maintain aspect ratio
    // Implementation uses inline style: objectFit: "contain"
    const objectFit = await image.evaluate((el) => (el as HTMLElement).style.objectFit);
    expect(objectFit).toBe("contain");
  });

  test("image fills container width", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    // Click to open popover (lazy mode - hover no longer shows popover)
    await citation.click();

    // Wait for popover to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the image
    const image = popover.locator("img");
    await expect(image).toBeVisible();

    // Check that image uses w-full class to fill container width
    // Implementation uses: className="block rounded-md w-full"
    const hasWFullClass = await image.evaluate((el) => el.classList.contains("w-full"));
    expect(hasWFullClass).toBe(true);
  });
});

// =============================================================================
// VISUAL COMPARISON - ALL POPOVER STATES
// =============================================================================

// Skip visual snapshot tests in CI when baselines may not exist for the platform
const skipVisualTests = !!process.env.CI && !process.env.UPDATE_SNAPSHOTS;

test.describe("Popover Visual States", () => {
  test("visual comparison of all popover states", async ({ mount, page }) => {
    test.skip(skipVisualTests, 'Skipping visual test - no baseline for this platform');
    await mount(
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "200px",
        padding: "120px 50px",
        minHeight: "800px"
      }}>
        <div>
          <strong>Verified with wide image:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            verification={verificationWithWideImage}
          />
        </div>
        <div>
          <strong>Partial match with wide image:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            verification={verificationWithPartialMatch}
          />
        </div>
        <div>
          <strong>Not found (no image):</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            verification={verificationWithMiss}
          />
        </div>
      </div>
    );

    // Take screenshot of the page for visual verification
    // This allows manual inspection of all states
    await expect(page).toHaveScreenshot("popover-states-overview.png", {
      fullPage: true,
    });
  });

  test("popover with verified image on click", async ({ mount, page }) => {
    test.skip(skipVisualTests, 'Skipping visual test - no baseline for this platform');

    await mount(
      <div style={{ padding: "150px 50px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    // Click to open popover (lazy mode - hover no longer shows popover)
    await citation.click();

    // Wait for popover animation
    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot("popover-verified-click.png");
  });

  test("popover with partial match on click", async ({ mount, page }) => {
    test.skip(skipVisualTests, 'Skipping visual test - no baseline for this platform');

    await mount(
      <div style={{ padding: "150px 50px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithPartialMatch}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    // Click to open popover (lazy mode - hover no longer shows popover)
    await citation.click();

    // Wait for popover animation
    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot("popover-partial-click.png");
  });

  test("popover with miss state on click", async ({ mount, page }) => {
    test.skip(skipVisualTests, 'Skipping visual test - no baseline for this platform');

    await mount(
      <div style={{ padding: "150px 50px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithMiss}
        />
      </div>
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
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
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
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
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
