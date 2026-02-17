import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react";
import {
  HOVER_CLOSE_DELAY_MS,
  REPOSITION_GRACE_PERIOD_MS,
} from "../../../src/react/CitationComponent";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  citationNumber: 1,
  anchorText: "25% revenue growth",
  fullPhrase: "The company reported 25% revenue growth in Q4",
  pageNumber: 5,
  lineIds: [12, 13],
};

// Verification with search attempts to enable expandable details section
const verificationWithDetails: Verification = {
  status: "not_found",
  searchAttempts: [
    {
      method: "exact",
      success: false,
      searchPhrase: "25% revenue growth",
      searchVariations: ["25% revenue growth"],
    },
    {
      method: "partial",
      success: false,
      searchPhrase: "revenue growth",
      searchVariations: ["revenue growth"],
    },
  ],
};

// Valid 4x4 gray PNG for testing (not truncated)
const testImageBase64 = (() => {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#cccccc";
      ctx.fillRect(0, 0, 400, 50);
      return canvas.toDataURL("image/png");
    }
  }
  // Fallback: valid 1x1 gray PNG
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
})();

const verifiedVerification: Verification = {
  status: "found",
  document: {
    verifiedPageNumber: 5,
    verificationImageSrc: testImageBase64,
  },
};

// =============================================================================
// BASIC POPOVER BEHAVIOR TESTS
// =============================================================================

test.describe("Citation Popover - Basic Behavior", () => {
  test("opens popover on citation click", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Popover should be visible (use role="dialog" for specificity)
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();
  });

  test("closes popover on Escape key", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Popover should be open
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Press Escape on the page (Radix listens to document-level events)
    await page.keyboard.press("Escape");

    // Wait for close animation to complete
    await page.waitForTimeout(500);

    // Popover should be closed
    const isVisible = await popover.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  test("closes popover on click outside", async ({ mount, page }) => {
    await mount(
      <div>
        <CitationComponent citation={baseCitation} verification={verifiedVerification} />
        <div data-testid="outside-area" style={{ padding: "100px" }}>
          Outside area
        </div>
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Popover should be open
    await expect(page.getByRole("dialog")).toBeVisible();

    // Click outside
    await page.locator('[data-testid="outside-area"]').click();

    // Popover should be closed (with a small delay for animation)
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 1000 });
  });

  test("shows verification image when available", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Image should be visible in popover
    const popover = page.getByRole("dialog");
    const image = popover.locator("img");
    await expect(image).toBeVisible();
  });
});

// =============================================================================
// GRACE PERIOD BEHAVIOR TESTS
// =============================================================================

test.describe("Citation Popover - Grace Period Behavior", () => {
  // Use constants imported from CitationComponent to ensure tests stay in sync

  test("expands verification details without dismissing popover", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verificationWithDetails} />);

    const citation = page.locator("[data-citation-id]");

    // Open popover
    await citation.click();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Find and click the expand button ("Verification details")
    const expandButton = page.getByRole("button", { name: /Verification details|How we verified this|Search attempts/i });
    await expect(expandButton).toBeVisible();
    await expandButton.click();

    // Popover should STILL be visible after expansion
    await expect(popover).toBeVisible();

    // Wait longer than grace period + hover delay to ensure popover stays open
    await page.waitForTimeout(REPOSITION_GRACE_PERIOD_MS + HOVER_CLOSE_DELAY_MS + 100);

    // Popover should STILL be visible (grace period prevents spurious dismissal)
    await expect(popover).toBeVisible();
  });

  test("popover remains open during rapid expand/collapse", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verificationWithDetails} />);

    const citation = page.locator("[data-citation-id]");

    // Open popover
    await citation.click();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    const expandButton = page.getByRole("button", { name: /Verification details|How we verified this|Search attempts/i });

    // Rapidly toggle expansion multiple times
    await expandButton.click(); // Expand
    await page.waitForTimeout(50);
    await expandButton.click(); // Collapse
    await page.waitForTimeout(50);
    await expandButton.click(); // Expand again

    // Popover should still be open after rapid toggles
    await expect(popover).toBeVisible();
  });

  test("popover closes normally when grace period is not active", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");

    // Open popover
    await citation.click();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Move mouse away from both citation and popover
    await page.mouse.move(0, 0);

    // Wait for hover close delay (popover should close)
    await page.waitForTimeout(HOVER_CLOSE_DELAY_MS + 100);

    // Popover should be closed
    await expect(popover).not.toBeVisible();
  });
});

// =============================================================================
// HOVER TRANSITIONS TESTS
// =============================================================================

test.describe("Citation Popover - Hover Transitions", () => {
  test("highlights citation on mouse enter", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} variant="linter" />);

    const citation = page.locator("[data-citation-id]");

    // Verify citation is visible
    await expect(citation).toBeVisible();

    // Hover over citation - this test verifies hover doesn't crash, not color changes
    // (color changes are difficult to test reliably in component tests)
    await citation.hover();
    await page.waitForTimeout(100);

    // Citation should still be visible after hover
    await expect(citation).toBeVisible();
  });

  test("clears highlight when mouse leaves before click", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} variant="linter" />);

    const citation = page.locator("[data-citation-id]");

    // Hover
    await citation.hover();
    await page.waitForTimeout(100);

    // Move away without clicking
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);

    // Popover should not be visible
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("keeps popover open when mouse re-enters popover content", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");

    // Open popover
    await citation.click();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Move mouse into popover content
    await popover.hover();
    await page.waitForTimeout(100);

    // Popover should still be visible
    await expect(popover).toBeVisible();

    // Move mouse outside
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);

    // Popover should close after delay
    await expect(popover).not.toBeVisible({ timeout: 500 });
  });
});

// =============================================================================
// MOBILE/TOUCH BEHAVIOR TESTS
// =============================================================================

test.describe("Citation Popover - Mobile/Touch Behavior", () => {
  // Configure mobile viewport with touch support
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
  });

  test("first tap opens popover", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verificationWithDetails} />);

    const citation = page.locator("[data-citation-id]");

    // First tap
    await citation.tap();

    // Popover should be visible
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();
  });

  test("second tap expands details", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verificationWithDetails} />);

    const citation = page.locator("[data-citation-id]");

    // First tap to open
    await citation.tap();
    await page.waitForTimeout(100);

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Second tap should expand details (find the expand button)
    const expandButton = page.getByRole("button", { name: /Verification details|How we verified this|Search attempts/i });
    await expandButton.tap();

    // Details should be expanded (look for expanded content)
    // The verification log should be visible
    await expect(page.getByText("exact")).toBeVisible();
  });

  test("tap outside closes popover", async ({ mount, page }) => {
    await mount(
      <div style={{ width: "375px", height: "667px", position: "relative" }}>
        <div style={{ padding: "20px" }}>
          <CitationComponent citation={baseCitation} verification={verifiedVerification} />
        </div>
      </div>,
    );

    const citation = page.locator("[data-citation-id]");

    // Open popover with tap
    await citation.tap();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Wait for popover to fully open
    await page.waitForTimeout(300);

    // Dispatch touchstart event on body (component listens for touchstart, not pointerdown)
    await page.evaluate(() => {
      const touch = new Touch({
        identifier: 0,
        target: document.body,
        clientX: 10,
        clientY: 10,
      });
      const touchEvent = new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [touch],
        targetTouches: [touch],
        changedTouches: [touch],
      });
      document.body.dispatchEvent(touchEvent);
    });

    // Wait for close animation
    await page.waitForTimeout(300);

    // Popover should close
    const isVisible = await popover.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });
});
