import { test, expect } from "@playwright/experimental-ct-react";
import {
  ChipCitation,
  SuperscriptCitation,
  FootnoteCitation,
  InlineCitation,
  MinimalCitation,
  CitationVariantFactory,
} from "../../react/CitationVariants";
import type { Citation } from "../../types/citation";
import type { Verification } from "../../types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  citationNumber: 1,
  fullPhrase: "This is a test citation",
  anchorText: "Test Value",
  pageNumber: 5,
};

const verification: Verification = {
  label: "test",
  verifiedPageNumber: 5,
  status: "found",
};

const missFoundCitation: Verification = {
  label: "test",
  verifiedPageNumber: -1, // NOT_FOUND_VERIFICATION_INDEX
  status: "not_found",
};

const partialFoundCitation: Verification = {
  label: "test",
  verifiedPageNumber: 5,
  status: "partial_text_found",
};

const pendingFoundCitation: Verification = {
  label: "test",
  verifiedPageNumber: null,
  status: "pending",
};

// =============================================================================
// CHIP CITATION TESTS
// =============================================================================

test.describe("ChipCitation", () => {
  test("renders with default props", async ({ mount, page }) => {
    await mount(<ChipCitation citation={baseCitation} />);
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("data-variant", "chip");
    // ChipCitation shows anchorText by default (via getCitationDisplayText)
    await expect(chip).toContainText("Test Value");
  });

  test("renders with verified state", async ({ mount, page }) => {
    await mount(
      <ChipCitation citation={baseCitation} verification={verification} />
    );
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toHaveClass(/text-green-600/);
    // Verified indicator is a checkmark
    const text = await chip.textContent();
    expect(text).toContain("✓");
  });

  test("renders with miss state", async ({ mount, page }) => {
    await mount(
      <ChipCitation citation={baseCitation} verification={missFoundCitation} />
    );
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toHaveClass(/text-red-/);
    await expect(chip).toHaveClass(/line-through/);
  });

  test("renders with partial match state", async ({ mount, page }) => {
    await mount(
      <ChipCitation
        citation={baseCitation}
        verification={partialFoundCitation}
      />
    );
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toHaveClass(/text-amber-/);
    // Partial indicator is an asterisk rendered in an aria-hidden span
    const text = await chip.textContent();
    expect(text).toContain("*");
  });

  test("renders with pending state", async ({ mount, page }) => {
    await mount(
      <ChipCitation
        citation={baseCitation}
        verification={pendingFoundCitation}
      />
    );
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toHaveClass(/text-gray-/);
    await expect(chip.locator(".opacity-70")).toBeVisible();
  });

  test("renders small size", async ({ mount, page }) => {
    await mount(<ChipCitation citation={baseCitation} size="sm" />);
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toHaveClass(/text-xs/);
  });

  test("renders large size", async ({ mount, page }) => {
    await mount(<ChipCitation citation={baseCitation} size="lg" />);
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toHaveClass(/text-base/);
  });

  test("shows icon when showIcon is true", async ({ mount, page }) => {
    await mount(<ChipCitation citation={baseCitation} showIcon={true} />);
    const chip = page.locator('[data-variant="chip"]');

    // Icon is rendered as emoji in a span
    const text = await chip.textContent();
    expect(text).toContain("📄");
  });

  test("renders anchorText text by default", async ({ mount, page }) => {
    await mount(<ChipCitation citation={baseCitation} />);
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toContainText("Test Value");
  });

  test("renders children before citation", async ({ mount, page }) => {
    await mount(
      <ChipCitation citation={baseCitation}>
        <span data-testid="child">Before text</span>
      </ChipCitation>
    );

    await expect(page.locator('[data-testid="child"]')).toBeVisible();
    await expect(page.locator('[data-testid="child"]')).toContainText(
      "Before text"
    );
  });
});

// =============================================================================
// SUPERSCRIPT CITATION TESTS
// =============================================================================

