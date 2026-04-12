/**
 * Regression test: popover should stay fixed at its viewport position when the
 * page scrolls — it does NOT scroll with the content (position:fixed in viewport
 * space), so the viewport-relative Y coordinate is unchanged after scroll.
 *
 * Uses a fixed-height scrollable container (NOT window.scrollBy) so the test
 * is immune to parallel-test pollution from other specs that scroll the window.
 */

import { expect, test } from "@playwright/experimental-ct-react";
import React from "react";
import { CitationComponent } from "../../../src/react";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

const citation: Citation = {
  attachmentId: "att-scroll-1",
  citationNumber: 1,
  sourceMatch: "revenue growth",
  sourceContext: "The company reported strong revenue growth",
  pageNumber: 2,
  lineIds: [5],
};

const testImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwAHggJ/PchI6QAAAABJRU5ErkJggg==";

const verification: Verification = {
  status: "found",
  attachmentId: "att-scroll-1",
  document: { verifiedPageNumber: 2 },
  evidence: { src: testImage, dimensions: { width: 400, height: 50 } },
};

const pageImagesByAttachmentId = {
  "att-scroll-1": [
    {
      pageNumber: 2,
      imageUrl: testImage,
      dimensions: { width: 400, height: 50 },
      isMatchPage: true,
    },
  ],
};

test("popover stays fixed to viewport when scroll container scrolls (position:fixed)", async ({ mount, page }) => {
  // Mount inside a scrollable container with a fixed viewport height.
  // We scroll THIS container (not the window) so the test is isolated
  // from parallel workers that may scroll the window independently.
  const scrollContainerId = "dc-scroll-test-root";
  await mount(
    <div
      id={scrollContainerId}
      style={{ height: "500px", overflow: "auto", position: "relative" }}
    >
      <div style={{ height: "3000px", padding: "100px 40px 40px" }}>
        <p style={{ marginBottom: "100px" }}>Scroll padding above</p>
        <CitationComponent
          citation={citation}
          verification={verification}
          pageImagesByAttachmentId={pageImagesByAttachmentId}
        />
        <p style={{ marginTop: "300px" }}>Scroll padding below</p>
      </div>
    </div>,
  );

  // Open the popover
  await page.locator("[data-citation-id]").click();
  const popover = page.getByRole("dialog");
  await expect(popover).toBeVisible();

  // Assert the wrapper uses position:fixed — this is the mechanism under test.
  // Without this, the coordinate assertions below could pass spuriously if the
  // popover happened to portal into document.body with position:absolute (body
  // is outside the test's scroll container so it would also appear viewport-stable).
  const wrapper = page.locator("[data-dc-popover-wrapper]");
  await expect(wrapper).toHaveCSS("position", "fixed");

  // Record viewport-relative position before scrolling
  const beforeBox = await popover.boundingBox();
  expect(beforeBox).not.toBeNull();

  const scrollAmount = 200;

  // Scroll the container (not the window) by 200px
  await page.evaluate(
    ({ id, px }) => {
      const container = document.getElementById(id)!;
      container.scrollTop = px;
    },
    { id: scrollContainerId, px: scrollAmount },
  );
  await page.waitForTimeout(100); // let any rAF / ResizeObserver settle

  // Record viewport-relative position after scrolling
  const afterBox = await popover.boundingBox();
  expect(afterBox).not.toBeNull();

  // With position:fixed, the popover stays at its rendered viewport position.
  // Viewport Y should NOT shift when the scroll container scrolls.
  const yDelta = Math.abs(afterBox!.y - beforeBox!.y);
  expect(yDelta).toBeLessThanOrEqual(5);

  // Horizontal position should be unchanged
  expect(Math.abs(afterBox!.x - beforeBox!.x)).toBeLessThanOrEqual(2);
});
