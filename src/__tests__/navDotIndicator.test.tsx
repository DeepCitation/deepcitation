import { afterEach, describe, expect, it, mock } from "bun:test";
import type React from "react";

mock.module("react-dom", () => {
  const actual = require("react-dom");
  return { ...actual, createPortal: (node: React.ReactNode) => node };
});

import { cleanup, render } from "@testing-library/react";
import { CitationComponent } from "../react/Citation";
import type { Citation } from "../types/citation";
import type { Verification } from "../types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  type: "document",
  attachmentId: "test-123",
  pageNumber: 1,
  lineIds: [5],
  sourceContext: "Revenue grew 45% in Q4.",
  sourceMatch: "grew 45%",
  citationNumber: 7,
};

const verifiedVerification: Verification = { status: "found" };
const missVerification: Verification = { status: "not_found" };

describe("nav-dot Indicator Variant", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a neutral nav dot with no verification record", () => {
    const { container } = render(<CitationComponent citation={baseCitation} indicatorVariant="nav-dot" />);
    const navDot = container.querySelector('[data-dc-indicator="nav"]');
    expect(navDot).toBeInTheDocument();
    expect(navDot?.getAttribute("role")).toBe("img");
    expect(navDot?.getAttribute("aria-label")).toBe("Jump to form section");
  });

  it("renders the nav dot regardless of verification status (verified)", () => {
    const { container } = render(
      <CitationComponent citation={baseCitation} verification={verifiedVerification} indicatorVariant="nav-dot" />,
    );
    expect(container.querySelector('[data-dc-indicator="nav"]')).toBeInTheDocument();
    // No verified status glyph should be rendered for nav-dot.
    expect(container.querySelector('[data-dc-indicator="verified"]')).not.toBeInTheDocument();
  });

  it("renders the nav dot regardless of verification status (miss)", () => {
    const { container } = render(
      <CitationComponent citation={baseCitation} verification={missVerification} indicatorVariant="nav-dot" />,
    );
    expect(container.querySelector('[data-dc-indicator="nav"]')).toBeInTheDocument();
  });

  it("renders the nav dot in superscript indicator-only mode", () => {
    const { container } = render(
      <CitationComponent
        citation={baseCitation}
        indicatorVariant="nav-dot"
        variant="superscript"
        content="indicator"
      />,
    );
    expect(container.querySelector('[data-dc-indicator="nav"]')).toBeInTheDocument();
  });

  it("renders the nav dot in footnote indicator-only mode", () => {
    const { container } = render(
      <CitationComponent citation={baseCitation} indicatorVariant="nav-dot" variant="footnote" content="indicator" />,
    );
    expect(container.querySelector('[data-dc-indicator="nav"]')).toBeInTheDocument();
  });
});

describe("Empty footnote marker fallback", () => {
  afterEach(() => {
    cleanup();
  });

  it("falls back to the citation number when superscript indicator-only has no status glyph", () => {
    const { container } = render(
      <CitationComponent citation={baseCitation} variant="superscript" content="indicator" />,
    );
    const sup = container.querySelector("sup");
    expect(sup).toBeInTheDocument();
    expect(sup?.textContent).toContain("7");
  });

  it("falls back to the citation number when footnote indicator-only has no status glyph", () => {
    const { container } = render(<CitationComponent citation={baseCitation} variant="footnote" content="indicator" />);
    const sup = container.querySelector("sup");
    expect(sup).toBeInTheDocument();
    expect(sup?.textContent).toContain("7");
  });
});
