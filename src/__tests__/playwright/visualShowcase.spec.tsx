import { test, expect } from "@playwright/experimental-ct-react";

// Import showcase components separately to avoid Playwright CT bundling conflict
import { VisualShowcase } from "../../react/testing/ShowcaseComponents";
import { MobileShowcase } from "../../react/testing/ShowcaseComponents";
import { PopoverShowcase } from "../../react/testing/ShowcaseComponents";
import { allUrlStatuses } from "../../react/testing/ShowcaseComponents";
import { allVerificationStatuses } from "../../react/testing/ShowcaseComponents";

// =============================================================================
// TESTS - Desktop Visual Showcase
// =============================================================================

test.describe("Visual Showcase - Desktop", () => {
  test("renders complete showcase", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    const showcase = page.locator('[data-testid="visual-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("all variant rows render correctly", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    for (const variant of ["brackets", "chip", "text", "superscript", "minimal", "linter"]) {
      const row = page.locator(`[data-variant-row="${variant}"]`);
      await expect(row).toBeVisible();
      // Each row should have 4 citations (verified, partial, not found, pending)
      const citations = row.locator('[data-citation-id]');
      await expect(citations).toHaveCount(4);
    }
  });

  test("content types section renders all types", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    for (const content of ["number", "anchorText", "indicator"]) {
      const section = page.locator(`[data-content-type="${content}"]`);
      await expect(section).toBeVisible();
    }
  });

  test("showIndicator prop section renders correctly", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    const section = page.locator('[data-testid="show-indicator-section"]');
    await expect(section).toBeVisible();

    // Check both on and off states
    for (const indicator of ["default", "false", "chip-on", "chip-off"]) {
      const indicatorSection = page.locator(`[data-show-indicator="${indicator}"]`);
      await expect(indicatorSection).toBeVisible();
    }
  });

  test("audit log section shows failed search attempts", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    const notFoundAudit = page.locator('[data-audit="not-found"]');
    await expect(notFoundAudit).toBeVisible();
    await expect(notFoundAudit).toContainText("Not Found");

    const partialAudit = page.locator('[data-audit="partial"]');
    await expect(partialAudit).toBeVisible();

    const lowTrustAudit = page.locator('[data-audit="low-trust"]');
    await expect(lowTrustAudit).toBeVisible();
  });

  test("URL section shows all status types", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    for (const { status } of allUrlStatuses) {
      const urlStatus = page.locator(`[data-url-status="${status}"]`);
      await expect(urlStatus).toBeVisible();
    }
  });

  test("URL variants section shows all variants", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    for (const variant of ["badge", "chip", "inline", "bracket"]) {
      const urlVariant = page.locator(`[data-url-variant="${variant}"]`);
      await expect(urlVariant).toBeVisible();
    }
  });

  test("visual snapshot - full showcase", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    // Wait for the showcase to be visible and stable
    const showcase = page.locator('[data-testid="visual-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for all citations to render
    await expect(page.locator('[data-citation-id]').first()).toBeVisible();

    // Take screenshot of the showcase element
    await expect(showcase).toHaveScreenshot('desktop-showcase.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1, // Allow small differences across platforms
    });
  });
});

// =============================================================================
// TESTS - Mobile Visual Showcase
// =============================================================================