test.describe("SuperscriptCitation", () => {
  test("renders as superscript element", async ({ mount, page }) => {
    await mount(<SuperscriptCitation citation={baseCitation} />);
    const sup = page.locator('[data-variant="superscript"]');

    await expect(sup).toBeVisible();
    await expect(sup).toHaveAttribute("data-variant", "superscript");
    const tagName = await sup.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe("sup");
  });

  test("renders with verified state", async ({ mount, page }) => {
    await mount(
      <SuperscriptCitation
        citation={baseCitation}
        verification={verification}
      />
    );
    const sup = page.locator('[data-variant="superscript"]');

    await expect(sup).toHaveClass(/text-green-/);
  });

  test("renders with brackets when hideBrackets is false", async ({
    mount,
    page,
  }) => {
    await mount(
      <SuperscriptCitation
        citation={baseCitation}
        hideBrackets={false}
        verification={verification}
      />
    );
    const sup = page.locator('[data-variant="superscript"]');

    // Contains [1 and ] with verified indicator in between
    const text = await sup.textContent();
    expect(text).toMatch(/^\[1.*\]$/); // Starts with [ and ends with ]
  });

  test("renders with brackets by default", async ({ mount, page }) => {
    // Default is hideBrackets=false, meaning brackets ARE shown
    await mount(<SuperscriptCitation citation={baseCitation} />);
    const sup = page.locator('[data-variant="superscript"]');

    const text = await sup.textContent();
    expect(text).toContain("[");
    expect(text).toContain("]");
  });

  test("renders without brackets when hideBrackets is true", async ({ mount, page }) => {
    await mount(<SuperscriptCitation citation={baseCitation} hideBrackets={true} />);
    const sup = page.locator('[data-variant="superscript"]');

    const text = await sup.textContent();
    expect(text).not.toContain("[");
    expect(text).not.toContain("]");
  });

  test("renders with miss state", async ({ mount, page }) => {
    await mount(
      <SuperscriptCitation
        citation={baseCitation}
        verification={missFoundCitation}
      />
    );
    const sup = page.locator('[data-variant="superscript"]');

    await expect(sup).toHaveClass(/text-red-/);
    await expect(sup).toHaveClass(/line-through/);
  });
});

// =============================================================================
// FOOTNOTE CITATION TESTS
// =============================================================================

test.describe("FootnoteCitation", () => {
  test("renders as superscript element", async ({ mount, page }) => {
    await mount(<FootnoteCitation citation={baseCitation} />);
    const footnote = page.locator('[data-variant="footnote"]');

    await expect(footnote).toBeVisible();
    await expect(footnote).toHaveAttribute("data-variant", "footnote");
    const tagName = await footnote.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe("sup");
  });

  test("renders number by default", async ({ mount, page }) => {
    await mount(
      <FootnoteCitation citation={baseCitation} symbolStyle="number" />
    );
    const footnote = page.locator('[data-variant="footnote"]');

    await expect(footnote).toContainText("1");
  });

  test("renders asterisk symbol", async ({ mount, page }) => {
    await mount(
      <FootnoteCitation citation={baseCitation} symbolStyle="asterisk" />
    );
    const footnote = page.locator('[data-variant="footnote"]');

    await expect(footnote).toContainText("*");
  });

  test("renders custom symbol", async ({ mount, page }) => {
    await mount(
      <FootnoteCitation
        citation={baseCitation}
        symbolStyle="custom"
        customSymbol="§"
      />
    );
    const footnote = page.locator('[data-variant="footnote"]');

    await expect(footnote).toContainText("§");
  });

  test("renders with verified state", async ({ mount, page }) => {
    await mount(
      <FootnoteCitation citation={baseCitation} verification={verification} />
    );
    const footnote = page.locator('[data-variant="footnote"]');

    await expect(footnote).toHaveClass(/text-green-/);
  });
});

// =============================================================================
// INLINE CITATION TESTS
// =============================================================================

