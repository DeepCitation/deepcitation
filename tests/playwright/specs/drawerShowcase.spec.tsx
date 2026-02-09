import { expect, test } from "@playwright/experimental-ct-react";
import { CitationDrawerShowcase } from "../../../src/react/testing/ShowcaseComponents";

// =============================================================================
// TESTS - Desktop Drawer Showcase
// =============================================================================

test.describe("Drawer Showcase - Desktop", () => {
  test("renders complete drawer showcase", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const showcase = page.locator('[data-testid="drawer-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("all trigger states render", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    for (const state of ["all-verified", "mixed", "all-pending", "single-source", "many-sources"]) {
      const triggerState = page.locator(`[data-drawer-trigger-state="${state}"]`);
      await expect(triggerState).toBeVisible();
    }
  });

  test("trigger bar renders with correct elements", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    // Each trigger should have a data-testid
    const triggers = page.locator('[data-testid="citation-drawer-trigger"]');
    const count = await triggers.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("hover progressive disclosure section renders", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const hoverSection = page.locator('[data-testid="drawer-trigger-hover-section"]');
    await expect(hoverSection).toBeVisible();
  });

  test("full drawer static preview renders grouped content", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const drawerSection = page.locator('[data-testid="drawer-trigger-full-drawer-section"]');
    await expect(drawerSection).toBeVisible();

    // Should show "Citations" header
    await expect(drawerSection.locator("text=Citations").first()).toBeVisible();
  });

  test("interactive example renders", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const interactiveSection = page.locator('[data-testid="drawer-trigger-interactive-section"]');
    await expect(interactiveSection).toBeVisible();

    // Trigger should be present
    const trigger = interactiveSection.locator('[data-interactive-drawer="trigger"]');
    await expect(trigger).toBeVisible();
  });

  test("visual snapshot - drawer showcase", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const showcase = page.locator('[data-testid="drawer-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for triggers to render
    await expect(page.locator('[data-testid="citation-drawer-trigger"]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot("drawer-showcase.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Mobile Drawer Showcase
// =============================================================================

test.describe("Drawer Showcase - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("trigger renders without overflow on mobile", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const triggers = page.locator('[data-testid="citation-drawer-trigger"]');
    const count = await triggers.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Check no horizontal overflow
    for (let i = 0; i < Math.min(count, 3); i++) {
      const box = await triggers.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(375);
    }
  });

  test("visual snapshot - drawer showcase mobile", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const showcase = page.locator('[data-testid="drawer-showcase"]');
    await expect(showcase).toBeVisible();

    await expect(page.locator('[data-testid="citation-drawer-trigger"]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot("drawer-showcase-mobile.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Tablet Drawer Showcase
// =============================================================================

test.describe("Drawer Showcase - Tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("visual snapshot - drawer showcase tablet", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const showcase = page.locator('[data-testid="drawer-showcase"]');
    await expect(showcase).toBeVisible();

    await expect(page.locator('[data-testid="citation-drawer-trigger"]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot("drawer-showcase-tablet.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Dark Mode
// =============================================================================

test.describe("Drawer Showcase - Desktop Dark Mode", () => {
  test.use({ colorScheme: "dark" });

  test("renders complete showcase in dark mode", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const showcase = page.locator('[data-testid="drawer-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("visual snapshot - drawer showcase dark mode", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const showcase = page.locator('[data-testid="drawer-showcase"]');
    await expect(showcase).toBeVisible();

    await expect(page.locator('[data-testid="citation-drawer-trigger"]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot("drawer-showcase-dark.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

test.describe("Drawer Showcase - Mobile Dark Mode", () => {
  test.use({
    viewport: { width: 375, height: 667 },
    colorScheme: "dark",
  });

  test("visual snapshot - drawer showcase mobile dark mode", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    const showcase = page.locator('[data-testid="drawer-showcase"]');
    await expect(showcase).toBeVisible();

    await expect(page.locator('[data-testid="citation-drawer-trigger"]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot("drawer-showcase-mobile-dark.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Interactive Drawer Behavior
// =============================================================================

test.describe("Drawer Showcase - Interactive", () => {
  test("clicking trigger opens drawer dialog", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    // Find the interactive trigger
    const trigger = page.locator('[data-interactive-drawer="trigger"] [data-testid="citation-drawer-trigger"]');
    await expect(trigger).toBeVisible();

    // Click to open
    await trigger.click();

    // Drawer dialog should be visible
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test("drawer closes on escape key", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    // Open drawer
    const trigger = page.locator('[data-interactive-drawer="trigger"] [data-testid="citation-drawer-trigger"]');
    await trigger.click();

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Press escape
    await page.keyboard.press("Escape");

    // Dialog should be gone
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test("visual snapshot - hover spreads status icons", async ({ mount, page }) => {
    await mount(<CitationDrawerShowcase />);

    // Find a trigger with multiple sources
    const trigger = page.locator('[data-drawer-trigger-state="mixed"] [data-testid="citation-drawer-trigger"]');
    await expect(trigger).toBeVisible();

    // Get initial icon positions
    const iconGroup = trigger.locator("[role='group']");
    await expect(iconGroup).toBeVisible();

    // Hover the trigger and wait for spread animation to complete
    await trigger.hover();
    // Icons transition from marginLeft:-8 to marginLeft:6 over 300ms
    await page.waitForTimeout(350);

    // Icons should now be spread (margin-left changes from -8 to 6)
    // Verify visually via snapshot
    await expect(trigger).toHaveScreenshot("trigger-hover-spread.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});
