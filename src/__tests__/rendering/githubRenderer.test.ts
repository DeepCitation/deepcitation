import { describe, expect, it } from "@jest/globals";
import { renderCitationsForGitHub } from "../../rendering/github/githubRenderer.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const simpleInput = `Revenue grew 45%<cite attachment_id='abc123' page_number='3' full_phrase='Revenue grew 45% in Q4.' anchor_text='grew 45%' line_ids='12,13' /> according to reports.`;

const multiCitationInput = `First claim<cite attachment_id='abc123' page_number='1' full_phrase='First fact.' anchor_text='First' />.
Second claim<cite attachment_id='abc123' page_number='2' full_phrase='Second fact.' anchor_text='Second' />.`;

// =============================================================================
// TESTS
// =============================================================================

describe("renderCitationsForGitHub", () => {
  it("renders citations with brackets variant (default)", () => {
    const output = renderCitationsForGitHub(simpleInput);
    expect(output.markdown).toContain("[1◌]");
    expect(output.markdown).toContain("Revenue grew 45%");
    expect(output.citations).toHaveLength(1);
  });

  it("renders with proof URLs as markdown links", () => {
    const output = renderCitationsForGitHub(simpleInput, {
      proofBaseUrl: "https://proof.deepcitation.com",
    });
    expect(output.markdown).toContain("](https://proof.deepcitation.com/p/");
    expect(output.proofUrls).toBeDefined();
  });

  it("renders superscript variant", () => {
    const output = renderCitationsForGitHub(simpleInput, { variant: "superscript" });
    expect(output.markdown).toContain("¹");
  });

  it("renders inline variant", () => {
    const output = renderCitationsForGitHub(simpleInput, { variant: "inline" });
    expect(output.markdown).toContain("grew 45%◌");
  });

  it("renders footnote variant", () => {
    const output = renderCitationsForGitHub(simpleInput, { variant: "footnote" });
    expect(output.markdown).toContain("[^1]");
  });

  it("includes sources as table (default format)", () => {
    const output = renderCitationsForGitHub(simpleInput, {
      includeSources: true,
    });
    expect(output.sources).toContain("<details>");
    expect(output.sources).toContain("<summary>");
    expect(output.sources).toContain("| # | Status |");
  });

  it("includes sources as list", () => {
    const output = renderCitationsForGitHub(simpleInput, {
      includeSources: true,
      sourcesFormat: "list",
    });
    expect(output.sources).toContain("<details>");
    expect(output.sources).toContain("- **[1]**");
  });

  it("includes sources as detailed format with images", () => {
    const output = renderCitationsForGitHub(simpleInput, {
      includeSources: true,
      sourcesFormat: "detailed",
      includeImages: true,
      proofBaseUrl: "https://proof.deepcitation.com",
    });
    expect(output.sources).toContain("<details>");
    expect(output.sources).toContain("![Proof snippet]");
  });

  it("renders footnote sources as footnote definitions", () => {
    const output = renderCitationsForGitHub(simpleInput, {
      variant: "footnote",
      includeSources: true,
    });
    expect(output.sources).toContain("[^1]:");
  });

  it("uses custom source labels", () => {
    const output = renderCitationsForGitHub(simpleInput, {
      includeSources: true,
      sourceLabels: { abc123: "Financial Report" },
    });
    expect(output.sources).toContain("Financial Report");
  });

  it("handles multiple citations", () => {
    const output = renderCitationsForGitHub(multiCitationInput);
    expect(output.citations).toHaveLength(2);
  });

  it("returns correct structure", () => {
    const output = renderCitationsForGitHub(simpleInput);
    expect(output).toHaveProperty("content");
    expect(output).toHaveProperty("markdown");
    expect(output).toHaveProperty("full");
    expect(output).toHaveProperty("citations");
    expect(output.content).toBe(output.markdown);
  });
});