test.describe("InlineCitation", () => {
  test("renders inline element", async ({ mount, page }) => {
    await mount(<InlineCitation citation={baseCitation} />);
    const inline = page.locator('[data-variant="inline"]');

    await expect(inline).toBeVisible();
    await expect(inline).toHaveAttribute("data-variant", "inline");
  });

  test("renders with dotted underline by default", async ({ mount, page }) => {
    await mount(<InlineCitation citation={baseCitation} />);
    const inline = page.locator('[data-variant="inline"]');

    await expect(inline).toHaveClass(/border-dotted/);
  });

  test("renders with solid underline", async ({ mount, page }) => {
    await mount(
      <InlineCitation citation={baseCitation} underlineStyle="solid" />
    );
    const inline = page.locator('[data-variant="inline"]');

    await expect(inline).toHaveClass(/border-b/);
    await expect(inline).not.toHaveClass(/border-dotted/);
    await expect(inline).not.toHaveClass(/border-dashed/);
  });

  test("renders with dashed underline", async ({ mount, page }) => {
    await mount(
      <InlineCitation citation={baseCitation} underlineStyle="dashed" />
    );
    const inline = page.locator('[data-variant="inline"]');

    await expect(inline).toHaveClass(/border-dashed/);
  });

  test("renders anchorText text by default", async ({ mount, page }) => {
    await mount(<InlineCitation citation={baseCitation} />);
    const inline = page.locator('[data-variant="inline"]');

    // InlineCitation shows anchorText by default
    await expect(inline).toContainText("Test Value");
  });

  test("renders with verified state", async ({ mount, page }) => {
    await mount(
      <InlineCitation citation={baseCitation} verification={verification} />
    );
    const inline = page.locator('[data-variant="inline"]');

    await expect(inline).toHaveClass(/text-green-/);
  });

  test("renders with pending indicator", async ({ mount, page }) => {
    await mount(
      <InlineCitation
        citation={baseCitation}
        verification={pendingFoundCitation}
      />
    );
    const inline = page.locator('[data-variant="inline"]');

    await expect(inline).toHaveClass(/text-gray-/);
    await expect(inline.locator(".opacity-70")).toBeVisible();
  });
});

// =============================================================================
// MINIMAL CITATION TESTS
// =============================================================================

test.describe("MinimalCitation", () => {
  test("renders minimal element", async ({ mount, page }) => {
    await mount(<MinimalCitation citation={baseCitation} />);
    const minimal = page.locator('[data-variant="minimal"]');

    await expect(minimal).toBeVisible();
    await expect(minimal).toHaveAttribute("data-variant", "minimal");
    await expect(minimal).toContainText("1");
  });

  test("renders with verified state", async ({ mount, page }) => {
    await mount(
      <MinimalCitation citation={baseCitation} verification={verification} />
    );
    const minimal = page.locator('[data-variant="minimal"]');

    await expect(minimal).toHaveClass(/text-green-/);
  });

  test("shows status indicator by default", async ({ mount, page }) => {
    await mount(
      <MinimalCitation citation={baseCitation} verification={verification} />
    );
    const minimal = page.locator('[data-variant="minimal"]');

    const text = await minimal.textContent();
    expect(text).toContain("✓");
  });

  test("hides status indicator when showStatusIndicator is false", async ({
    mount,
    page,
  }) => {
    await mount(
      <MinimalCitation
        citation={baseCitation}
        verification={verification}
        showStatusIndicator={false}
      />
    );
    const minimal = page.locator('[data-variant="minimal"]');

    const text = await minimal.textContent();
    expect(text).not.toContain("✓");
  });

  test("renders with miss state", async ({ mount, page }) => {
    await mount(
      <MinimalCitation
        citation={baseCitation}
        verification={missFoundCitation}
      />
    );
    const minimal = page.locator('[data-variant="minimal"]');

    await expect(minimal).toHaveClass(/text-red-/);
    await expect(minimal).toHaveClass(/line-through/);
  });
});

// =============================================================================
// CITATION VARIANT FACTORY TESTS
// =============================================================================

