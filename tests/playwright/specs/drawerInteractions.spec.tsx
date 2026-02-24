import { expect, test } from "@playwright/experimental-ct-react";
import type { CitationDrawerItem, SourceCitationGroup } from "../../../src/react/CitationDrawer.types";
import { DrawerInteractionHarness } from "../../../src/react/testing/DrawerInteractionHarness";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Generate a valid test PNG at the given dimensions.
 * Runs in the browser context (canvas API).
 */
const makeTestImage = (width: number, height: number, color = "#cccccc"): string => {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL("image/png");
    }
  }
  // Fallback: valid 1×1 gray PNG
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
};

// Full-page image — large so it's clearly bigger than the keyhole strip
const testProofImage = makeTestImage(800, 1000, "#e0e0e0");
// Evidence crop — tall enough that the keyhole can't display it fully,
// ensuring canExpand=true and aria-label="Click to expand verification image"
const testEvidenceImage = makeTestImage(800, 400, "#b0d0ff");

function makeCitation(overrides: Partial<Citation> & { pageNumber: number }): Citation {
  return {
    type: "document",
    citationNumber: 1,
    anchorText: "test anchor text",
    fullPhrase: "The document states test anchor text in the context of verification.",
    lineIds: [10, 11],
    ...overrides,
  };
}

function makeVerification(page: number, status: "found" | "not_found" = "found"): Verification {
  return {
    status,
    document: {
      verifiedPageNumber: page,
      verificationImageSrc: testEvidenceImage,
      verificationImageDimensions: { width: 800, height: 400 },
    },
    pages: [{ pageNumber: page, source: testProofImage }],
  };
}

function makeItem(page: number, key: string, phrase: string, anchor: string): CitationDrawerItem {
  return {
    citationKey: key,
    citation: makeCitation({ pageNumber: page, fullPhrase: phrase, anchorText: anchor, citationNumber: 1 }),
    verification: makeVerification(page),
  };
}

/** Two pages with one citation each — simplest multi-page fixture for page pill tests. */
function makeTwoPageGroups(): SourceCitationGroup[] {
  return [
    {
      sourceName: "Annual Report 2024",
      citations: [
        makeItem(3, "cite-page3", "Revenue grew 25% year-over-year in the fourth quarter.", "25% year-over-year"),
        makeItem(7, "cite-page7", "Operating expenses decreased by 12% compared to prior year.", "decreased by 12%"),
      ],
      additionalCount: 1,
    },
  ];
}

/** Three items across two pages — tests escape cascade with multiple accordion/inline states. */
function makeEscapeCascadeGroups(): SourceCitationGroup[] {
  return [
    {
      sourceName: "Financial Report",
      citations: [
        makeItem(1, "cite-esc-a", "Net income was $2.3 billion in Q4 2024.", "$2.3 billion"),
        makeItem(1, "cite-esc-b", "Gross margin expanded to 42.1% from 39.8%.", "42.1%"),
        makeItem(5, "cite-esc-c", "Free cash flow reached $1.8 billion for the full year.", "$1.8 billion"),
      ],
      additionalCount: 2,
    },
  ];
}

// =============================================================================
// HELPERS
// =============================================================================

/** Get the item wrapper div (contains summary row + expanded content). */
function getItemWrapper(dialog: ReturnType<typeof import("@playwright/test").Page.prototype.locator>, key: string) {
  return dialog.locator(`[data-dc-item='${key}']`);
}

/**
 * Expand an accordion item and open its InlineExpandedImage via page pill.
 * This is the reliable way to reach Level 3 in the drawer — the page pill
 * sets pendingInlineExpand which auto-opens the inline image.
 */
async function expandToLevel3ViaPagePill(
  dialog: ReturnType<typeof import("@playwright/test").Page.prototype.locator>,
  pageNumber: number,
  citationKey: string,
) {
  await dialog.getByLabel(new RegExp(`expand to full page ${pageNumber}`, "i")).click();
  const item = getItemWrapper(dialog, citationKey);
  await expect(item.locator("[data-dc-inline-expanded]")).toBeVisible({ timeout: 3000 });
  return item;
}

