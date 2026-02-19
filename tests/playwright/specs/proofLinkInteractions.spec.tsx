import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const documentCitation: Citation = {
  type: "document",
  citationNumber: 1,
  anchorText: "25% revenue growth",
  fullPhrase: "The company reported 25% revenue growth in Q4",
  pageNumber: 5,
  lineIds: [12, 13],
  attachmentId: "test-attachment-123",
};

const verificationWithProof: Verification = {
  status: "found",
  label: "Q4_Report.pdf",
  document: {
    verifiedPageNumber: 5,
    verificationImageSrc: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg",
  },
  proof: {
    proofUrl: "https://api.deepcitation.com/proof/test123",
  },
};

// =============================================================================
// PROOF LINK INTERACTION TESTS
// =============================================================================

test.describe("Proof Link Interactions", () => {
  test("summary shows PagePill button (not link) when proof URL exists", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={verificationWithProof}
      />,
    );

    // Click citation to open popover
    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Wait for popover to appear
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Page pill should be a button, NOT a link
    const pagePillButton = popover.getByRole("button", { name: /expand to full page 5/i });
    await expect(pagePillButton).toBeVisible({ timeout: 10000 });
    await expect(popover.getByRole("link", { name: /p\.5/i })).not.toBeVisible();
  });

  test("page pill is static text when no onExpand (no proof image)", async ({ mount, page }) => {
    const noImageVerification: Verification = {
      status: "found",
      label: "Document.pdf",
      document: {
        verifiedPageNumber: 5,
      },
      // Snippet required for shouldShowPopover — but no image means canExpand is false
      verifiedMatchSnippet: "relevant text from the document",
    };

    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={noImageVerification}
      />,
    );

    // Click citation to open popover
    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Wait for popover to appear
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Page number should be present but NOT as a link
    await expect(popover.getByText("p.5")).toBeVisible();
    await expect(popover.getByRole("link", { name: /p\.5/i })).not.toBeVisible();
  });

  test("clicking PagePill expands to full page view with proof link in header", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={verificationWithProof}
      />,
    );

    // Click citation to open popover
    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Click PagePill to expand
    const pagePillButton = popover.getByRole("button", { name: /expand to full page 5/i });
    await pagePillButton.click();

    // Expanded view should show proof link in header
    const proofLink = popover.getByRole("link", { name: /open proof in new tab/i });
    await expect(proofLink).toBeVisible({ timeout: 10000 });

    // Verify link attributes
    await expect(proofLink).toHaveAttribute(
      "href",
      "https://api.deepcitation.com/proof/test123",
    );
    await expect(proofLink).toHaveAttribute("target", "_blank");
    await expect(proofLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("expanded view shows Back button and page number", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={verificationWithProof}
      />,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Expand
    const pagePillButton = popover.getByRole("button", { name: /expand to full page 5/i });
    await pagePillButton.click();

    // Verify Back button and page number are visible in expanded header
    await expect(popover.getByText("Back")).toBeVisible({ timeout: 10000 });
    await expect(popover.getByText("p.5")).toBeVisible();
  });
});

// =============================================================================
// SECURITY TESTS
// =============================================================================

test.describe("Proof Link Security", () => {
  test("blocks javascript: protocol in proof URL — no link in expanded view", async ({ mount, page }) => {
    const maliciousVerification: Verification = {
      status: "found",
      label: "Document.pdf",
      document: {
        verifiedPageNumber: 5,
        verificationImageSrc: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg",
      },
      proof: {
        proofUrl: "javascript:alert('XSS')",
      },
    };

    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={maliciousVerification}
      />,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Summary should show PagePill button (not proof link)
    const pagePillButton = popover.getByRole("button", { name: /expand to full page 5/i });
    await expect(pagePillButton).toBeVisible({ timeout: 10000 });

    // Expand and verify no proof link
    await pagePillButton.click();
    await expect(popover.getByText("Back")).toBeVisible({ timeout: 10000 });
    await expect(popover.getByRole("link", { name: /open proof in new tab/i })).not.toBeVisible();
  });

  test("blocks proof URL from untrusted domain — no link in expanded view", async ({ mount, page }) => {
    const untrustedVerification: Verification = {
      status: "found",
      label: "Document.pdf",
      document: {
        verifiedPageNumber: 5,
        verificationImageSrc: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg",
      },
      proof: {
        proofUrl: "https://evil.com/fake-proof",
      },
    };

    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={untrustedVerification}
      />,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Summary should show PagePill button (not proof link)
    const pagePillButton = popover.getByRole("button", { name: /expand to full page 5/i });
    await expect(pagePillButton).toBeVisible({ timeout: 10000 });

    // Expand and verify no proof link
    await pagePillButton.click();
    await expect(popover.getByText("Back")).toBeVisible({ timeout: 10000 });
    await expect(popover.getByRole("link", { name: /open proof in new tab/i })).not.toBeVisible();
  });

  test("allows proof URL from deepcitation.com subdomain in expanded view", async ({ mount, page }) => {
    const cdnVerification: Verification = {
      status: "found",
      label: "Document.pdf",
      document: {
        verifiedPageNumber: 5,
        verificationImageSrc: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg",
      },
      proof: {
        proofUrl: "https://cdn.deepcitation.com/proof/test123",
      },
    };

    await mount(
      <CitationComponent citation={documentCitation} verification={cdnVerification} />,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Summary shows PagePill button
    const pagePillButton = popover.getByRole("button", { name: /expand to full page 5/i });
    await expect(pagePillButton).toBeVisible({ timeout: 10000 });

    // Expand to see proof link
    await pagePillButton.click();
    const proofLink = popover.getByRole("link", { name: /open proof in new tab/i });
    await expect(proofLink).toBeVisible({ timeout: 10000 });
    await expect(proofLink).toHaveAttribute(
      "href",
      "https://cdn.deepcitation.com/proof/test123",
    );
  });
});
