import { test, expect } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../react/CitationComponent";
import type { Citation } from "../../types/citation";
import type { Verification } from "../../types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  citationNumber: 42,
  keySpan: "25% revenue growth",
  fullPhrase: "The company reported 25% revenue growth in Q4",
  pageNumber: 5,
};

const citationWithoutKeySpan: Citation = {
  citationNumber: 7,
  fullPhrase: "Some important fact from the document",
  pageNumber: 3,
};

const verifiedVerification: Verification = {
  lowerCaseSearchTerm: "25% revenue growth",
  pageNumber: 5,
  searchState: { status: "found" },
};

const partialVerification: Verification = {
  lowerCaseSearchTerm: "25% revenue",
  pageNumber: 5,
  searchState: { status: "partial_text_found" },
  matchSnippet: "25% revenue increase",
};

const missVerification: Verification = {
  lowerCaseSearchTerm: "25% revenue growth",
  pageNumber: -1,
  searchState: { status: "not_found" },
};

const pendingVerification: Verification = {
  lowerCaseSearchTerm: "25% revenue growth",
  pageNumber: null,
  searchState: { status: "pending" },
};

// =============================================================================
// BRACKETS VARIANT TESTS (default)
// =============================================================================

test.describe("CitationComponent - Brackets Variant", () => {
  test("renders citation number in brackets by default", async ({
    mount,
    page,
  }) => {
    await mount(<CitationComponent citation={baseCitation} variant="brackets" />);
    const citation = page.locator(".dc-citation");

    await expect(citation).toBeVisible();
    await expect(citation).toHaveClass(/dc-citation--brackets/);
    // Should show citation number (42) not keySpan
    await expect(citation).toContainText("[42");
    await expect(citation).toContainText("]");
  });

  test("hides keySpan when hideKeySpan is true", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        hideKeySpan={true}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toContainText("42");
    await expect(citation).not.toContainText("25% revenue growth");
  });

  test("shows verified indicator when verified", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveClass(/dc-citation--verified/);
    await expect(citation.locator(".dc-indicator--verified")).toBeVisible();
  });

  test("shows partial indicator when partial match", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={partialVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    // Partial matches still get "verified" class for text styling (blue)
    await expect(citation).toHaveClass(/dc-citation--verified/);
    await expect(citation.locator(".dc-indicator--partial")).toBeVisible();
  });

  test("shows miss styling when not found", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={missVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveClass(/dc-citation--miss/);
    // No indicator for miss
    await expect(citation.locator(".dc-indicator")).not.toBeVisible();
  });

  test("shows pending indicator when pending", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={pendingVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveClass(/dc-citation--pending/);
    await expect(citation.locator(".dc-indicator--pending")).toBeVisible();
  });
});

// =============================================================================
// NUMERIC VARIANT TESTS
// =============================================================================

test.describe("CitationComponent - Numeric Variant", () => {
  test("renders citation number without brackets", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="numeric" />);
    const citation = page.locator(".dc-citation");

    await expect(citation).toBeVisible();
    await expect(citation).toHaveClass(/dc-citation--numeric/);
    // Should show number 42, not keySpan
    await expect(citation).toContainText("42");
    // Should NOT have brackets
    await expect(citation).not.toContainText("[");
    await expect(citation).not.toContainText("]");
  });

  test("always shows citation number, ignoring hideKeySpan", async ({
    mount,
    page,
  }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="numeric"
        hideKeySpan={false}
      />
    );
    const citation = page.locator(".dc-citation");

    // Numeric variant always shows citation number regardless of hideKeySpan
    await expect(citation).toContainText("42");
    await expect(citation).not.toContainText("25% revenue growth");
  });

  test("shows verified indicator", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="numeric"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveClass(/dc-citation--verified/);
    await expect(citation.locator(".dc-indicator--verified")).toBeVisible();
  });

  test("shows partial indicator", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="numeric"
        verification={partialVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation.locator(".dc-indicator--partial")).toBeVisible();
  });

  test("shows miss styling", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="numeric"
        verification={missVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveClass(/dc-citation--miss/);
  });
});

// =============================================================================
// TEXT VARIANT TESTS
// =============================================================================

test.describe("CitationComponent - Text Variant", () => {
  test("renders keySpan without special styling", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="text" />);
    const citation = page.locator(".dc-citation");

    await expect(citation).toBeVisible();
    await expect(citation).toHaveClass(/dc-citation--text/);
    // Should show keySpan
    await expect(citation).toContainText("25% revenue growth");
    // Should NOT have brackets
    await expect(citation).not.toContainText("[");
    await expect(citation).not.toContainText("]");
  });

  test("has plain text class for no special styling", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="text" />);
    const textSpan = page.locator(".dc-citation-text--plain");

    await expect(textSpan).toBeVisible();
  });

  test("shows verified indicator", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="text"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation.locator(".dc-indicator--verified")).toBeVisible();
  });

  test("falls back to citation number when no keySpan", async ({
    mount,
    page,
  }) => {
    await mount(
      <CitationComponent citation={citationWithoutKeySpan} variant="text" />
    );
    const citation = page.locator(".dc-citation");

    // Should fall back to citation number since no keySpan
    await expect(citation).toContainText("7");
  });
});