test.describe("Visual Showcase - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test("renders mobile showcase", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    const showcase = page.locator('[data-testid="mobile-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("mobile variants render without overflow", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    for (const variant of ["brackets", "chip", "superscript", "minimal", "linter"]) {
      const variantEl = page.locator(`[data-mobile-variant="${variant}"]`);
      await expect(variantEl).toBeVisible();

      // Check no horizontal overflow
      const box = await variantEl.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(375);
    }
  });

  test("URL citations truncate properly on mobile", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    for (const status of ["verified", "blocked_login", "error_not_found"]) {
      const urlEl = page.locator(`[data-mobile-url="${status}"]`);
      await expect(urlEl).toBeVisible();

      const box = await urlEl.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(375);
    }
  });

  test("visual snapshot - mobile showcase", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    // Wait for the mobile showcase to be visible and stable
    const showcase = page.locator('[data-testid="mobile-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for citations to render
    await expect(page.locator('[data-citation-id]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot('mobile-showcase.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Tablet Visual Showcase
// =============================================================================

test.describe("Visual Showcase - Tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } }); // iPad

  test("visual snapshot - tablet showcase", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    // Wait for the showcase to be visible and stable
    const showcase = page.locator('[data-testid="visual-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for citations to render
    await expect(page.locator('[data-citation-id]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot('tablet-showcase.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Popover/Tooltip Showcase
// =============================================================================

test.describe("Popover Showcase - Desktop", () => {
  test("renders complete popover showcase", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const showcase = page.locator('[data-testid="popover-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("pending section shows loading states", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const pendingSection = page.locator('[data-testid="popover-pending-section"]');
    await expect(pendingSection).toBeVisible();

    // Check both pending state variations
    const pendingState = page.locator('[data-popover-state="pending"]');
    await expect(pendingState).toBeVisible();
    await expect(pendingState).toContainText("Searching...");

    const longPendingState = page.locator('[data-popover-state="loading-long"]');
    await expect(longPendingState).toBeVisible();
  });

  test("status headers section shows all verification statuses", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const headersSection = page.locator('[data-testid="popover-status-headers-section"]');
    await expect(headersSection).toBeVisible();

    // Check that all verification statuses are displayed
    for (const { status } of allVerificationStatuses) {
      const statusHeader = page.locator(`[data-status-header="${status}"]`);
      await expect(statusHeader).toBeVisible();
    }
  });

  test("combined headers section shows anchor text and quotes", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const combinedSection = page.locator('[data-testid="popover-combined-headers-section"]');
    await expect(combinedSection).toBeVisible();

    // Check all combined header variations
    for (const type of ["not-found", "partial", "first-word", "long-quote"]) {
      const combinedHeader = page.locator(`[data-combined-header="${type}"]`);
      await expect(combinedHeader).toBeVisible();
    }
  });

  test("quote box section shows different quote lengths", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const quoteSection = page.locator('[data-testid="popover-quotebox-section"]');
    await expect(quoteSection).toBeVisible();

    // Check all quote box variations
    for (const length of ["short", "medium", "long"]) {
      const quotebox = page.locator(`[data-quotebox="${length}"]`);
      await expect(quotebox).toBeVisible();
    }
  });

  test("verification log section shows all log states", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const logSection = page.locator('[data-testid="popover-verification-log-section"]');
    await expect(logSection).toBeVisible();

    // Check all verification log variations
    for (const type of ["not-found", "partial-page", "partial-line", "low-trust"]) {
      const verificationLog = page.locator(`[data-verification-log="${type}"]`);
      await expect(verificationLog).toBeVisible();
    }
  });

  test("expanded verification log shows timeline", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const expandedSection = page.locator('[data-testid="popover-verification-log-expanded-section"]');
    await expect(expandedSection).toBeVisible();

    const expandedLog = page.locator('[data-verification-log="expanded"]');
    await expect(expandedLog).toBeVisible();

    // The expanded log should show the timeline
    const timeline = expandedLog.locator('#verification-log-timeline');
    await expect(timeline).toBeVisible();
  });

  test("complete popover layouts show full compositions", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const layoutsSection = page.locator('[data-testid="popover-complete-layouts-section"]');
    await expect(layoutsSection).toBeVisible();

    // Check all complete popover variations
    for (const type of ["verified-with-image", "partial-with-image", "not-found-no-image", "text-only"]) {
      const completePopover = page.locator(`[data-complete-popover="${type}"]`);
      await expect(completePopover).toBeVisible();
    }
  });

  test("interactive popover section has hoverable citations", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const interactiveSection = page.locator('[data-testid="popover-interactive-section"]');
    await expect(interactiveSection).toBeVisible();

    // Check all interactive examples exist
    for (const type of ["verified", "partial", "not-found", "pending"]) {
      const interactivePopover = page.locator(`[data-interactive-popover="${type}"]`);
      await expect(interactivePopover).toBeVisible();
    }
  });

  test("visual snapshot - popover showcase", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    // Wait for the showcase to be visible and stable
    const showcase = page.locator('[data-testid="popover-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for animations to settle (spinners are present)
    await page.waitForTimeout(500);

    // Take screenshot of the popover showcase
    await expect(showcase).toHaveScreenshot('popover-showcase.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1,
    });
  });
});

test.describe("Popover Showcase - Interactive Hover", () => {
  test("hovering citation shows popover with verification details", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    // Find the verified interactive citation
    const verifiedCitation = page.locator('[data-interactive-popover="verified"] [data-citation-id]');
    await expect(verifiedCitation).toBeVisible();

    // Hover over the citation
    await verifiedCitation.hover();

    // Wait for popover to appear
    await page.waitForTimeout(200);

    // Check that a popover appeared (Radix renders via portal)
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await expect(popover).toBeVisible();
  });

  test("hovering not-found citation shows verification log", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    // Find the not-found interactive citation
    const notFoundCitation = page.locator('[data-interactive-popover="not-found"] [data-citation-id]');
    await expect(notFoundCitation).toBeVisible();

    // Hover over the citation
    await notFoundCitation.hover();

    // Wait for popover to appear
    await page.waitForTimeout(200);

    // Check that a popover appeared
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await expect(popover).toBeVisible();

    // The popover should contain "Citation Unverified" text
    await expect(popover).toContainText("Citation Unverified");
  });

  test("hovering pending citation shows loading state", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    // Find the pending interactive citation
    const pendingCitation = page.locator('[data-interactive-popover="pending"] [data-citation-id]');
    await expect(pendingCitation).toBeVisible();

    // Hover over the citation
    await pendingCitation.hover();

    // Wait for popover to appear
    await page.waitForTimeout(200);

    // Check that a popover appeared
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await expect(popover).toBeVisible();

    // The popover should contain "Searching..." text
    await expect(popover).toContainText("Searching...");
  });
});

