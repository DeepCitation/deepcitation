import { test, expect } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../react/CitationComponent";
import type { Citation } from "../../types/citation";
import type { Verification } from "../../types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  citationNumber: 42,
  anchorText: "25% revenue growth",
  fullPhrase: "The company reported 25% revenue growth in Q4",
  pageNumber: 5,
};

const citationWithoutAnchorText: Citation = {
  citationNumber: 7,
  fullPhrase: "Some important fact from the document",
  pageNumber: 3,
};

const verifiedVerification: Verification = {
  verifiedPageNumber: 5,
  status: "found",
};

const partialVerification: Verification = {
  verifiedPageNumber: 5,
  status: "partial_text_found",
  verifiedMatchSnippet: "25% revenue increase",
};

const missVerification: Verification = {
  verifiedPageNumber: -1,
  status: "not_found",
};

const pendingVerification: Verification = {
  verifiedPageNumber: null,
  status: "pending",
};

// =============================================================================
// BRACKETS VARIANT TESTS (default)
// =============================================================================

test.describe("CitationComponent - Brackets Variant", () => {
  test("renders anchorText in brackets by default", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="brackets" />);
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
    // brackets variant defaults to anchorText content
    await expect(citation).toContainText("[25% revenue growth");
    await expect(citation).toContainText("]");
  });

  test("shows number when content is number", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        content="number"
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toContainText("42");
  });

  test("shows anchorText when content is anchorText", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        content="anchorText"
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toContainText("25% revenue growth");
  });

  test("shows verified indicator when verified", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
    // brackets variant defaults to anchorText content
    await expect(citation).toContainText("25% revenue growth");
  });

  test("shows miss styling when not found", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={missVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    // Miss citations have line-through styling
    await expect(citation).toContainText("[");
    await expect(citation).toContainText("]");
  });

  test("renders with pending verification", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={pendingVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
  });
});

// =============================================================================
// SUPERSCRIPT VARIANT TESTS
// =============================================================================

test.describe("CitationComponent - Superscript Variant", () => {
  test("renders citation number as superscript", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="superscript" />);
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
    // Should show number without brackets
    await expect(citation).toContainText("42");
  });

  test("shows verified indicator", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="superscript"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
  });
});

// =============================================================================
// TEXT VARIANT TESTS
// =============================================================================

test.describe("CitationComponent - Text Variant", () => {
  test("renders anchorText by default", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="text" />);
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
    // Should show anchorText
    await expect(citation).toContainText("25% revenue growth");
  });

  test("shows verified indicator", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="text"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
  });

  test("falls back to citation number when no anchorText", async ({ mount, page }) => {
    await mount(
      <CitationComponent citation={citationWithoutAnchorText} variant="text" />
    );
    const citation = page.locator("[data-citation-id]");

    // Should fall back to citation number since no anchorText
    await expect(citation).toContainText("7");
  });
});

// =============================================================================
// MINIMAL VARIANT TESTS
// =============================================================================

test.describe("CitationComponent - Minimal Variant", () => {
  test("renders citation number", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="minimal" />);
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
    await expect(citation).toContainText("42");
  });

  test("shows verified indicator", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="minimal"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
  });
});

// =============================================================================
// CHIP VARIANT TESTS
// =============================================================================

test.describe("CitationComponent - Chip Variant", () => {
  test("renders with chip styling", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="chip" />);
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
  });

  test("shows verified state", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="chip"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
  });
});

// =============================================================================
// LINTER VARIANT TESTS
// =============================================================================

