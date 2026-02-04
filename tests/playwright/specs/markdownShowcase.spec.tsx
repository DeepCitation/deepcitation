import { test, expect } from "@playwright/experimental-ct-react";

// Import showcase components separately to avoid Playwright CT bundling conflict
import { MarkdownShowcase } from "../../../src/markdown/testing/MarkdownShowcase";
import { INDICATOR_STYLES } from "../../../src/markdown/testing/MarkdownShowcase";
import { MARKDOWN_VARIANTS } from "../../../src/markdown/testing/MarkdownShowcase";
import { STATUS_TYPES } from "../../../src/markdown/testing/MarkdownShowcase";

// =============================================================================
// TESTS - Markdown Showcase
// =============================================================================

test.describe("Markdown Showcase - Desktop", () => {
  test("renders complete showcase", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const showcase = page.locator('[data-testid="markdown-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("indicator styles matrix renders all styles and states", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const section = page.locator('[data-testid="indicator-styles-section"]');
    await expect(section).toBeVisible();

    // Check all indicator style rows exist
    for (const style of INDICATOR_STYLES) {
      const row = page.locator(`[data-indicator-row="${style}"]`);
      await expect(row).toBeVisible();

      // Each row should have 4 indicators (verified, partial, not found, pending)
      const indicators = row.locator("[data-indicator]");
      await expect(indicators).toHaveCount(4);
    }
  });

  test("markdown variants section renders all variants", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const section = page.locator('[data-testid="markdown-variants-section"]');
    await expect(section).toBeVisible();

    for (const variant of MARKDOWN_VARIANTS) {
      const variantCard = page.locator(`[data-variant="${variant}"]`);
      await expect(variantCard).toBeVisible();
    }
  });

  test("reference section shows both standard and footnote styles", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const section = page.locator('[data-testid="reference-section"]');
    await expect(section).toBeVisible();

    const standardRef = page.locator('[data-reference-type="standard"]');
    await expect(standardRef).toBeVisible();

    const footnoteRef = page.locator('[data-reference-type="footnote"]');
    await expect(footnoteRef).toBeVisible();
  });

  test("humanized line position section shows all positions", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const section = page.locator('[data-testid="line-position-section"]');
    await expect(section).toBeVisible();

    // Check all position types are shown
    for (const position of ["start", "early", "middle", "late", "end"]) {
      const positionEl = page.locator(`[data-line-position="${position}"]`);
      await expect(positionEl).toBeVisible();
    }
  });

  test("complete document section shows before/after", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const section = page.locator('[data-testid="complete-document-section"]');
    await expect(section).toBeVisible();

    // Should have both input and output code blocks
    const codeBlocks = section.locator("pre");
    await expect(codeBlocks).toHaveCount(2);
  });

  test("URL citations section renders", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const section = page.locator('[data-testid="url-citations-section"]');
    await expect(section).toBeVisible();
  });

  test("visual snapshot - full showcase", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const showcase = page.locator('[data-testid="markdown-showcase"]');
    await expect(showcase).toBeVisible();

    await expect(showcase).toHaveScreenshot("markdown-showcase.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Dark Mode
// =============================================================================

test.describe("Markdown Showcase - Desktop Dark Mode", () => {
  test.use({ colorScheme: "dark" });

  test("renders complete showcase in dark mode", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const showcase = page.locator('[data-testid="markdown-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("indicator styles render correctly in dark mode", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    for (const style of INDICATOR_STYLES) {
      const row = page.locator(`[data-indicator-row="${style}"]`);
      await expect(row).toBeVisible();
    }
  });

  test("visual snapshot - dark mode showcase", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const showcase = page.locator('[data-testid="markdown-showcase"]');
    await expect(showcase).toBeVisible();

    await expect(showcase).toHaveScreenshot("markdown-showcase-dark.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Mobile
// =============================================================================

test.describe("Markdown Showcase - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("renders on mobile viewport without overflow", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const showcase = page.locator('[data-testid="markdown-showcase"]');
    await expect(showcase).toBeVisible();

    // Check no horizontal scroll
    const box = await showcase.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  test("visual snapshot - mobile showcase", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const showcase = page.locator('[data-testid="markdown-showcase"]');
    await expect(showcase).toBeVisible();

    await expect(showcase).toHaveScreenshot("markdown-showcase-mobile.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Tablet
// =============================================================================

test.describe("Markdown Showcase - Tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("visual snapshot - tablet showcase", async ({ mount, page }) => {
    await mount(<MarkdownShowcase />);

    const showcase = page.locator('[data-testid="markdown-showcase"]');
    await expect(showcase).toBeVisible();

    await expect(showcase).toHaveScreenshot("markdown-showcase-tablet.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    });
  });
});
