/**
 * Regression test: popover should scroll with the page content — it moves with
 * the trigger element (position:absolute inside the scroll container), NOT
 * pinned to the viewport.
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

test("popover scrolls with page content (position:absolute in scroll container)", async ({ mount, page }) => {
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

  // With position:absolute inside the scroll container, the popover scrolls
  // with the page. Viewport Y should shift by approximately the scroll amount.
  const yDelta = beforeBox!.y - afterBox!.y;
  expect(yDelta).toBeGreaterThanOrEqual(scrollAmount - 5);
  expect(yDelta).toBeLessThanOrEqual(scrollAmount + 5);

  // Horizontal position should be unchanged
  expect(Math.abs(afterBox!.x - beforeBox!.x)).toBeLessThanOrEqual(2);
});