// =============================================================================
// TESTS - Dark Mode Visual Showcases
// =============================================================================

test.describe("Visual Showcase - Desktop Dark Mode", () => {
  test.use({ colorScheme: 'dark' });

  test("renders complete showcase in dark mode", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    const showcase = page.locator('[data-testid="visual-showcase"]');
    await expect(showcase).toBeVisible();

    // Verify dark mode is applied (check for dark background class)
    await expect(showcase).toHaveClass(/dark:bg-gray-900/);
  });

  test("all variant rows render correctly in dark mode", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    for (const variant of ["brackets", "chip", "text", "superscript", "minimal", "linter"]) {
      const row = page.locator(`[data-variant-row="${variant}"]`);
      await expect(row).toBeVisible();
      // Each row should have 4 citations (verified, partial, not found, pending)
      const citations = row.locator('[data-citation-id]');
      await expect(citations).toHaveCount(4);
    }
  });

  test("visual snapshot - desktop showcase dark mode", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    // Wait for the showcase to be visible and stable
    const showcase = page.locator('[data-testid="visual-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for all citations to render
    await expect(page.locator('[data-citation-id]').first()).toBeVisible();

    // Take screenshot of the showcase element in dark mode
    await expect(showcase).toHaveScreenshot('desktop-showcase-dark.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1,
    });
  });
});

test.describe("Visual Showcase - Mobile Dark Mode", () => {
  test.use({
    viewport: { width: 375, height: 667 },
    colorScheme: 'dark',
  });

  test("renders mobile showcase in dark mode", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    const showcase = page.locator('[data-testid="mobile-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("mobile variants render without overflow in dark mode", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    for (const variant of ["brackets", "chip", "superscript", "minimal", "linter"]) {
      const variantEl = page.locator(`[data-mobile-variant="${variant}"]`);
      await expect(variantEl).toBeVisible();

      // Check no horizontal overflow
      const box = await variantEl.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(375);
    }
  });

  test("visual snapshot - mobile showcase dark mode", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    // Wait for the mobile showcase to be visible and stable
    const showcase = page.locator('[data-testid="mobile-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for citations to render
    await expect(page.locator('[data-citation-id]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot('mobile-showcase-dark.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1,
    });
  });
});

