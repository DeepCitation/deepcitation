import { test, expect } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../react/CitationComponent";
import type { Citation } from "../../types/citation";
import type { Verification } from "../../types/verification";

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
const wideImageBase64 = (() => {
  // Create a simple 800x100 gray PNG using a data URL
  // This is a minimal valid PNG that's wider than the 384px constraint
  return "data:image/svg+xml;base64," + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="100">
      <rect width="800" height="100" fill="#cccccc"/>
      <text x="400" y="55" font-family="Arial" font-size="14" fill="#333" text-anchor="middle">
        Wide verification image (800px)
      </text>
    </svg>
  `.trim());
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
  test("popover image container has width constraint classes", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    await citation.hover();

    // Wait for popover to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the image button container
    const imageButton = popover.locator("button");
    await expect(imageButton).toBeVisible();

    // Check that the button has the correct Tailwind classes for width constraint
    // w-[384px] sets fixed width, max-w-full allows shrinking on small screens
    await expect(imageButton).toHaveClass(/w-\[384px\]/);
    await expect(imageButton).toHaveClass(/max-w-full/);
  });

  test("popover image container has height constraint class", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    await citation.hover();

    // Wait for popover to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the image button container
    const imageButton = popover.locator("button");
    await expect(imageButton).toBeVisible();

    // Check that the button has the correct Tailwind class for fixed height
    await expect(imageButton).toHaveClass(/h-\[200px\]/);
  });

  test("image is cropped with object-cover, not stretched", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    await citation.hover();

    // Wait for popover to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the image
    const image = popover.locator("img");
    await expect(image).toBeVisible();

    // Check that image has object-cover class for proper cropping
    await expect(image).toHaveClass(/object-cover/);
    // Check that image anchors to left-top to show the relevant highlighted area
    await expect(image).toHaveClass(/object-left-top/);
  });

  test("image fills container with w-full h-full", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    await citation.hover();

    // Wait for popover to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible();

    // Find the image
    const image = popover.locator("img");
    await expect(image).toBeVisible();

    // Check that image fills its container
    await expect(image).toHaveClass(/w-full/);
    await expect(image).toHaveClass(/h-full/);
  });
});

// =============================================================================
// VISUAL COMPARISON - ALL POPOVER STATES
// =============================================================================

test.describe("Popover Visual States", () => {
  test("visual comparison of all popover states", async ({ mount, page }) => {
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

  test("popover with verified image on hover", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "150px 50px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    await citation.hover();

    // Wait for popover animation
    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot("popover-verified-hover.png");
  });

  test("popover with partial match on hover", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "150px 50px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithPartialMatch}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    await citation.hover();

    // Wait for popover animation
    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot("popover-partial-hover.png");
  });

  test("popover with miss state on hover", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "150px 50px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithMiss}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    await citation.hover();

    // Wait for popover animation
    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot("popover-miss-hover.png");
  });
});

// =============================================================================
// IMAGE CLICK TO EXPAND TESTS
// =============================================================================

test.describe("Image Click to Expand", () => {
  test("clicking citation with image opens full-size overlay", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "50px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    // Click the citation directly (default behavior opens image overlay)
    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Check that the full-size image overlay appeared
    // Use the specific aria-label to distinguish from popover
    const overlay = page.getByRole("dialog", { name: "Full size verification image" });
    await expect(overlay).toBeVisible();

    // The overlay image should be visible
    const overlayImage = overlay.locator("img");
    await expect(overlayImage).toBeVisible();
  });

  test("clicking overlay closes it", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "50px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithWideImage}
        />
      </div>
    );

    // Click citation to open overlay
    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Verify overlay is open
    const overlay = page.getByRole("dialog", { name: "Full size verification image" });
    await expect(overlay).toBeVisible();

    // Click overlay to close
    await overlay.click();

    // Overlay should be closed
    await expect(overlay).not.toBeVisible();
  });
});
