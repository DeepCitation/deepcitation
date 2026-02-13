import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { RenderTargetShowcase } from "../../../src/rendering/testing/RenderTargetShowcase";
import {
  GITHUB_VARIANTS,
  HTML_VARIANTS,
  SLACK_VARIANTS,
  TERMINAL_VARIANTS,
} from "../../../src/rendering/testing/RenderTargetShowcase.constants";

/** Scale down showcase elements before snapshot to reduce pixel count */
async function scaleDownForSnapshot(page: Page, testId: string) {
  await page.addStyleTag({
    content: `[data-testid="${testId}"] { transform: scale(0.5); transform-origin: top left; }`,
  });
}

// =============================================================================
// TESTS - Desktop
// =============================================================================

test.describe("Render Target Showcase - Desktop", () => {
  test("renders complete showcase", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const showcase = page.locator('[data-testid="render-target-showcase"]');
    await expect(showcase).toBeVisible();
  });

  // --- Slack ---

  test("Slack section renders all variants", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const section = page.locator('[data-testid="slack-section"]');
    await expect(section).toBeVisible();

    for (const variant of SLACK_VARIANTS) {
      const variantRow = page.locator(`[data-slack-variant="${variant}"]`);
      await expect(variantRow).toBeVisible();
    }
  });

  test("Slack sources section renders", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    await expect(page.locator('[data-testid="slack-sources-section"]')).toBeVisible();
  });

  test("Slack complete message renders", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    await expect(page.locator('[data-testid="slack-complete-section"]')).toBeVisible();
  });

  // --- GitHub ---

  test("GitHub section renders all variants", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const section = page.locator('[data-testid="github-section"]');
    await expect(section).toBeVisible();

    for (const variant of GITHUB_VARIANTS) {
      const variantRow = page.locator(`[data-github-variant="${variant}"]`);
      await expect(variantRow).toBeVisible();
    }
  });

  test("GitHub sources table format renders", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    await expect(page.locator('[data-testid="github-sources-table-section"]')).toBeVisible();
  });

  test("GitHub sources detailed format renders", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    await expect(page.locator('[data-testid="github-sources-detailed-section"]')).toBeVisible();
  });

  test("GitHub complete PR comment renders", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    await expect(page.locator('[data-testid="github-complete-section"]')).toBeVisible();
  });

  // --- HTML ---

  test("HTML section renders all variants", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    const section = page.locator('[data-testid="html-section"]');
    await expect(section).toBeVisible();

    for (const variant of HTML_VARIANTS) {
      const variantRow = page.locator(`[data-html-variant="${variant}"]`);
      await expect(variantRow).toBeVisible();
    }
  });

  test("HTML tooltip section renders", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    await expect(page.locator('[data-testid="html-tooltip-section"]')).toBeVisible();
  });

  test("HTML complete section renders", async ({ mount, page }) => {
    await mount(<RenderTargetShowcase />);

    await expect(page.locator('[data-testid="html-complete-section"]')).toBeVisible();
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