test.describe("Visual Showcase - Tablet Dark Mode", () => {
  test.use({
    viewport: { width: 768, height: 1024 },
    colorScheme: 'dark',
  });

  test("visual snapshot - tablet showcase dark mode", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    // Wait for the showcase to be visible and stable
    const showcase = page.locator('[data-testid="visual-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for citations to render
    await expect(page.locator('[data-citation-id]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot('tablet-showcase-dark.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1,
    });
  });
});

test.describe("Popover Showcase - Desktop Dark Mode", () => {
  test.use({ colorScheme: 'dark' });

  test("renders complete popover showcase in dark mode", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const showcase = page.locator('[data-testid="popover-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("status headers render correctly in dark mode", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const headersSection = page.locator('[data-testid="popover-status-headers-section"]');
    await expect(headersSection).toBeVisible();

    // Check that all verification statuses are displayed
    for (const { status } of allVerificationStatuses) {
      const statusHeader = page.locator(`[data-status-header="${status}"]`);
      await expect(statusHeader).toBeVisible();
    }
  });

  test("verification logs render correctly in dark mode", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const logSection = page.locator('[data-testid="popover-verification-log-section"]');
    await expect(logSection).toBeVisible();

    // Check all verification log variations
    for (const type of ["not-found", "partial-page", "partial-line", "low-trust"]) {
      const verificationLog = page.locator(`[data-verification-log="${type}"]`);
      await expect(verificationLog).toBeVisible();
    }
  });

  test("complete popover layouts render correctly in dark mode", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    const layoutsSection = page.locator('[data-testid="popover-complete-layouts-section"]');
    await expect(layoutsSection).toBeVisible();

    // Check all complete popover variations
    for (const type of ["verified-with-image", "partial-with-image", "not-found-no-image", "text-only"]) {
      const completePopover = page.locator(`[data-complete-popover="${type}"]`);
      await expect(completePopover).toBeVisible();
    }
  });

  test("visual snapshot - popover showcase dark mode", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    // Wait for the showcase to be visible and stable
    const showcase = page.locator('[data-testid="popover-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for animations to settle (spinners are present)
    await page.waitForTimeout(500);

    // Take screenshot of the popover showcase in dark mode
    await expect(showcase).toHaveScreenshot('popover-showcase-dark.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1,
    });
  });
});

test.describe("Popover Showcase - Interactive Hover Dark Mode", () => {
  test.use({ colorScheme: 'dark' });

  test("hovering citation shows popover in dark mode", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    // Find the verified interactive citation
    const verifiedCitation = page.locator('[data-interactive-popover="verified"] [data-citation-id]');
    await expect(verifiedCitation).toBeVisible();

    // Hover over the citation
    await verifiedCitation.hover();

    // Wait for popover to appear
    await page.waitForTimeout(200);

    // Check that a popover appeared (Radix renders via portal)
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await expect(popover).toBeVisible();
  });

  test("hovering not-found citation shows verification log in dark mode", async ({ mount, page }) => {
    await mount(<PopoverShowcase />);

    // Find the not-found interactive citation
    const notFoundCitation = page.locator('[data-interactive-popover="not-found"] [data-citation-id]');
    await expect(notFoundCitation).toBeVisible();

    // Hover over the citation
    await notFoundCitation.hover();

    // Wait for popover to appear
    await page.waitForTimeout(200);

    // Check that a popover appeared
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await expect(popover).toBeVisible();

    // The popover should contain "Citation Unverified" text
    await expect(popover).toContainText("Citation Unverified");
  });
});
