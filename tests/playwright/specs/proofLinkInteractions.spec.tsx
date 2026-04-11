import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react";
import type { Citation } from "../../../src/types/citation";
import type { PageImage, Verification } from "../../../src/types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const attachmentId = "test-attachment-123";

const documentCitation: Citation = {
  type: "document",
  citationNumber: 1,
  sourceMatch: "25% revenue growth",
  sourceContext: "The company reported 25% revenue growth in Q4",
  pageNumber: 5,
  lineIds: [12, 13],
  attachmentId,
};

const verificationWithEvidence: Verification = {
  status: "found",
  label: "Q4_Report.pdf",
  attachmentId,
  document: {
    verifiedPageNumber: 5,
  },
  evidence: {
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  },
};

const pageImages: PageImage[] = [
  {
    pageNumber: 5,
    imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    dimensions: { width: 1, height: 1 },
  },
];

// =============================================================================
// PAGE PILL INTERACTION TESTS
// =============================================================================

test.describe("Page Pill Interactions", () => {
  test("summary shows PagePill button when page images exist", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={verificationWithEvidence}
        pageImagesByAttachmentId={{ [attachmentId]: pageImages }}
      />,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    const pagePillButton = popover.getByRole("button", { name: /expand to full page 5/i });
    await expect(pagePillButton).toBeVisible({ timeout: 10000 });
  });

  test("page pill is static text when no page images", async ({ mount, page }) => {
    const noImageVerification: Verification = {
      status: "found",
      label: "Document.pdf",
      attachmentId,
      document: {
        verifiedPageNumber: 5,
      },
      // Snippet required for shouldShowPopover — but no page image means canExpand is false
      sourceSnippet: "relevant text from the document",
    };

    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={noImageVerification}
      />,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    await expect(popover.getByText(/p\.\s*5/).first()).toBeVisible();
    await expect(popover.getByRole("button", { name: /expand to full page 5/i })).not.toBeVisible();
  });

  test("expanded view shows full-page image and page number", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={verificationWithEvidence}
        pageImagesByAttachmentId={{ [attachmentId]: pageImages }}
      />,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    const pagePillButton = popover.getByRole("button", { name: /expand to full page 5/i });
    await pagePillButton.click();

    const expandedView = popover.locator("[data-dc-inline-expanded]").filter({ visible: true });
    await expect(expandedView).toBeVisible({ timeout: 10000 });
    await expect(popover.getByText(/p\.\s*5/).first()).toBeVisible();
  });
});