// =============================================================================
// 1. PAGE PILL HIGHLIGHTING
// =============================================================================

test.describe("Drawer - Page Pill Highlighting", () => {
  test("page pills render in header for multi-page citations", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeTwoPageGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Both page pills should be present (p.3 and p.7)
    await expect(dialog.getByLabel(/expand to full page 3/i)).toBeVisible();
    await expect(dialog.getByLabel(/expand to full page 7/i)).toBeVisible();
  });

  test("clicking a page pill activates it (blue + X icon)", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeTwoPageGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click page 3 pill
    await dialog.getByLabel(/expand to full page 3/i).click();

    // After click, the pill should switch to active state (close button with X)
    await expect(dialog.getByLabel(/close page 3 view/i)).toBeVisible({ timeout: 3000 });
  });

  test("clicking active page pill X deactivates it", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeTwoPageGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Activate page 3
    await dialog.getByLabel(/expand to full page 3/i).click();
    const activePill = dialog.getByLabel(/close page 3 view/i);
    await expect(activePill).toBeVisible({ timeout: 3000 });

    // Click X to deactivate
    await activePill.click();

    // Should revert to inactive state (expand button)
    await expect(dialog.getByLabel(/expand to full page 3/i)).toBeVisible({ timeout: 3000 });
  });

  test("activating one page pill shows the inline expanded image for that citation", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeTwoPageGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click page 7 pill
    await dialog.getByLabel(/expand to full page 7/i).click();

    // The inline expanded image should appear within the page-7 item
    const item = getItemWrapper(dialog, "cite-page7");
    await expect(item.locator("[data-dc-inline-expanded]")).toBeVisible({ timeout: 3000 });
  });

  test("page pill announces navigation for screen readers", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeTwoPageGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click page 7 pill
    await dialog.getByLabel(/expand to full page 7/i).click();

    // ARIA live region should announce navigation
    const announcement = page.locator("[role='status'][aria-live='polite']");
    await expect(announcement).toContainText("Navigated to page 7", { timeout: 3000 });
  });
});

// =============================================================================
// 2. EVIDENCE vs FULL-PAGE CLICK ROUTING
//
// In the drawer, the EvidenceTray wraps its content in a clickable div:
// - When `onImageClick` is set and image doesn't fit: tray click → evidence crop
// - When image fits: tray click shows "already full size" flash
// - Full-page image is accessed via page pill click (setPendingInlineExpand)
// =============================================================================

test.describe("Drawer - Evidence vs Full-Page Click Routing", () => {
  test("expanding a citation item shows EvidenceTray with keyhole", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeTwoPageGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click the first citation item to expand it
    await dialog.locator("[data-citation-key='cite-page3']").click();

    // Scope keyhole check to the expanded item wrapper
    const item = getItemWrapper(dialog, "cite-page3");
    await expect(item.locator("[data-dc-keyhole]")).toBeVisible({ timeout: 3000 });
  });

  test("page pill click opens full-page InlineExpandedImage directly", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeTwoPageGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click page 3 pill — bypasses the keyhole, goes straight to full-page image
    await dialog.getByLabel(/expand to full page 3/i).click();

    const item = getItemWrapper(dialog, "cite-page3");
    await expect(item.locator("[data-dc-inline-expanded]")).toBeVisible({ timeout: 3000 });

    // Page pill should be active (blue with X)
    await expect(dialog.getByLabel(/close page 3 view/i)).toBeVisible();
  });

  test("clicking InlineExpandedImage collapses back to EvidenceTray", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeTwoPageGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Open inline image via page pill (reliable way to reach Level 3)
    const item = await expandToLevel3ViaPagePill(dialog, 3, "cite-page3");

    const inlineExpanded = item.locator("[data-dc-inline-expanded]");
    await expect(inlineExpanded).toBeVisible({ timeout: 3000 });

    // Click the expanded image to collapse
    await inlineExpanded.click();

    // Should return to EvidenceTray (keyhole visible, inline-expanded gone)
    await expect(inlineExpanded).not.toBeVisible({ timeout: 3000 });
    await expect(item.locator("[data-dc-keyhole]")).toBeVisible({ timeout: 3000 });
  });
});

