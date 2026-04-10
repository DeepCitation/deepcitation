import { expect, test } from "@playwright/experimental-ct-react";
import { DrawerInteractionHarness } from "../../../src/react/testing/DrawerInteractionHarness";
import type { CitationDrawerItem, SourceCitationGroup } from "../../../src/react/CitationDrawer.types";
import type { Citation } from "../../../src/types/citation";
import type { PageImage, Verification } from "../../../src/types/verification";

// =============================================================================
// FIXTURES
// =============================================================================

const testImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";

const attachmentId = "att-title-indicator-tests";

function makeCitation(overrides: Partial<Citation>): Citation {
  return {
    type: "document",
    citationNumber: 1,
    sourceMatch: "test anchor",
    sourceContext: "The document states test anchor in context.",
    lineIds: [1],
    ...overrides,
  };
}

function makeVerification(page: number): Verification {
  return {
    status: "found",
    attachmentId,
    document: {
      verifiedPageNumber: page,
      // sourceContextDeepItem is required for citationsOnActivePage to include this item
      sourceContextDeepItem: { x: 100, y: 200, width: 300, height: 20, text: "test anchor" },
    },
    evidence: { src: testImage, dimensions: { width: 800, height: 400 } },
  };
}

function makeItem(key: string, page: number, anchor: string): CitationDrawerItem {
  return {
    citationKey: key,
    citation: makeCitation({ pageNumber: page, sourceMatch: anchor }),
    verification: makeVerification(page),
  };
}

function makePageImages(pages: number[]): PageImage[] {
  return pages.map(pageNumber => ({
    pageNumber,
    imageUrl: testImage,
    dimensions: { width: 800, height: 1000 },
  }));
}

/** Single group with a long source name and two citations on different pages. */
function makeLongTitleGroups(): SourceCitationGroup[] {
  return [
    {
      sourceName: "SAFE_Document_Entry_with_Investor_Terms_and_Conditions_Final_v2.docx",
      citations: [
        makeItem("cite-a", 1, "Junior to payment"),
        makeItem("cite-b", 2, "Liquidity Event"),
      ],
    },
  ];
}

/** Two citations on the same page — ensures citationsOnActivePage has multiple entries. */
function makeSamePageGroups(): SourceCitationGroup[] {
  return [
    {
      sourceName: "Source Document",
      citations: [
        makeItem("cite-x", 1, "first anchor"),
        makeItem("cite-y", 1, "second anchor"),
        makeItem("cite-z", 1, "third anchor"),
      ],
    },
  ];
}

// =============================================================================
// 1. TITLE TRUNCATION
// =============================================================================

test.describe("Drawer - Title Not Truncated", () => {
  test("long source name renders without truncation when drawer is wide", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });

    await mount(
      <DrawerInteractionHarness
        groups={makeLongTitleGroups()}
        pageImagesByAttachmentId={{ [attachmentId]: makePageImages([1, 2]) }}
      />,
    );

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const heading = dialog.locator("h2").first();
    await expect(heading).toBeVisible();

    // scrollWidth > clientWidth means text is overflowing (truncated via overflow:hidden)
    const isTruncated = await heading.evaluate(el => el.scrollWidth > el.clientWidth);
    expect(isTruncated).toBe(false);
  });

  test("title h2 has no truncate class", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeLongTitleGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const heading = dialog.locator("h2").first();
    await expect(heading).not.toHaveClass(/truncate/);
  });
});

// =============================================================================
// 2. INDICATOR BUTTONS IN HEADER TITLE ROW
// =============================================================================

