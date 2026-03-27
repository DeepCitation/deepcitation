import { expect, test } from "@playwright/experimental-ct-react";
import { RenderTargetShowcase } from "../../../src/rendering/testing/RenderTargetShowcase";
import {
  TERMINAL_VARIANTS,
} from "../../../src/rendering/testing/RenderTargetShowcase.constants";
import { scaleDownForSnapshot } from "../snapshotHelpers";

// =============================================================================
// TESTS - Desktop
// =============================================================================

test.describe("Render Target Showcase - Desktop", () => {
  test("renders complete showcase", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const showcase = page.locator('[data-testid="render-target-showcase"]');
    await expect(showcase).toBeVisible();
  });

  // --- Terminal ---

  test("Terminal section renders all variants", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const section = page.locator('[data-testid="terminal-section"]');
    await expect(section).toBeVisible();

    for (const variant of TERMINAL_VARIANTS) {
      const variantRow = page.locator(`[data-terminal-variant="${variant}"]`);
      await expect(variantRow).toBeVisible();
    }
  });

  test("Terminal ANSI colors section renders all statuses", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const section = page.locator('[data-testid="terminal-colors-section"]');
    await expect(section).toBeVisible();

    for (const statusKey of ["verified", "partial", "not-found", "pending"]) {
      const statusEl = page.locator(`[data-testid="terminal-colors-section"] [data-terminal-status="${statusKey}"]`);
      await expect(statusEl).toBeVisible();
    }
  });

  test("Terminal sources section renders", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    await expect(page.locator('[data-testid="terminal-sources-section"]')).toBeVisible();
  });

  test("Terminal complete output renders", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    await expect(page.locator('[data-testid="terminal-complete-section"]')).toBeVisible();
  });

  // --- Visual snapshot ---

  test("visual snapshot - full showcase", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const showcase = page.locator('[data-testid="render-target-showcase"]');
    await expect(showcase).toBeVisible();

    await scaleDownForSnapshot(page, "render-target-showcase");

    await expect(showcase).toHaveScreenshot("render-target-showcase.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Dark Mode
// =============================================================================

test.describe("Render Target Showcase - Desktop Dark Mode", () => {
  test.use({ colorScheme: "dark" });

  test("renders complete showcase in dark mode", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const showcase = page.locator('[data-testid="render-target-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("visual snapshot - dark mode showcase", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const showcase = page.locator('[data-testid="render-target-showcase"]');
    await expect(showcase).toBeVisible();

    await scaleDownForSnapshot(page, "render-target-showcase");

    await expect(showcase).toHaveScreenshot("render-target-showcase-dark.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Mobile
// =============================================================================

test.describe("Render Target Showcase - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("renders on mobile viewport without overflow", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const showcase = page.locator('[data-testid="render-target-showcase"]');
    await expect(showcase).toBeVisible();

    const box = await showcase.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  test("visual snapshot - mobile showcase", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const showcase = page.locator('[data-testid="render-target-showcase"]');
    await expect(showcase).toBeVisible();

    await scaleDownForSnapshot(page, "render-target-showcase");

    await expect(showcase).toHaveScreenshot("render-target-showcase-mobile.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Tablet
// =============================================================================

test.describe("Render Target Showcase - Tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("visual snapshot - tablet showcase", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const showcase = page.locator('[data-testid="render-target-showcase"]');
    await expect(showcase).toBeVisible();

    await scaleDownForSnapshot(page, "render-target-showcase");

    await expect(showcase).toHaveScreenshot("render-target-showcase-tablet.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});
