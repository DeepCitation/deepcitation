import { expect, test } from "@playwright/experimental-ct-react";
import { AnimationDebugHarness } from "../../../src/react/testing/AnimationDebugHarness";

// =============================================================================
// Animation debug harness — not a regression test.
//
// This spec exists so developers can run `npm run test:ct:ui`, pin this spec,
// and open the Playwright UI browser on a fully wired harness:
//
//   __dcAnimationDebug.enable()
//   __dcAnimationDebug.setSpeed(0.1)
//   __dcAnimationDebug.showAimOverlay(true)
//   __dcAnimationDebug.showGhostRects(true)
//   __dcAnimationDebug.scrub(0.65, "page-expand")
//   __dcAnimationDebug.step(16)
//
// The assertions below just prove the harness mounts cleanly and the console
// API is installed. Do not expand this into full snapshot coverage — the
// harness is for *manual* investigation of focus↔page handoff.
// =============================================================================

test("harness mounts with control bar + citation", async ({ mount, page }) => {
  await mount(<AnimationDebugHarness />);

  await expect(page.locator("[data-dc-debug-harness]")).toBeVisible();
  await expect(page.locator("[data-dc-debug-controlbar]")).toBeVisible();
  await expect(page.locator("[data-citation-id]").first()).toBeVisible();
});

test("__dcAnimationDebug console API is installed", async ({ mount, page }) => {
  await mount(<AnimationDebugHarness />);

  const apiShape = await page.evaluate(() => {
    const api = (window as unknown as { __dcAnimationDebug?: Record<string, unknown> }).__dcAnimationDebug;
    if (!api) return null;
    return {
      enable: typeof api.enable,
      setSpeed: typeof api.setSpeed,
      scrub: typeof api.scrub,
      step: typeof api.step,
      showAimOverlay: typeof api.showAimOverlay,
      showGhostRects: typeof api.showGhostRects,
    };
  });

  expect(apiShape).toEqual({
    enable: "function",
    setSpeed: "function",
    scrub: "function",
    step: "function",
    showAimOverlay: "function",
    showGhostRects: "function",
  });
});

test("aim toggle surfaces crosshair in focus view at 10× slow-mo", async ({ mount, page }) => {
  await mount(<AnimationDebugHarness />);

  // Turn on debug + slow-mo + aim crosshair.
  await page.evaluate(() => {
    const api = (window as unknown as {
      __dcAnimationDebug: {
        enable: () => void;
        setSpeed: (x: number) => void;
        showAimOverlay: (on: boolean) => void;
      };
    }).__dcAnimationDebug;
    api.enable();
    api.setSpeed(0.1);
    api.showAimOverlay(true);
  });

  // Open the citation — the live panel's CitationComponent.
  await page.locator("[data-citation-id]").first().click();

  // Focus keyhole mounts AimOverlay with data-dc-debug-aim="focus".
  // The overlay container is intentionally 0×0 (children overflow via absolute positioning),
  // so use toBeAttached — presence in DOM confirms the overlay rendered.
  await expect(page.locator('[data-dc-debug-aim="focus"]').first()).toBeAttached({ timeout: 5000 });
});
