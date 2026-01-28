import { test, expect } from "@playwright/experimental-ct-react";
import React from "react";
import { CitationComponent } from "../../react/CitationComponent";
import { UrlCitationComponent } from "../../react/UrlCitationComponent";
import type { Citation } from "../../types/citation";
import type { Verification } from "../../types/verification";
import type { SearchAttempt } from "../../types/search";
import type { UrlCitationMeta, UrlFetchStatus } from "../../react/types";

// =============================================================================
// TEST FIXTURES - Citations
// =============================================================================

const baseCitation: Citation = {
  pageNumber: 5,
  lineIds: [12, 13],
  fullPhrase: "Revenue increased by 15% in Q4 2024.",
  anchorText: "increased by 15%",
  citationNumber: 1,
};

const longCitation: Citation = {
  ...baseCitation,
  fullPhrase: "The quarterly financial report indicates that revenue increased by 15% compared to the same period last year, driven primarily by strong performance in the enterprise segment.",
  anchorText: "revenue increased by 15% compared to the same period last year",
  citationNumber: 2,
};

// =============================================================================
// TEST FIXTURES - Verifications
// =============================================================================

const verifiedVerification: Verification = {
  status: "found",
  verifiedPageNumber: 5,
  verifiedMatchSnippet: "Revenue increased by 15% in Q4 2024.",
  verificationImageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
};

const partialVerification: Verification = {
  status: "found_on_other_page",
  verifiedPageNumber: 7,
  verifiedMatchSnippet: "increased by 15%",
};

const anchorOnlyVerification: Verification = {
  status: "found_anchor_text_only",
  verifiedPageNumber: 5,
  verifiedMatchSnippet: "increased by 15%",
};

const notFoundVerification: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
};

const pendingVerification: Verification = {
  status: "pending",
};

// =============================================================================
// TEST FIXTURES - Failed Search Attempts (Audit Log)
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

const partialMatchSearchAttempts: SearchAttempt[] = [
  {
    method: "exact_line_match",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
    note: "exact phrase not found",
  },
  {
    method: "anchor_text_fallback",
    success: true,
    searchPhrase: "increased by 15%",
    searchPhraseType: "anchor_text",
    pageSearched: 7,
    matchedVariation: "exact_anchor_text",
    matchedText: "increased by 15%",
    note: "found on different page",
  },
];

const lowTrustSearchAttempts: SearchAttempt[] = [
  {
    method: "exact_line_match",
    success: false,
    searchPhrase: "Revenue increased by 15% in Q4 2024.",
    searchPhraseType: "full_phrase",
    pageSearched: 5,
  },
  {
    method: "first_word_fallback",
    success: true,
    searchPhrase: "Revenue",
    searchPhraseType: "anchor_text",
    pageSearched: 3,
    matchedVariation: "first_word_only",
    matchedText: "Revenue",
    note: "only first word matched",
  },
];

const notFoundWithAudit: Verification = {
  status: "not_found",
  verifiedPageNumber: -1,
  searchAttempts: failedSearchAttempts,
};

const partialWithAudit: Verification = {
  status: "found_on_other_page",
  verifiedPageNumber: 7,
  searchAttempts: partialMatchSearchAttempts,
};

const lowTrustWithAudit: Verification = {
  status: "first_word_found",
  verifiedPageNumber: 3,
  searchAttempts: lowTrustSearchAttempts,
};

// =============================================================================
// TEST FIXTURES - URL Metas
// =============================================================================