test.describe("CitationVariantFactory", () => {
  test("renders chip variant", async ({ mount, page }) => {
    await mount(
      <CitationVariantFactory variant="chip" citation={baseCitation} />
    );
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toBeVisible();
  });

  test("renders superscript variant", async ({ mount, page }) => {
    await mount(
      <CitationVariantFactory variant="superscript" citation={baseCitation} />
    );
    const sup = page.locator('[data-variant="superscript"]');

    await expect(sup).toHaveAttribute("data-variant", "superscript");
  });

  test("renders footnote variant", async ({ mount, page }) => {
    await mount(
      <CitationVariantFactory variant="footnote" citation={baseCitation} />
    );
    const footnote = page.locator('[data-variant="footnote"]');

    await expect(footnote).toHaveAttribute("data-variant", "footnote");
  });

  test("renders inline variant", async ({ mount, page }) => {
    await mount(
      <CitationVariantFactory variant="inline" citation={baseCitation} />
    );
    const inline = page.locator('[data-variant="inline"]');

    await expect(inline).toHaveAttribute("data-variant", "inline");
  });

  test("renders minimal variant", async ({ mount, page }) => {
    await mount(
      <CitationVariantFactory variant="minimal" citation={baseCitation} />
    );
    const minimal = page.locator('[data-variant="minimal"]');

    await expect(minimal).toHaveAttribute("data-variant", "minimal");
  });

  test("passes variant-specific props", async ({ mount, page }) => {
    await mount(
      <CitationVariantFactory
        variant="chip"
        citation={baseCitation}
        chipProps={{ size: "lg" }}
      />
    );
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toHaveClass(/text-base/);
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

test.describe("Accessibility", () => {
  test("chip citation has aria-label", async ({ mount, page }) => {
    await mount(<ChipCitation citation={baseCitation} />);
    const chip = page.locator('[data-variant="chip"]');

    // ChipCitation shows anchorText by default, so aria-label uses anchorText
    await expect(chip).toHaveAttribute("aria-label", /Citation: Test Value/);
  });

  test("superscript citation has aria-label", async ({ mount, page }) => {
    await mount(<SuperscriptCitation citation={baseCitation} />);
    const sup = page.locator('[data-variant="superscript"]');

    await expect(sup).toHaveAttribute("aria-label", /Citation 1/);
  });

  test("footnote citation has aria-label", async ({ mount, page }) => {
    await mount(<FootnoteCitation citation={baseCitation} />);
    const footnote = page.locator('[data-variant="footnote"]');

    await expect(footnote).toHaveAttribute("aria-label", /Footnote/);
  });

  test("inline citation has aria-label", async ({ mount, page }) => {
    await mount(<InlineCitation citation={baseCitation} />);
    const inline = page.locator('[data-variant="inline"]');

    await expect(inline).toHaveAttribute("aria-label", /Citation:/);
  });

  test("minimal citation has aria-label", async ({ mount, page }) => {
    await mount(<MinimalCitation citation={baseCitation} />);
    const minimal = page.locator('[data-variant="minimal"]');

    await expect(minimal).toHaveAttribute("aria-label", /Citation 1/);
  });

  test("verified icon is aria-hidden", async ({ mount, page }) => {
    await mount(
      <ChipCitation citation={baseCitation} verification={verification} />
    );
    const chip = page.locator('[data-variant="chip"]');

    // The checkmark indicator span has aria-hidden="true"
    const ariaHiddenEl = chip.locator('[aria-hidden="true"]').first();
    await expect(ariaHiddenEl).toBeVisible();
    const text = await ariaHiddenEl.textContent();
    expect(text).toContain("✓");
  });
});

// =============================================================================
// DATA ATTRIBUTES TESTS
// =============================================================================

test.describe("Data Attributes", () => {
  test("chip citation has citation-id data attribute", async ({
    mount,
    page,
  }) => {
    await mount(<ChipCitation citation={baseCitation} />);
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toHaveAttribute("data-citation-id");
  });

  test("chip citation has citation-instance data attribute", async ({
    mount,
    page,
  }) => {
    await mount(<ChipCitation citation={baseCitation} />);
    const chip = page.locator('[data-variant="chip"]');

    await expect(chip).toHaveAttribute("data-citation-instance");
  });

  test("citation-instance is unique per render", async ({ mount, page }) => {
    await mount(
      <>
        <ChipCitation citation={baseCitation} className="citation-1" />
        <ChipCitation citation={baseCitation} className="citation-2" />
      </>
    );

    const instance1 = await page
      .locator(".citation-1")
      .getAttribute("data-citation-instance");
    const instance2 = await page
      .locator(".citation-2")
      .getAttribute("data-citation-instance");

    expect(instance1).not.toEqual(instance2);
  });

  test("citation-id is same for same citation", async ({ mount, page }) => {
    await mount(
      <>
        <ChipCitation citation={baseCitation} className="citation-1" />
        <ChipCitation citation={baseCitation} className="citation-2" />
      </>
    );

    const id1 = await page
      .locator(".citation-1")
      .getAttribute("data-citation-id");
    const id2 = await page
      .locator(".citation-2")
      .getAttribute("data-citation-id");

    expect(id1).toEqual(id2);
  });
});
