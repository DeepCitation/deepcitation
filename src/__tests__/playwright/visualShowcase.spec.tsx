import { test, expect } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../react/CitationComponent";
import type { Citation } from "../../types/citation";
import type { Verification } from "../../types/verification";
import type { SearchAttempt } from "../../types/search";

// Import showcase components from separate file (required by Playwright CT)
import { VisualShowcase, MobileShowcase, allUrlStatuses } from "./ShowcaseComponents";

// =============================================================================
// TEST FIXTURES - Citations (for popover tests)
// =============================================================================

const baseCitation: Citation = {
  pageNumber: 5,
  lineIds: [12, 13],
  fullPhrase: "Revenue increased by 15% in Q4 2024.",
  anchorText: "increased by 15%",
  citationNumber: 1,
};

// =============================================================================
// TEST FIXTURES - Verifications (for popover tests)
// =============================================================================

const failedSearchAttempts: SearchAttempt[] = [
  {
    method: "exact_line_match",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
    note: "not found on expected page (5)",
  },
  {
    method: "current_page",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
    note: "not found with exact match",
  },
  {
    method: "adjacent_pages",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 4,
    note: "searched adjacent pages 4-6",
  },
  {
    method: "adjacent_pages",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 6,
  },
  {
    method: "anchor_text_fallback",
    success: false,
    searchPhrase: "increased by 15%",
    searchPhraseType: "anchor_text",
    pageSearched: 5,
    note: "anchor text not found",
  },
  {
    method: "expanded_window",
    success: false,
    searchPhrase: "increased by 15%",
    searchPhraseType: "anchor_text",
    note: "searched pages 1-10",
  },
];

const notFoundWithAudit: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
  searchAttempts: failedSearchAttempts,
};

// =============================================================================
// TESTS - Desktop Visual Showcase
// =============================================================================

test.describe("Visual Showcase - Desktop", () => {
  test("renders complete showcase", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    const showcase = page.locator('[data-testid="visual-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("all variant rows render correctly", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    for (const variant of ["brackets", "chip", "text", "superscript", "minimal"]) {
      const row = page.locator(`[data-variant-row="${variant}"]`);
      await expect(row).toBeVisible();
      // Each row should have 4 citations (verified, partial, not found, pending)
      const citations = row.locator('[data-citation-id]');
      await expect(citations).toHaveCount(4);
    }
  });

  test("content types section renders all types", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    for (const content of ["number", "anchorText", "indicator"]) {
      const section = page.locator(`[data-content-type="${content}"]`);
      await expect(section).toBeVisible();
    }
  });

  test("audit log section shows failed search attempts", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    const notFoundAudit = page.locator('[data-audit="not-found"]');
    await expect(notFoundAudit).toBeVisible();
    await expect(notFoundAudit).toContainText("Not Found");

    const partialAudit = page.locator('[data-audit="partial"]');
    await expect(partialAudit).toBeVisible();

    const lowTrustAudit = page.locator('[data-audit="low-trust"]');
    await expect(lowTrustAudit).toBeVisible();
  });

  test("URL section shows all status types", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    for (const { status } of allUrlStatuses) {
      const urlStatus = page.locator(`[data-url-status="${status}"]`);
      await expect(urlStatus).toBeVisible();
    }
  });

  test("URL variants section shows all variants", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    for (const variant of ["chip", "inline", "bracket"]) {
      const urlVariant = page.locator(`[data-url-variant="${variant}"]`);
      await expect(urlVariant).toBeVisible();
    }
  });

  test("visual snapshot - full showcase", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    // Wait for the showcase to be visible and stable
    const showcase = page.locator('[data-testid="visual-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for all citations to render
    await expect(page.locator('[data-citation-id]').first()).toBeVisible();

    // Take screenshot of the showcase element
    await expect(showcase).toHaveScreenshot('desktop-showcase.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1, // Allow small differences across platforms
    });
  });
});

// =============================================================================
// TESTS - Mobile Visual Showcase
// =============================================================================

test.describe("Visual Showcase - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test("renders mobile showcase", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    const showcase = page.locator('[data-testid="mobile-showcase"]');
    await expect(showcase).toBeVisible();
  });

  test("mobile variants render without overflow", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    for (const variant of ["brackets", "chip", "superscript", "minimal"]) {
      const variantEl = page.locator(`[data-mobile-variant="${variant}"]`);
      await expect(variantEl).toBeVisible();

      // Check no horizontal overflow
      const box = await variantEl.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(375);
    }
  });

  test("URL citations truncate properly on mobile", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    for (const status of ["verified", "blocked_login", "error_not_found"]) {
      const urlEl = page.locator(`[data-mobile-url="${status}"]`);
      await expect(urlEl).toBeVisible();

      const box = await urlEl.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(375);
    }
  });

  test("visual snapshot - mobile showcase", async ({ mount, page }) => {
    await mount(<MobileShowcase />);

    // Wait for the mobile showcase to be visible and stable
    const showcase = page.locator('[data-testid="mobile-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for citations to render
    await expect(page.locator('[data-citation-id]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot('mobile-showcase.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Tablet Visual Showcase
// =============================================================================

test.describe("Visual Showcase - Tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } }); // iPad

  test("visual snapshot - tablet showcase", async ({ mount, page }) => {
    await mount(<VisualShowcase />);

    // Wait for the showcase to be visible and stable
    const showcase = page.locator('[data-testid="visual-showcase"]');
    await expect(showcase).toBeVisible();

    // Wait for citations to render
    await expect(page.locator('[data-citation-id]').first()).toBeVisible();

    await expect(showcase).toHaveScreenshot('tablet-showcase.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.1,
    });
  });
});

// =============================================================================
// TESTS - Popover Interaction (Desktop)
// =============================================================================

test.describe("Popover Interactions", () => {
  // Note: Radix UI popovers can be flaky in component tests due to portal rendering.
  // These tests verify the component mounts correctly.

  test("citation renders with data-citation-id", async ({ mount, page }) => {
    await mount(
      <div className="p-10">
        <CitationComponent
          citation={baseCitation}
          verification={notFoundWithAudit}
          variant="brackets"
        />
      </div>
    );

    const citation = page.locator('[data-citation-id]');
    await expect(citation).toBeVisible();
    await expect(citation).toHaveAttribute('data-citation-id');
  });

  test("citation with audit log renders correctly", async ({ mount, page }) => {
    await mount(
      <div className="p-10">
        <CitationComponent
          citation={baseCitation}
          verification={notFoundWithAudit}
          variant="brackets"
        />
      </div>
    );

    const citation = page.locator('[data-citation-id]');
    await expect(citation).toBeVisible();

    // Should contain the citation number in brackets
    await expect(citation).toContainText('[');
    await expect(citation).toContainText(']');
  });
});