// =============================================================================
// MINIMAL VARIANT TESTS
// =============================================================================

test.describe("CitationComponent - Minimal Variant", () => {
  test("renders keySpan without brackets", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="minimal" />);
    const citation = page.locator(".dc-citation");

    await expect(citation).toBeVisible();
    await expect(citation).toHaveClass(/dc-citation--minimal/);
    // Should show keySpan
    await expect(citation).toContainText("25% revenue growth");
    // No brackets
    await expect(citation).not.toContainText("[");
    await expect(citation).not.toContainText("]");
  });

  test("shows verified indicator", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="minimal"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation.locator(".dc-indicator--verified")).toBeVisible();
  });

  test("shows partial indicator", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="minimal"
        verification={partialVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation.locator(".dc-indicator--partial")).toBeVisible();
  });
});

// =============================================================================
// INDICATOR VARIANT TESTS
// =============================================================================

test.describe("CitationComponent - Indicator Variant", () => {
  test("renders only the indicator, no text", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="indicator"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toBeVisible();
    await expect(citation).toHaveClass(/dc-citation--indicator/);
    // Should NOT show citation number or keySpan
    await expect(citation).not.toContainText("42");
    await expect(citation).not.toContainText("25% revenue growth");
    // Should show indicator
    await expect(citation.locator(".dc-indicator--verified")).toBeVisible();
  });

  test("shows partial indicator only", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="indicator"
        verification={partialVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation.locator(".dc-indicator--partial")).toBeVisible();
    await expect(citation).not.toContainText("42");
  });

  test("shows pending indicator only", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="indicator"
        verification={pendingVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation.locator(".dc-indicator--pending")).toBeVisible();
  });

  test("shows nothing when miss (no indicator)", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="indicator"
        verification={missVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toBeVisible();
    // Miss has no indicator
    await expect(citation.locator(".dc-indicator")).not.toBeVisible();
  });
});

// =============================================================================
// ALL VARIANTS VISUAL COMPARISON
// =============================================================================