// =============================================================================
// 3. ESCAPE CASCADE BEHAVIOR
//
// The drawer has a 3-level navigation stack:
// Level 1: Drawer open, all items collapsed
// Level 2: An accordion item is expanded (shows EvidenceTray)
// Level 3: An InlineExpandedImage is open inside an expanded item
// Each Escape press pops one level.
// =============================================================================

test.describe("Drawer - Escape Cascade", () => {
  test("Escape from Level 1 (no expansion) closes the drawer", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeEscapeCascadeGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Press Escape — drawer should close
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test("Escape from Level 2 (expanded accordion) collapses accordion, keeps drawer open", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeEscapeCascadeGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Expand a citation item (Level 1 → Level 2)
    const firstItem = dialog.locator("[data-citation-key='cite-esc-a']");
    await firstItem.click();
    await expect(firstItem).toHaveAttribute("aria-expanded", "true", { timeout: 3000 });

    // Press Escape — should collapse accordion (Level 2 → Level 1), drawer stays open
    await page.keyboard.press("Escape");

    // Accordion item should be collapsed, drawer still open
    await expect(firstItem).toHaveAttribute("aria-expanded", "false", { timeout: 3000 });
    await expect(dialog).toBeVisible();
  });

  test("Escape from Level 3 (inline expanded image) collapses image, keeps accordion expanded", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeEscapeCascadeGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Level 1 → Level 3 via page pill (also sets accordion to expanded)
    const item = await expandToLevel3ViaPagePill(dialog, 1, "cite-esc-a");

    // Press Escape — should collapse inline image (Level 3 → Level 2)
    await page.keyboard.press("Escape");

    // Inline image should be gone
    await expect(item.locator("[data-dc-inline-expanded]")).not.toBeVisible({ timeout: 3000 });

    // Drawer and accordion still open
    const firstItem = dialog.locator("[data-citation-key='cite-esc-a']");
    await expect(dialog).toBeVisible();
    await expect(firstItem).toHaveAttribute("aria-expanded", "true");
  });

  test("full three-level escape cascade: image → accordion → drawer", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeEscapeCascadeGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Level 1 → Level 3 via page pill
    const item = await expandToLevel3ViaPagePill(dialog, 1, "cite-esc-a");
    const firstItem = dialog.locator("[data-citation-key='cite-esc-a']");

    // Escape #1: Level 3 → 2 (close inline image)
    await page.keyboard.press("Escape");
    await expect(item.locator("[data-dc-inline-expanded]")).not.toBeVisible({ timeout: 3000 });
    await expect(dialog).toBeVisible();
    await expect(firstItem).toHaveAttribute("aria-expanded", "true");

    // Escape #2: Level 2 → 1 (collapse accordion)
    await page.keyboard.press("Escape");
    await expect(firstItem).toHaveAttribute("aria-expanded", "false", { timeout: 3000 });
    await expect(dialog).toBeVisible();

    // Escape #3: Level 1 → closed (close drawer)
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test("page pill click triggers Level 3 directly, Escape cascades back", async ({ mount, page }) => {
    await mount(<DrawerInteractionHarness groups={makeEscapeCascadeGroups()} />);

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click page pill → Level 3 directly
    const item = await expandToLevel3ViaPagePill(dialog, 1, "cite-esc-a");
    const inlineExpanded = item.locator("[data-dc-inline-expanded]");

    // Escape #1: Level 3 → 2
    await page.keyboard.press("Escape");
    await expect(inlineExpanded).not.toBeVisible({ timeout: 3000 });
    await expect(dialog).toBeVisible();

    // Escape #2: Level 2 → 1
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    // Escape #3: Level 1 → closed
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });
});
