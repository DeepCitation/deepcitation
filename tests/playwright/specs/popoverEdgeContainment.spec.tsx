import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react/Citation";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  type: "document",
  attachmentId: "att-edge-1",
  citationNumber: 1,
  anchorText: "ministerial control over water approvals",
  fullPhrase:
    "Bill 56 expands ministerial control over water approvals and related governance frameworks",
  pageNumber: 3,
};

// Static 800×1600 tall portrait PNG — triggers expanded width > summary width.
const tallImageBase64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAAZAAQAAAACpxxs4AAACPklEQVR42u3NMQEAAAwCIPuX1hZ7BgVID0QikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUTyNRnb9LNzJVTWGwAAAABJRU5ErkJggg==";

const verifiedVerification: Verification = {
  status: "found",
  attachmentId: "att-edge-1",
  verifiedMatchSnippet: "ministerial control over water approvals",
  document: { verifiedPageNumber: 3 },
  evidence: {
    src: tallImageBase64,
    dimensions: { width: 800, height: 1600 },
  },
};

const pageImages = {
  "att-edge-1": [
    {
      pageNumber: 3,
      imageUrl: tallImageBase64,
      dimensions: { width: 800, height: 1600 },
      isMatchPage: true,
    },
  ],
};

// Minimum viewport margin enforced by positioning (VIEWPORT_MARGIN_PX = 16)
const MARGIN = 16;
// Tolerance for sub-pixel rounding across rendering engines
const TOL = 3;

// =============================================================================
// HELPERS
// =============================================================================

/** Assert popover bounding box is within viewport margins. */
async function expectWithinViewport(
  page: import("@playwright/test").Page,
  popover: import("@playwright/test").Locator,
) {
  const viewport = page.viewportSize()!;
  const box = await popover.boundingBox();
  expect(box, "popover must have a bounding box").toBeTruthy();

  expect(box!.x).toBeGreaterThanOrEqual(MARGIN - TOL);
  expect(box!.y).toBeGreaterThanOrEqual(-TOL);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - MARGIN + TOL);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + TOL);
}

/** Open popover by clicking the citation trigger. */
async function openPopover(page: import("@playwright/test").Page) {
  await page.locator("[data-citation-id]").click();
  const popover = page.getByRole("dialog");
  await expect(popover).toBeVisible();
  // Wait for positioning to settle (rAF + boundary guard)
  await page.waitForTimeout(300);
  return popover;
}

/** Expand from summary → expanded-evidence by clicking the keyhole strip. */
async function expandToEvidence(
  page: import("@playwright/test").Page,
  popover: import("@playwright/test").Locator,
) {
  const keyholeStrip = popover.locator("[data-dc-keyhole]");
  await expect(keyholeStrip).toBeVisible({ timeout: 5000 });
  await keyholeStrip.click();
  const expandedView = popover
    .locator("[data-dc-inline-expanded]")
    .filter({ visible: true });
  await expect(expandedView).toBeVisible({ timeout: 5000 });
  // Wait for width change, ResizeObserver, and reposition to settle
  await page.waitForTimeout(500);
  return expandedView;
}

/** Expand from summary → expanded-page via the "Expand to full page" button. */
async function expandToFullPage(
  page: import("@playwright/test").Page,
  popover: import("@playwright/test").Locator,
) {
  const expandButton = popover.getByLabel(/Expand to full page/).first();
  await expect(expandButton).toBeVisible({ timeout: 5000 });
  await expandButton.click();
  const expandedView = popover
    .locator("[data-dc-inline-expanded]")
    .filter({ visible: true });
  await expect(expandedView).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(1000);
  return expandedView;
}

// =============================================================================
// SUMMARY POPOVER — VIEWPORT EDGE CONTAINMENT
//
// The verified HTML layout uses body { max-width: 860px; margin: 0 auto }.
// Citations near the right edge of the body can cause the 480px-wide summary
// popover to overflow the viewport. These tests position the trigger at each
// edge and verify the popover stays within the 16px viewport margin.
// =============================================================================

test.describe("Summary — Right Edge", () => {
  test("trigger flush right — popover stays in bounds", async ({
    mount,
    page,
  }) => {
    await mount(
      <div
        style={{
          paddingTop: "200px",
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: "4px",
        }}
      >
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expectWithinViewport(page, popover);
  });

  test("trigger flush right on narrow viewport (480px)", async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 720 });
    await mount(
      <div
        style={{
          paddingTop: "200px",
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: "4px",
        }}
      >
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expectWithinViewport(page, popover);
  });

  test("trigger flush right on tablet viewport (768px)", async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mount(
      <div
        style={{
          paddingTop: "200px",
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: "4px",
        }}
      >
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expectWithinViewport(page, popover);
  });
});

