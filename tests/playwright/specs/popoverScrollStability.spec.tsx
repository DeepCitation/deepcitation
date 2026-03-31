/**
 * Regression test: popover should stay fixed in viewport position when the
 * page scrolls. Verifies the position:fixed wrapper introduced to fix the
 * "popover moves with scroll" bug.
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
  anchorText: "revenue growth",
  fullPhrase: "The company reported strong revenue growth",
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

test("popover viewport position is stable when page scrolls", async ({ mount, page }) => {
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

  // Scroll the container (not the window) by 200px
  await page.evaluate((id) => {
    const container = document.getElementById(id)!;
    container.scrollTop = 200;
  }, scrollContainerId);
  await page.waitForTimeout(100); // let any rAF / ResizeObserver settle

  // Record viewport-relative position after scrolling
  const afterBox = await popover.boundingBox();
  expect(afterBox).not.toBeNull();

  // Viewport position should be unchanged (within 2px for sub-pixel rounding)
  expect(Math.abs(afterBox!.y - beforeBox!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterBox!.x - beforeBox!.x)).toBeLessThanOrEqual(2);
});