const allUrlStatuses: Array<{ status: UrlFetchStatus; description: string }> = [
  { status: "verified", description: "Verified" },
  { status: "partial", description: "Partial" },
  { status: "pending", description: "Pending" },
  { status: "accessible", description: "Accessible" },
  { status: "redirected", description: "Redirected" },
  { status: "redirected_valid", description: "Redirected Valid" },
  { status: "blocked_antibot", description: "Blocked Anti-bot" },
  { status: "blocked_login", description: "Blocked Login" },
  { status: "blocked_paywall", description: "Blocked Paywall" },
  { status: "blocked_geo", description: "Blocked Geo" },
  { status: "blocked_rate_limit", description: "Blocked Rate Limit" },
  { status: "error_timeout", description: "Error Timeout" },
  { status: "error_not_found", description: "Error 404" },
  { status: "error_server", description: "Error Server" },
  { status: "error_network", description: "Error Network" },
  { status: "unknown", description: "Unknown" },
];

// =============================================================================
// VISUAL SHOWCASE COMPONENT
// =============================================================================

function VisualShowcase() {
  return (
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen" data-testid="visual-showcase">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Citation Component Visual Showcase</h1>

      {/* Section: All Variants x All States */}
      <section className="mb-10" data-testid="variants-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">All Variants × All States</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Variant</th>
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Verified</th>
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Partial</th>
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Not Found</th>
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Pending</th>
              </tr>
            </thead>
            <tbody>
              {(["brackets", "chip", "text", "superscript", "minimal"] as const).map(variant => (
                <tr key={variant} className="border-b border-gray-100 dark:border-gray-800" data-variant-row={variant}>
                  <td className="p-2 font-mono text-gray-700 dark:text-gray-300">{variant}</td>
                  <td className="p-2">
                    <CitationComponent
                      citation={baseCitation}
                      verification={verifiedVerification}
                      variant={variant}
                    />
                  </td>
                  <td className="p-2">
                    <CitationComponent
                      citation={baseCitation}
                      verification={partialVerification}
                      variant={variant}
                    />
                  </td>
                  <td className="p-2">
                    <CitationComponent
                      citation={baseCitation}
                      verification={notFoundVerification}
                      variant={variant}
                    />
                  </td>
                  <td className="p-2">
                    <CitationComponent
                      citation={baseCitation}
                      verification={pendingVerification}
                      variant={variant}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: Content Types */}
      <section className="mb-10" data-testid="content-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Content Types</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["number", "anchorText", "indicator"] as const).map(content => (
            <div key={content} className="p-3 bg-gray-50 dark:bg-gray-800 rounded" data-content-type={content}>
              <p className="text-xs text-gray-500 mb-2 font-mono">{content}</p>
              <CitationComponent
                citation={baseCitation}
                verification={verifiedVerification}
                variant="brackets"
                content={content}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Section: Long Text Handling */}
      <section className="mb-10" data-testid="long-text-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Long Text Handling</h2>
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <p className="text-xs text-gray-500 mb-2">Chip with long anchorText</p>
            <CitationComponent
              citation={longCitation}
              verification={verifiedVerification}
              variant="chip"
              content="anchorText"
            />
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <p className="text-xs text-gray-500 mb-2">Minimal with long anchorText</p>
            <CitationComponent
              citation={longCitation}
              verification={verifiedVerification}
              variant="minimal"
              content="anchorText"
            />
          </div>
        </div>
      </section>

      {/* Section: Failed Search Attempts (Audit Log) */}
      <section className="mb-10" data-testid="audit-log-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Failed Search Attempts (Audit Log)</h2>
        <div className="space-y-6">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800" data-audit="not-found">
            <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-3">Not Found - 6 search attempts</p>
            <CitationComponent
              citation={baseCitation}
              verification={notFoundWithAudit}
              variant="brackets"
            />
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800" data-audit="partial">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-3">Partial Match - Found on different page</p>
            <CitationComponent
              citation={baseCitation}
              verification={partialWithAudit}
              variant="brackets"
            />
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800" data-audit="low-trust">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-3">Low Trust - Only first word matched</p>
            <CitationComponent
              citation={baseCitation}
              verification={lowTrustWithAudit}
              variant="brackets"
            />
          </div>
        </div>
      </section>

      {/* Section: URL Citations - All Statuses */}
      <section className="mb-10" data-testid="url-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">URL Citations - All Statuses</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {allUrlStatuses.map(({ status, description }) => {
            const meta: UrlCitationMeta = {
              url: `https://example.com/${status}`,
              domain: "example.com",
              title: `${description} Article`,
              fetchStatus: status,
            };
            return (
              <div key={status} className="p-2 bg-gray-50 dark:bg-gray-800 rounded" data-url-status={status}>
                <p className="text-[10px] text-gray-500 mb-1 font-mono truncate">{status}</p>
                <UrlCitationComponent urlMeta={meta} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Section: URL Citation Variants */}
      <section className="mb-10" data-testid="url-variants-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">URL Citation Variants</h2>
        <div className="space-y-4">
          {(["chip", "inline", "bracket"] as const).map(variant => {
            const meta: UrlCitationMeta = {
              url: "https://docs.example.com/api/v2/citations",
              domain: "docs.example.com",
              title: "Citation API Documentation",
              fetchStatus: "verified",
            };
            return (
              <div key={variant} className="p-3 bg-gray-50 dark:bg-gray-800 rounded" data-url-variant={variant}>
                <p className="text-xs text-gray-500 mb-2 font-mono">{variant}</p>
                <UrlCitationComponent urlMeta={meta} variant={variant} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Section: Inline Usage Context */}
      <section className="mb-10" data-testid="inline-context-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Inline Usage Context</h2>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300">
          <p className="leading-relaxed">
            According to the Q4 financial report, the company saw significant growth
            <CitationComponent
              citation={baseCitation}
              verification={verifiedVerification}
              variant="superscript"
            />
            with revenue increasing by 15%
            <CitationComponent
              citation={{ ...baseCitation, citationNumber: 2 }}
              verification={partialVerification}
              variant="superscript"
            />
            compared to the previous quarter. However, some claims could not be verified
            <CitationComponent
              citation={{ ...baseCitation, citationNumber: 3 }}
              verification={notFoundVerification}
              variant="superscript"
            />
            and require further review.
          </p>
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// MOBILE SHOWCASE COMPONENT
// =============================================================================

function MobileShowcase() {
  return (
    <div className="p-4 bg-white dark:bg-gray-900 min-h-screen" data-testid="mobile-showcase">
      <h1 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Mobile View</h1>

      {/* Compact variants for mobile */}
      <section className="mb-6" data-testid="mobile-variants">
        <h2 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">Citation Variants</h2>
        <div className="space-y-2">
          {(["brackets", "chip", "superscript", "minimal"] as const).map(variant => (
            <div key={variant} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded" data-mobile-variant={variant}>
              <span className="text-xs text-gray-500 w-20 font-mono">{variant}</span>
              <CitationComponent
                citation={baseCitation}
                verification={verifiedVerification}
                variant={variant}
              />
            </div>
          ))}
        </div>
      </section>

      {/* URL citations mobile */}
      <section className="mb-6" data-testid="mobile-urls">
        <h2 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">URL Citations</h2>
        <div className="space-y-2">
          {(["verified", "blocked_login", "error_not_found"] as const).map(status => {
            const meta: UrlCitationMeta = {
              url: `https://very-long-domain-name.example.com/path/to/article/${status}`,
              fetchStatus: status,
            };
            return (
              <div key={status} className="p-2 bg-gray-50 dark:bg-gray-800 rounded" data-mobile-url={status}>
                <UrlCitationComponent urlMeta={meta} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Inline text on mobile */}
      <section data-testid="mobile-inline">
        <h2 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">Inline Text</h2>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300">
          <p>
            The report shows growth
            <CitationComponent citation={baseCitation} verification={verifiedVerification} variant="superscript" />
            but some data is unverified
            <CitationComponent citation={{ ...baseCitation, citationNumber: 2 }} verification={notFoundVerification} variant="superscript" />.
          </p>
        </div>
      </section>
    </div>
  );
}

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