test.describe("Drawer - Inline Indicators in Header", () => {
  test("indicator buttons do not appear before a page image is open", async ({ mount, page }) => {
    await mount(
      <DrawerInteractionHarness
        groups={makeSamePageGroups()}
        pageImagesByAttachmentId={{ [attachmentId]: makePageImages([1]) }}
      />,
    );

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await expect(dialog.locator('[data-testid="drawer-header-indicators"]')).not.toBeAttached();
  });

  test("indicator buttons appear in header after opening page image", async ({ mount, page }) => {
    await mount(
      <DrawerInteractionHarness
        groups={makeSamePageGroups()}
        pageImagesByAttachmentId={{ [attachmentId]: makePageImages([1]) }}
      />,
    );

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Open page image via page pill
    await dialog.getByLabel(/expand to full page 1/i).click();
    await expect(dialog.locator("[data-dc-inline-expanded]")).toBeVisible({ timeout: 3000 });

    // Indicator container should now be visible in the header
    const indicators = dialog.locator('[data-testid="drawer-header-indicators"]');
    await expect(indicators).toBeVisible({ timeout: 2000 });

    // Should have 3 buttons (one per citation on the active page)
    await expect(indicators.locator("button")).toHaveCount(3);
  });

  test("indicator buttons are left-aligned after the title (same row, to the right)", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });

    await mount(
      <DrawerInteractionHarness
        groups={makeSamePageGroups()}
        pageImagesByAttachmentId={{ [attachmentId]: makePageImages([1]) }}
      />,
    );

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Open the page image
    await dialog.getByLabel(/expand to full page 1/i).click();
    await expect(dialog.locator("[data-dc-inline-expanded]")).toBeVisible({ timeout: 3000 });

    const heading = dialog.locator("h2").first();
    const indicators = dialog.locator('[data-testid="drawer-header-indicators"]');

    const titleBox = await heading.boundingBox();
    const indicatorsBox = await indicators.boundingBox();

    expect(titleBox).not.toBeNull();
    expect(indicatorsBox).not.toBeNull();

    if (titleBox && indicatorsBox) {
      // Indicators start to the right of the title
      expect(indicatorsBox.x).toBeGreaterThan(titleBox.x + titleBox.width - 4); // -4px tolerance

      // Both are on the same row — vertical centers within 8px of each other
      const titleCenterY = titleBox.y + titleBox.height / 2;
      const indicatorsCenterY = indicatorsBox.y + indicatorsBox.height / 2;
      expect(Math.abs(titleCenterY - indicatorsCenterY)).toBeLessThan(8);
    }
  });

  test("indicator buttons are NOT below the inline image", async ({ mount, page }) => {
    await mount(
      <DrawerInteractionHarness
        groups={makeSamePageGroups()}
        pageImagesByAttachmentId={{ [attachmentId]: makePageImages([1]) }}
      />,
    );

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Open the page image
    await dialog.getByLabel(/expand to full page 1/i).click();
    await expect(dialog.locator("[data-dc-inline-expanded]")).toBeVisible({ timeout: 3000 });

    const inlineImage = dialog.locator("[data-dc-inline-expanded]");
    const indicators = dialog.locator('[data-testid="drawer-header-indicators"]');

    const imageBox = await inlineImage.boundingBox();
    const indicatorsBox = await indicators.boundingBox();

    expect(imageBox).not.toBeNull();
    expect(indicatorsBox).not.toBeNull();

    if (imageBox && indicatorsBox) {
      // Indicators must be ABOVE the inline image (in the title bar), not below it
      expect(indicatorsBox.y).toBeLessThan(imageBox.y);
    }
  });

  test("clicking an indicator button toggles its active ring", async ({ mount, page }) => {
    await mount(
      <DrawerInteractionHarness
        groups={makeSamePageGroups()}
        pageImagesByAttachmentId={{ [attachmentId]: makePageImages([1]) }}
      />,
    );

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Open page image
    await dialog.getByLabel(/expand to full page 1/i).click();
    await expect(dialog.locator("[data-dc-inline-expanded]")).toBeVisible({ timeout: 3000 });

    const firstIndicator = dialog.locator('[data-testid="drawer-header-indicators"] button').first();

    // Initially not active (aria-pressed=false)
    await expect(firstIndicator).toHaveAttribute("aria-pressed", "false");

    // Click to activate
    await firstIndicator.click();
    await expect(firstIndicator).toHaveAttribute("aria-pressed", "true");

    // Click again to deactivate
    await firstIndicator.click();
    await expect(firstIndicator).toHaveAttribute("aria-pressed", "false");
  });
});