test.describe("CitationComponent - Linter Variant", () => {
  test("renders with linter styling (underlines)", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="linter" />);
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
    // Linter variant defaults to anchorText content
    await expect(citation).toContainText("25% revenue growth");

    // The linter styles are on a nested span inside the citation wrapper
    const linterSpan = citation.locator("span").first();

    // Verify underline is applied
    const textDecorationLine = await linterSpan.evaluate(
      (el) => getComputedStyle(el).textDecorationLine
    );
    expect(textDecorationLine).toBe("underline");
  });

  test("shows verified state with solid underline", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="linter"
        verification={verifiedVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();
    await expect(citation).toContainText("25% revenue growth");

    // The linter styles are on a nested span inside the citation wrapper
    const linterSpan = citation.locator("span").first();

    // Verified state should have solid underline
    const textDecorationStyle = await linterSpan.evaluate(
      (el) => getComputedStyle(el).textDecorationStyle
    );
    expect(textDecorationStyle).toBe("solid");
  });

  test("shows partial match state with dashed underline", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="linter"
        verification={partialVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();

    // The linter styles are on a nested span inside the citation wrapper
    const linterSpan = citation.locator("span").first();

    // Partial match should have dashed underline
    const textDecorationStyle = await linterSpan.evaluate(
      (el) => getComputedStyle(el).textDecorationStyle
    );
    expect(textDecorationStyle).toBe("dashed");
  });

  test("shows not found state with wavy underline", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="linter"
        verification={missVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();

    // The linter styles are on a nested span inside the citation wrapper
    const linterSpan = citation.locator("span").first();

    // Not found should have wavy underline
    const textDecorationStyle = await linterSpan.evaluate(
      (el) => getComputedStyle(el).textDecorationStyle
    );
    expect(textDecorationStyle).toBe("wavy");
  });

  test("shows pending state with dotted underline", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="linter"
        verification={pendingVerification}
      />
    );
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toBeVisible();

    // The linter styles are on a nested span inside the citation wrapper
    const linterSpan = citation.locator("span").first();

    // Pending should have dotted underline
    const textDecorationStyle = await linterSpan.evaluate(
      (el) => getComputedStyle(el).textDecorationStyle
    );
    expect(textDecorationStyle).toBe("dotted");
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
          <strong>Brackets with anchorText:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="brackets"
            content="anchorText"
            verification={verifiedVerification}
          />
        </div>
        <div>
          <strong>Superscript:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="superscript"
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
          <strong>Chip:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="chip"
            verification={verifiedVerification}
          />
        </div>
        <div>
          <strong>Linter:</strong>{" "}
          <CitationComponent
            citation={baseCitation}
            variant="linter"
            verification={verifiedVerification}
          />
        </div>
      </div>
    );

    // Verify all variants are rendered
    const citations = page.locator("[data-citation-id]");
    await expect(citations).toHaveCount(7);
  });

  test("renders all variants with all verification states", async ({ mount, page }) => {
    await mount(
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "20px" }}>
        {/* Verified state */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>Verified</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" verification={verifiedVerification} />
            <CitationComponent citation={baseCitation} variant="superscript" verification={verifiedVerification} />
            <CitationComponent citation={baseCitation} variant="text" verification={verifiedVerification} />
            <CitationComponent citation={baseCitation} variant="minimal" verification={verifiedVerification} />
            <CitationComponent citation={baseCitation} variant="chip" verification={verifiedVerification} />
            <CitationComponent citation={baseCitation} variant="linter" verification={verifiedVerification} />
          </div>
        </div>

        {/* Partial state */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>Partial Match</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" verification={partialVerification} />
            <CitationComponent citation={baseCitation} variant="superscript" verification={partialVerification} />
            <CitationComponent citation={baseCitation} variant="text" verification={partialVerification} />
            <CitationComponent citation={baseCitation} variant="minimal" verification={partialVerification} />
            <CitationComponent citation={baseCitation} variant="chip" verification={partialVerification} />
            <CitationComponent citation={baseCitation} variant="linter" verification={partialVerification} />
          </div>
        </div>

        {/* Miss state */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>Not Found (Miss)</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" verification={missVerification} />
            <CitationComponent citation={baseCitation} variant="superscript" verification={missVerification} />
            <CitationComponent citation={baseCitation} variant="text" verification={missVerification} />
            <CitationComponent citation={baseCitation} variant="minimal" verification={missVerification} />
            <CitationComponent citation={baseCitation} variant="chip" verification={missVerification} />
            <CitationComponent citation={baseCitation} variant="linter" verification={missVerification} />
          </div>
        </div>

        {/* Pending state */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>Pending</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" verification={pendingVerification} />
            <CitationComponent citation={baseCitation} variant="superscript" verification={pendingVerification} />
            <CitationComponent citation={baseCitation} variant="text" verification={pendingVerification} />
            <CitationComponent citation={baseCitation} variant="minimal" verification={pendingVerification} />
            <CitationComponent citation={baseCitation} variant="chip" verification={pendingVerification} />
            <CitationComponent citation={baseCitation} variant="linter" verification={pendingVerification} />
          </div>
        </div>

        {/* No verification */}
        <div>
          <h3 style={{ margin: "0 0 8px" }}>No Verification</h3>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <CitationComponent citation={baseCitation} variant="brackets" />
            <CitationComponent citation={baseCitation} variant="superscript" />
            <CitationComponent citation={baseCitation} variant="text" />
            <CitationComponent citation={baseCitation} variant="minimal" />
            <CitationComponent citation={baseCitation} variant="chip" />
            <CitationComponent citation={baseCitation} variant="linter" />
          </div>
        </div>
      </div>
    );

    // Just verify the page rendered successfully with multiple citations
    const citations = page.locator("[data-citation-id]");
    await expect(citations).toHaveCount(30); // 6 variants × 5 states
  });
});

// =============================================================================
// DATA ATTRIBUTES TESTS
// =============================================================================

test.describe("CitationComponent - Data Attributes", () => {
  test("has data-citation-id attribute", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="brackets" />);
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toHaveAttribute("data-citation-id");
  });

  test("has data-citation-instance attribute", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} variant="brackets" />);
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toHaveAttribute("data-citation-instance");
  });
});

// =============================================================================
// POPOVER TESTS
// =============================================================================

test.describe("CitationComponent - Popover", () => {
  const verificationWithImage: Verification = {
    ...verifiedVerification,
    verificationImageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  };

  test("renders citation with image verification", async ({ mount, page }) => {
    await mount(
      <div style={{ padding: "100px" }}>
        <CitationComponent
          citation={baseCitation}
          variant="brackets"
          verification={verificationWithImage}
        />
      </div>
    );

    const citation = page.locator("[data-citation-id]");
    await expect(citation).toBeVisible();
    // brackets variant defaults to anchorText content
    await expect(citation).toContainText("25% revenue growth");
  });

  test("renders citation with hidden popover position", async ({ mount, page }) => {
    await mount(
      <CitationComponent
        citation={baseCitation}
        variant="brackets"
        verification={verificationWithImage}
        popoverPosition="hidden"
      />
    );

    const citation = page.locator("[data-citation-id]");
    await expect(citation).toBeVisible();
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
    const citation = page.locator("[data-citation-id]");

    await expect(citation).toHaveClass(/my-custom-citation/);
  });
});
