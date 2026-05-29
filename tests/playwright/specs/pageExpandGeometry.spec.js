import { expect, test } from "@playwright/experimental-ct-react";
import { PageExpandGeometryCitation } from "./PageExpandGeometryCitation";
async function openSummaryPopover(page) {
    await page.locator("[data-citation-id]").click();
    const popover = page.locator("[data-dc-popover-wrapper]");
    await expect(popover).toBeVisible();
    return popover;
}
async function freezeSummaryToPageTransition(page, phase, popover) {
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
        expect(Math.abs(ghostBox.x - sourceBox.x)).toBeLessThanOrEqual(2);
        expect(Math.abs(ghostBox.y - sourceBox.y)).toBeLessThanOrEqual(2);
        // Width tolerance 5px: ghost includes SPOTLIGHT_PADDING around the source keyhole
        expect(Math.abs(ghostBox.width - sourceBox.width)).toBeLessThanOrEqual(5);
        expect(Math.abs(ghostBox.height - sourceBox.height)).toBeLessThanOrEqual(2);
    });
    test("target phase lands near the settled expanded-page target and stays on-screen", async ({ mount, page }) => {
        await mount(<PageExpandGeometryCitation />);
        const { ghost } = await freezeSummaryToPageTransition(page, "target");
        // The ghost uses a pure translate: it keeps the source viewport's dimensions
        // and slides so the evidence image center aligns with the spotlight center.
        // We verify anchor alignment via the ghost's inner img element, not the
        // ghost bounding box (which has source dimensions, not spotlight dimensions).
        const spotlight = page.locator("[data-dc-spotlight]").first();
        const target = page.locator("[data-dc-page-expand-target][data-dc-page-expand-ready='true']").first();
        await expect(target).toBeVisible();
        const ghostImg = ghost.locator("img").first();
        // Poll until the img center (= anchorInGhost mapped to viewport) aligns with
        // the spotlight/target center. Resolve reference inside poll to catch late paints.
        await expect
            .poll(async () => {
            const referenceEl = (await spotlight.count()) > 0 ? spotlight : target;
            const referenceBox = await referenceEl.boundingBox();
            const imgBox = await ghostImg.boundingBox();
            if (!imgBox || !referenceBox)
                return Number.POSITIVE_INFINITY;
            const imgCX = imgBox.x + imgBox.width / 2;
            const imgCY = imgBox.y + imgBox.height / 2;
            const refCX = referenceBox.x + referenceBox.width / 2;
            const refCY = referenceBox.y + referenceBox.height / 2;
            return Math.max(Math.abs(imgCX - refCX), Math.abs(imgCY - refCY));
        }, { timeout: 1500 })
            .toBeLessThanOrEqual(5);
        // Re-sample after the poll has confirmed convergence.
        const referenceEl = (await spotlight.count()) > 0 ? spotlight : target;
        const referenceBox = await referenceEl.boundingBox();
        const imgBox = await ghostImg.boundingBox();
        const ghostBox = await ghost.boundingBox();
        const viewport = page.viewportSize();
        expect(ghostBox).toBeTruthy();
        expect(referenceBox).toBeTruthy();
        expect(imgBox).toBeTruthy();
        const imgCX = imgBox.x + imgBox.width / 2;
        const imgCY = imgBox.y + imgBox.height / 2;
        const refCX = referenceBox.x + referenceBox.width / 2;
        const refCY = referenceBox.y + referenceBox.height / 2;
        expect(Math.abs(imgCX - refCX)).toBeLessThanOrEqual(5);
        expect(Math.abs(imgCY - refCY)).toBeLessThanOrEqual(5);
        expect(ghostBox.x).toBeGreaterThanOrEqual(-2);
        expect(ghostBox.y).toBeGreaterThanOrEqual(-2);
        expect(ghostBox.x + ghostBox.width).toBeLessThanOrEqual(viewport.width + 2);
        expect(ghostBox.y + ghostBox.height).toBeLessThanOrEqual(viewport.height + 2);
    });
    test("both phase renders source, target, and marker debug overlays", async ({ mount, page }) => {
        await mount(<PageExpandGeometryCitation />);
        const popover = await openSummaryPopover(page);
        // Set "both" debug phase — ghost is replaced by three persistent overlays
        await page.evaluate(() => {
            document.documentElement.dataset.dcPageExpandDebugPhase = "both";
        });
        const expandButton = popover.getByLabel(/Expand to full page/).first();
        await expect(expandButton).toBeVisible();
        await expandButton.click();
        // Ghost should NOT be in the DOM (removed in "both" mode)
        const ghost = page.locator("[data-dc-page-expand-ghost]");
        await expect(ghost).toBeHidden({ timeout: 1500 });
        // Three debug overlays should be visible
        const overlays = page.locator("[data-dc-debug-overlay]");
        await expect(overlays).toHaveCount(3, { timeout: 1500 });
        // All overlays should be on-screen
        const viewport = page.viewportSize();
        for (let i = 0; i < 3; i++) {
            const box = await overlays.nth(i).boundingBox();
            expect(box).toBeTruthy();
            expect(box.width).toBeGreaterThan(1);
            expect(box.height).toBeGreaterThan(1);
            // At least partially on-screen
            expect(box.x + box.width).toBeGreaterThan(0);
            expect(box.y + box.height).toBeGreaterThan(0);
            expect(box.x).toBeLessThan(viewport.width);
            expect(box.y).toBeLessThan(viewport.height);
        }
    });
    test("scan() outlines live source/target elements without triggering a transition", async ({ mount, page }) => {
        await mount(<PageExpandGeometryCitation />);
        await openSummaryPopover(page);
        const result = await page.evaluate(() => {
            const api = window
                .__dcDebugPageExpand;
            return api.scan();
        });
        // Summary popover should have at least one source element
        expect(result.sources).toBeGreaterThanOrEqual(1);
        // Overlays should be in the DOM
        const overlays = page.locator("[data-dc-debug-overlay]");
        expect(await overlays.count()).toBeGreaterThanOrEqual(1);
    });
    test("ghost is removed from the DOM after the animation completes", async ({ mount, page }) => {
        await mount(<PageExpandGeometryCitation />);
        const popover = await openSummaryPopover(page);
        const expandButton = popover.getByLabel(/Expand to full page/).first();
        await expect(expandButton).toBeVisible();
        await expandButton.click();
        const ghost = page.locator("[data-dc-page-expand-ghost]");
        // Ghost should appear then be removed after animation (250ms + buffer)
        await expect(ghost).toBeHidden({ timeout: 2000 });
        expect(await ghost.count()).toBe(0);
    });
});
