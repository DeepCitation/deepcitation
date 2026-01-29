import { test, expect } from "@playwright/experimental-ct-react";

// Import showcase components separately to avoid Playwright CT bundling conflict
import { VisualShowcase } from "../../react/testing/ShowcaseComponents";
import { MobileShowcase } from "../../react/testing/ShowcaseComponents";
import { allUrlStatuses } from "../../react/testing/ShowcaseComponents";

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

    for (const variant of ["chip", "inline", "bracket"]) {
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