test.describe("Summary — Bottom Edge", () => {
  test("trigger near bottom — popover flips above", async ({
    mount,
    page,
  }) => {
    await mount(
      <div
        style={{
          paddingTop: "650px",
          paddingLeft: "200px",
        }}
      >
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expectWithinViewport(page, popover);
  });
});

test.describe("Summary — Bottom-Right Corner", () => {
  test("trigger at bottom-right corner — popover stays in bounds", async ({
    mount,
    page,
  }) => {
    await mount(
      <div
        style={{
          paddingTop: "650px",
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: "4px",
        }}
      >
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expectWithinViewport(page, popover);
  });

  test("trigger at bottom-right corner on narrow viewport (480px)", async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 600 });
    await mount(
      <div
        style={{
          paddingTop: "550px",
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: "4px",
        }}
      >
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expectWithinViewport(page, popover);
  });
});

// =============================================================================
// EXPANDED-EVIDENCE — VIEWPORT EDGE CONTAINMENT
//
// When the user clicks the keyhole strip, the popover expands to show evidence.
// The expanded width can be significantly larger than the summary width,
// potentially causing overflow if the popover isn't repositioned.
// =============================================================================

test.describe("Expanded-Evidence — Right Edge", () => {
  test("trigger flush right — expanded-evidence stays in bounds", async ({
    mount,
    page,
  }) => {
    await mount(
      <div
        style={{
          paddingTop: "200px",
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: "4px",
        }}
      >
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expandToEvidence(page, popover);
    await expectWithinViewport(page, popover);
  });

  test("trigger flush right on narrow viewport — expanded-evidence stays in bounds", async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 720 });
    await mount(
      <div
        style={{
          paddingTop: "200px",
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: "4px",
        }}
      >
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expandToEvidence(page, popover);
    await expectWithinViewport(page, popover);
  });
});

// =============================================================================
// EXPANDED-PAGE — VIEWPORT EDGE CONTAINMENT
//
// The expanded-page view fills nearly the full viewport. When the trigger is
// near a viewport edge, the boundary guard must apply a corrective translate.
// =============================================================================

test.describe("Expanded-Page — Right Edge", () => {
  test("trigger flush right — expanded-page stays in bounds", async ({
    mount,
    page,
  }) => {
    await mount(
      <div
        style={{
          paddingTop: "200px",
          display: "flex",
          justifyContent: "flex-end",
          paddingRight: "4px",
        }}
      >
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expandToFullPage(page, popover);

    // For expanded-page, check the content element (receives boundary guard translate)
    const popoverContent = page.locator("[data-dc-popover-content]");
    await expectWithinViewport(page, popoverContent);
  });
});

// =============================================================================
// CENTERED BODY LAYOUT (mirrors verified HTML pages)
//
// Verified HTML files use body { max-width: 860px; margin: 0 auto }.
// The popover is portaled into the body and positioned absolutely. On viewports
// wider than 860px, the body is centered with auto margins. Citations near the
// right edge of the BODY are near the CENTER of the VIEWPORT, but citations
// near the right edge of the VIEWPORT (e.g., wide popovers) must still be
// constrained.
// =============================================================================

test.describe("Centered Body Layout — Right Edge", () => {
  test("trigger at right edge of narrow centered container — popover stays in bounds", async ({
    mount,
    page,
  }) => {
    // Simulate the verified HTML body layout: narrow centered container
    await mount(
      <div
        style={{
          maxWidth: "860px",
          margin: "0 auto",
          padding: "2rem 1.5rem",
        }}
      >
        <div
          style={{
            paddingTop: "200px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <CitationComponent
            citation={baseCitation}
            verification={verifiedVerification}
            pageImagesByAttachmentId={pageImages}
          />
        </div>
      </div>,
    );

    const popover = await openPopover(page);
    await expectWithinViewport(page, popover);
  });

  test("trigger at right edge of narrow container on 600px viewport", async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 720 });
    await mount(
      <div
        style={{
          maxWidth: "860px",
          margin: "0 auto",
          padding: "2rem 1.5rem",
        }}
      >
        <div
          style={{
            paddingTop: "200px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <CitationComponent
            citation={baseCitation}
            verification={verifiedVerification}
            pageImagesByAttachmentId={pageImages}
          />
        </div>
      </div>,
    );

    const popover = await openPopover(page);
    await expectWithinViewport(page, popover);
  });

  test("expanded-evidence at right edge of centered container", async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 720 });
    await mount(
      <div
        style={{
          maxWidth: "860px",
          margin: "0 auto",
          padding: "2rem 1.5rem",
        }}
      >
        <div
          style={{
            paddingTop: "200px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <CitationComponent
            citation={baseCitation}
            verification={verifiedVerification}
            pageImagesByAttachmentId={pageImages}
          />
        </div>
      </div>,
    );

    const popover = await openPopover(page);
    await expandToEvidence(page, popover);
    await expectWithinViewport(page, popover);
  });
});

// =============================================================================
// LEFT EDGE — sanity check that left-side clamping also works
// =============================================================================

test.describe("Summary — Left Edge", () => {
  test("trigger flush left — popover stays in bounds", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ paddingTop: "200px", paddingLeft: "4px" }}>
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          pageImagesByAttachmentId={pageImages}
        />
      </div>,
    );

    const popover = await openPopover(page);
    await expectWithinViewport(page, popover);
  });
});
