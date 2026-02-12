import { describe, expect, it } from "@jest/globals";
import { generateCitationKey } from "../../react/utils.js";
import { renderCitationsAsHtml } from "../../rendering/html/htmlRenderer.js";
import type { Verification } from "../../types/verification.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const simpleInput = `Revenue grew 45%<cite attachment_id='abc123' page_number='3' full_phrase='Revenue grew 45% in Q4.' anchor_text='grew 45%' line_ids='12,13' /> according to reports.`;

const verifiedVerification: Verification = {
  status: "found",
  document: {
    verifiedPageNumber: 3,
  },
  label: "Q4 Report",
};

const notFoundVerification: Verification = {
  status: "not_found",
};

// =============================================================================
// TESTS
// =============================================================================

describe("renderCitationsAsHtml", () => {
  it("renders citations with brackets variant (default)", () => {
    const output = renderCitationsAsHtml(simpleInput);
    expect(output.html).toContain("dc-citation");
    expect(output.html).toContain("dc-pending");
    expect(output.html).toContain("[1");
    expect(output.html).toContain("Revenue grew 45%");
    expect(output.citations).toHaveLength(1);
  });

  it("includes style block by default", () => {
    const output = renderCitationsAsHtml(simpleInput);
    expect(output.styles).toBeDefined();
    expect(output.styles).toContain("<style>");
    expect(output.full).toContain("<style>");
  });

  it("renders without styles when includeStyles is false", () => {
    const output = renderCitationsAsHtml(simpleInput, { includeStyles: false });
    expect(output.styles).toBeUndefined();
  });

  it("renders linter variant", () => {
    const output = renderCitationsAsHtml(simpleInput, { variant: "linter" });
    expect(output.html).toContain("dc-linter");
    expect(output.html).toContain("grew 45%");
  });

  it("renders chip variant", () => {
    const output = renderCitationsAsHtml(simpleInput, { variant: "chip" });
    expect(output.html).toContain("dc-chip");
  });

  it("renders superscript variant", () => {
    const output = renderCitationsAsHtml(simpleInput, { variant: "superscript" });
    expect(output.html).toContain("¹");
  });

  it("includes tooltips by default", () => {
    const output = renderCitationsAsHtml(simpleInput);
    expect(output.html).toContain("dc-tooltip");
    expect(output.html).toContain("dc-tooltip-status");
  });

  it("excludes tooltips when includeTooltips is false", () => {
    const output = renderCitationsAsHtml(simpleInput, { includeTooltips: false });
    expect(output.html).not.toContain("dc-tooltip");
  });

  it("adds proof URLs as links and data attributes", () => {
    const output = renderCitationsAsHtml(simpleInput, {
      proofBaseUrl: "https://proof.deepcitation.com",
    });
    expect(output.html).toContain("data-proof-url=");
    expect(output.html).toContain('target="_blank"');
    expect(output.proofUrls).toBeDefined();
  });

  it("adds data-citation-key attribute", () => {
    const output = renderCitationsAsHtml(simpleInput);
    expect(output.html).toContain("data-citation-key=");
  });

  it("uses custom class prefix", () => {
    const output = renderCitationsAsHtml(simpleInput, { classPrefix: "my-" });
    expect(output.html).toContain("my-citation");
    expect(output.html).toContain("my-pending");
  });

  it("generates dark theme styles", () => {
    const output = renderCitationsAsHtml(simpleInput, { theme: "dark" });
    expect(output.styles).toContain("#4ade80"); // dark mode green
  });

  it("generates auto theme styles with media query", () => {
    const output = renderCitationsAsHtml(simpleInput, { theme: "auto" });
    expect(output.styles).toContain("prefers-color-scheme: dark");
  });

  it("includes sources section when requested", () => {
    const output = renderCitationsAsHtml(simpleInput, {
      includeSources: true,
    });
    expect(output.sources).toContain("dc-sources");
    expect(output.sources).toContain("<h3>Sources</h3>");
  });

  it("renders with verified status", () => {
    const citation = {
      attachmentId: "abc123",
      pageNumber: 3,
      fullPhrase: "Revenue grew 45% in Q4.",
      anchorText: "grew 45%",
      lineIds: [12, 13],
    };
    const key = generateCitationKey(citation);
    const output = renderCitationsAsHtml(simpleInput, {
      verifications: { [key]: verifiedVerification },
    });
    expect(output.html).toContain("dc-verified");
    expect(output.html).toContain("✓");
  });

  it("renders with not_found status", () => {
    const citation = {
      attachmentId: "abc123",
      pageNumber: 3,
      fullPhrase: "Revenue grew 45% in Q4.",
      anchorText: "grew 45%",
      lineIds: [12, 13],
    };
    const key = generateCitationKey(citation);
    const output = renderCitationsAsHtml(simpleInput, {
      verifications: { [key]: notFoundVerification },
    });
    expect(output.html).toContain("dc-not-found");
    expect(output.html).toContain("✗");
  });

  it("returns correct structure", () => {
    const output = renderCitationsAsHtml(simpleInput);
    expect(output).toHaveProperty("content");
    expect(output).toHaveProperty("html");
    expect(output).toHaveProperty("full");
    expect(output).toHaveProperty("citations");
    expect(output.content).toBe(output.html);
  });

  it("escapes HTML in tooltip quote text", () => {
    const input = `Test<cite attachment_id='abc123' page_number='1' full_phrase='Revenue &amp; Growth' anchor_text='safe' /> end.`;
    const output = renderCitationsAsHtml(input);
    // The tooltip quote should HTML-escape the ampersand
    expect(output.html).toContain("Revenue &amp;amp; Growth");
  });
});
