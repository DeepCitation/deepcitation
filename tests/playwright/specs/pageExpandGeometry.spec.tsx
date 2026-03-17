import { expect, test } from "@playwright/experimental-ct-react";
import { PageExpandGeometryCitation } from "./PageExpandGeometryCitation";

async function openSummaryPopover(page: import("@playwright/test").Page) {
  await page.locator("[data-citation-id]").click();
  const popover = page.locator("[data-dc-popover-wrapper]");
  await expect(popover).toBeVisible();
  return popover;
}

async function freezeSummaryToPageTransition(
  page: import("@playwright/test").Page,
  phase: "source" | "target",
  popover?: import("@playwright/test").Locator,
) {
  await page.evaluate(currentPhase => {
    document.documentElement.dataset.dcPageExpandDebugPhase = currentPhase;
  }, phase);
  const activePopover = popover ?? (await openSummaryPopover(page));
  const expandButton = activePopover.getByLabel(/Expand to full page/).first();
  await expect(expandButton).toBeVisible();
  await expandButton.click();
  const ghost = page.locator("[data-dc-page-expand-ghost]");
  await expect(ghost).toBeVisible();
  return { popover: activePopover, ghost };
}

test.describe("Page Expand Geometry Debug", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      delete document.documentElement.dataset.dcPageExpandDebugPhase;
    });
  });

  test("source phase starts from the visible summary keyhole box", async ({ mount, page }) => {
    await mount(<PageExpandGeometryCitation />);
    const popover = await openSummaryPopover(page);
    const source = popover.locator("[data-dc-page-expand-source]").filter({ visible: true }).first();
    const sourceBox = await source.boundingBox();
    expect(sourceBox).toBeTruthy();
    await page.evaluate(() => {
      delete document.documentElement.dataset.dcPageExpandDebugPhase;
    });

    const { ghost } = await freezeSummaryToPageTransition(page, "source", popover);
    const ghostBox = await ghost.boundingBox();
    expect(ghostBox).toBeTruthy();
    console.log("sourceBox", sourceBox, "ghostBox", ghostBox);

    expect(Math.abs(ghostBox!.x - sourceBox!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(ghostBox!.y - sourceBox!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(ghostBox!.width - sourceBox!.width)).toBeLessThanOrEqual(3);
    expect(Math.abs(ghostBox!.height - sourceBox!.height)).toBeLessThanOrEqual(2);
  });

  test("target phase lands near the settled expanded-page target and stays on-screen", async ({ mount, page }) => {
    await mount(<PageExpandGeometryCitation />);
    const { ghost } = await freezeSummaryToPageTransition(page, "target");
    const target = page.locator("[data-dc-page-expand-target][data-dc-page-expand-ready='true']").first();
    await expect(target).toBeVisible();

    const targetBox = await target.boundingBox();
    await expect
      .poll(
        async () => {
          const ghostBox = await ghost.boundingBox();
          if (!ghostBox || !targetBox) return Number.POSITIVE_INFINITY;
          return Math.max(
            Math.abs(ghostBox.x - targetBox.x),
            Math.abs(ghostBox.y - targetBox.y),
            Math.abs(ghostBox.width - targetBox.width),
            Math.abs(ghostBox.height - targetBox.height),
          );
        },
        { timeout: 1500 },
      )
      .toBeLessThanOrEqual(2);
    const ghostBox = await ghost.boundingBox();
    const viewport = page.viewportSize()!;
    expect(ghostBox).toBeTruthy();
    expect(targetBox).toBeTruthy();
    console.log("targetGhostBox", ghostBox, "targetBox", targetBox);

    expect(Math.abs(ghostBox!.x - targetBox!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(ghostBox!.y - targetBox!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(ghostBox!.width - targetBox!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(ghostBox!.height - targetBox!.height)).toBeLessThanOrEqual(2);
    expect(ghostBox!.x).toBeGreaterThanOrEqual(-2);
    expect(ghostBox!.y).toBeGreaterThanOrEqual(-2);
    expect(ghostBox!.x + ghostBox!.width).toBeLessThanOrEqual(viewport.width + 2);
    expect(ghostBox!.y + ghostBox!.height).toBeLessThanOrEqual(viewport.height + 2);
  });
});
