/**
 * Regression test: popover is dismissed when the page scroll container scrolls.
 *
 * When a consumer provides a [data-dc-portal-root] element (a position:fixed
 * full-viewport overlay), the popover is viewport-pinned regardless of its own
 * position:absolute CSS — the containing block is the fixed overlay, not the
 * scroll container. Rather than trying to reposition in real time, the popover
 * dismisses when the page scroll container fires a scroll event (matching
 * Linear / Notion / GitHub behavior).
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

test("popover dismisses when the page scroll container scrolls", async ({ mount, page }) => {
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

  // Scroll the container (not the window) by 200px
  await page.evaluate(
    ({ id, px }) => {
      const container = document.getElementById(id)!;
      container.scrollTop = px;
    },
    { id: scrollContainerId, px: 200 },
  );
  await page.waitForTimeout(100); // let the scroll event and React state flush

  // Popover must be dismissed after the scroll container scrolls.
  // This covers the [data-dc-portal-root] scenario where the popover portals into
  // a position:fixed overlay and would otherwise stay pinned to the viewport.
  await expect(popover).not.toBeVisible();
});
