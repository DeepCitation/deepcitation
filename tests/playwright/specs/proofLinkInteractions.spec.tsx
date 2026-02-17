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

const verificationWithoutProof: Verification = {
  status: "found",
  label: "Q4_Report.pdf",
  document: {
    verifiedPageNumber: 5,
  },
};

// =============================================================================
// PROOF LINK INTERACTION TESTS
// =============================================================================

test.describe("Proof Link Interactions", () => {
  test("page number is clickable link when proof URL exists", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={verificationWithProof}
      />,
    );

    // Click citation to open popover
    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Wait for popover to appear with explicit timeout
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Find page number link (should have external link icon)
    const pageLink = popover.getByRole("link", { name: /p\.5/i });
    await expect(pageLink).toBeVisible({ timeout: 10000 });

    // Verify it has correct href
    await expect(pageLink).toHaveAttribute(
      "href",
      "https://api.deepcitation.com/proof/test123",
    );

    // Verify it has correct target attributes for security
    await expect(pageLink).toHaveAttribute("target", "_blank");
    await expect(pageLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("page number is static text when proof URL is missing", async ({ mount, page }) => {
    const noProofVerification: Verification = {
      status: "found",
      label: "Document.pdf",
      document: {
        verifiedPageNumber: 5,
        verificationImageSrc: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg",
      },
    };

    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={noProofVerification}
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

  test("clicking page link does not close popover", async ({ mount, page, context }) => {
    // Set up new page listener to capture proof URL navigation
    const newPagePromise = context.waitForEvent("page");

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

    // Click the page link
    const pageLink = popover.getByRole("link", { name: /p\.5/i });
    await pageLink.click();

    // Popover should still be visible (stopPropagation prevents close)
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Verify new tab was opened with proof URL
    const newPage = await newPagePromise;
    expect(newPage.url()).toBe("https://api.deepcitation.com/proof/test123");
    await newPage.close();
  });

  test("external link icon is visible in page link", async ({ mount, page }) => {
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

    // Check that external link icon is present (link contains SVG)
    const pageLink = popover.getByRole("link", { name: /p\.5/i });
    await expect(pageLink).toBeVisible({ timeout: 10000 });

    // Verify link has the icon span wrapper
    const iconWrapper = pageLink.locator("span");
    await expect(iconWrapper).toHaveCount(2); // Text span + icon span
  });

  test("page link in verification log is also clickable", async ({ mount, page }) => {
    const verificationWithSearchAttempts: Verification = {
      ...verificationWithProof,
      searchAttempts: [
        {
          method: "exact",
          success: true,
          searchPhrase: "25% revenue growth",
          searchVariations: ["25% revenue growth"],
          matchedLocation: {
            pageNumber: 5,
            lineId: 12,
          },
        },
      ],
    };

    await mount(
      <CitationComponent
        citation={documentCitation}
        verification={verificationWithSearchAttempts}
      />,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible({ timeout: 10000 });

    // Click to expand search details
    await citation.click();

    // Find page/line link in verification log
    const pageLineLink = popover.getByRole("link").filter({ hasText: "P.5" });
    await expect(pageLineLink).toBeVisible();
    await expect(pageLineLink).toHaveAttribute(
      "href",
      "https://api.deepcitation.com/proof/test123",
    );
  });
});

// =============================================================================
// SECURITY TESTS
// =============================================================================

test.describe("Proof Link Security", () => {
  test("blocks javascript: protocol in proof URL", async ({ mount, page }) => {
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

    // Should show static text, not link
    await expect(popover.getByText("p.5")).toBeVisible();
    await expect(popover.getByRole("link", { name: /p\.5/i })).not.toBeVisible();
  });

  test("blocks proof URL from untrusted domain", async ({ mount, page }) => {
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

    // Should show static text, not link
    await expect(popover.getByText("p.5")).toBeVisible();
    await expect(popover.getByRole("link", { name: /p\.5/i })).not.toBeVisible();
  });

  test("allows proof URL from deepcitation.com subdomain", async ({ mount, page }) => {
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

    // Should be a valid link
    const pageLink = popover.getByRole("link", { name: /p\.5/i });
    await expect(pageLink).toBeVisible();
    await expect(pageLink).toHaveAttribute(
      "href",
      "https://cdn.deepcitation.com/proof/test123",
    );
  });
});