test.describe("CitationComponent - All Variants Visual", () => {
  test("renders all variants for visual comparison", async ({ mount, page }) => {
    await mount(
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px" }}>
        <div>
          <strong>Brackets (default):</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="brackets"
            verification={verifiedVerification}
          />
        </div>
        <div>
          <strong>Brackets with keySpan:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="brackets"
            hideKeySpan={false}
            verification={verifiedVerification}
          />
        </div>
        <div>
          <strong>Numeric:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="numeric"
            verification={verifiedVerification}
          />
        </div>
        <div>
          <strong>Text:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="text"
            verification={verifiedVerification}
          />
        </div>
        <div>
          <strong>Minimal:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="minimal"
            verification={verifiedVerification}
          />
        </div>
        <div>
          <strong>Indicator only:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="indicator"
            verification={verifiedVerification}
          />
        </div>
      </div>
    );

    // Verify all variants are rendered (use .first() since there are multiple of some)
    await expect(page.locator(".dc-citation--brackets").first()).toBeVisible();
    await expect(page.locator(".dc-citation--numeric").first()).toBeVisible();
    await expect(page.locator(".dc-citation--text").first()).toBeVisible();
    await expect(page.locator(".dc-citation--minimal").first()).toBeVisible();
    await expect(page.locator(".dc-citation--indicator").first()).toBeVisible();
  });

  test("renders all variants with all verification states", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "20px" }}>
        {/* Verified state */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>Verified</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" verification={verifiedVerification} />
            <CitationComponent citation={baseCitation} variant="numeric" verification={verifiedVerification} />
            <CitationComponent citation={baseCitation} variant="text" verification={verifiedVerification} />
            <CitationComponent citation={baseCitation} variant="minimal" verification={verifiedVerification} />
            <CitationComponent citation={baseCitation} variant="indicator" verification={verifiedVerification} />
          </div>
        </div>

        {/* Partial state */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>Partial Match</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" verification={partialVerification} />
            <CitationComponent citation={baseCitation} variant="numeric" verification={partialVerification} />
            <CitationComponent citation={baseCitation} variant="text" verification={partialVerification} />
            <CitationComponent citation={baseCitation} variant="minimal" verification={partialVerification} />
            <CitationComponent citation={baseCitation} variant="indicator" verification={partialVerification} />
          </div>
        </div>

        {/* Miss state */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>Not Found (Miss)</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" verification={missVerification} />
            <CitationComponent citation={baseCitation} variant="numeric" verification={missVerification} />
            <CitationComponent citation={baseCitation} variant="text" verification={missVerification} />
            <CitationComponent citation={baseCitation} variant="minimal" verification={missVerification} />
            <CitationComponent citation={baseCitation} variant="indicator" verification={missVerification} />
          </div>
        </div>

        {/* Pending state */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>Pending</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" verification={pendingVerification} />
            <CitationComponent citation={baseCitation} variant="numeric" verification={pendingVerification} />
            <CitationComponent citation={baseCitation} variant="text" verification={pendingVerification} />
            <CitationComponent citation={baseCitation} variant="minimal" verification={pendingVerification} />
            <CitationComponent citation={baseCitation} variant="indicator" verification={pendingVerification} />
          </div>
        </div>

        {/* No verification */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>No Verification</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" />
            <CitationComponent citation={baseCitation} variant="numeric" />
            <CitationComponent citation={baseCitation} variant="text" />
            <CitationComponent citation={baseCitation} variant="minimal" />
            <CitationComponent citation={baseCitation} variant="indicator" />
          </div>
        </div>
      </div>
    );

    // Just verify the page rendered successfully with multiple citations
    const citations = page.locator(".dc-citation");
    await expect(citations).toHaveCount(25); // 5 variants × 5 states
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

test.describe("CitationComponent - Accessibility", () => {
  test("has aria-label with display text", async ({ mount, page }) => {
    await mount(
      <CitationComponent citation={baseCitation} variant="brackets" />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveAttribute("aria-label", "[42]");
  });

  test("has aria-expanded attribute", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveAttribute("aria-expanded", "false");
  });

  test("indicator has aria-hidden", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verifiedVerification}
      />
    );
    const indicator = page.locator(".dc-indicator--verified");

    await expect(indicator).toHaveAttribute("aria-hidden", "true");
  });
});

// =============================================================================
// DATA ATTRIBUTES TESTS
// =============================================================================

test.describe("CitationComponent - Data Attributes", () => {
  test("has data-citation-id attribute", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="brackets" />);
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveAttribute("data-citation-id");
  });

  test("has data-citation-instance attribute", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="brackets" />);
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveAttribute("data-citation-instance");
  });

  test("has data-tooltip-expanded attribute", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveAttribute("data-tooltip-expanded", "false");
  });

  test("has data-has-image attribute", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveAttribute("data-has-image", "false");
  });
});

// =============================================================================
// POPOVER POSITION TESTS
// =============================================================================

test.describe("CitationComponent - Popover Position", () => {
  const verificationWithImage: Verification = {
    ...verifiedVerification,
    verificationImageBase64: "data:image/png;base64,iVBORw0KGgo=",
  };

  test("renders popover with top position by default", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verificationWithImage}
      />
    );

    // Popover is hidden by CSS until hover, but element should exist
    const popover = page.locator(".dc-popover");
    await expect(popover).toBeAttached();
    // Default is top, so no --bottom class
    await expect(popover).not.toHaveClass(/dc-popover--bottom/);
  });

  test("renders popover with bottom position class", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verificationWithImage}
        popoverPosition="bottom"
      />
    );

    const popover = page.locator(".dc-popover");
    await expect(popover).toBeAttached();
    await expect(popover).toHaveClass(/dc-popover--bottom/);
  });

  test("shows popover on hover", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verificationWithImage}
      />
    );

    const citation = page.locator(".dc-citation");
    const popover = page.locator(".dc-popover");

    // Hover to show popover
    await citation.hover();
    await expect(popover).toBeVisible();
  });

  test("does not render popover when position is hidden", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verificationWithImage}
        popoverPosition="hidden"
      />
    );

    const popover = page.locator(".dc-popover");
    // Popover should not exist in DOM when hidden
    await expect(popover).not.toBeAttached();
  });
});

// =============================================================================
// CHILDREN RENDERING TESTS
// =============================================================================

test.describe("CitationComponent - Children", () => {
  test("renders children before citation", async ({ mount, page }) => {
    await mount(
      <CitationComponent citation={baseCitation} variant="brackets">
        <span data-testid="prefix">Source: </span>
      </CitationComponent>
    );

    await expect(page.locator('[data-testid="prefix"]')).toBeVisible();
    await expect(page.locator('[data-testid="prefix"]')).toContainText("Source:");
  });
});

// =============================================================================
// CUSTOM CLASS NAME TESTS
// =============================================================================

test.describe("CitationComponent - Custom ClassName", () => {
  test("applies custom className", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        className="my-custom-citation"
      />
    );
    const citation = page.locator(".dc-citation");

    await expect(citation).toHaveClass(/my-custom-citation/);
  });
});
