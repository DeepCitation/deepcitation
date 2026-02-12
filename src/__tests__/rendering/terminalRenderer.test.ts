import { describe, expect, it } from "@jest/globals";
import { generateCitationKey } from "../../react/utils.js";
import { renderCitationsForTerminal } from "../../rendering/terminal/terminalRenderer.js";
import type { Verification } from "../../types/verification.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const simpleInput = `Revenue grew 45%<cite attachment_id='abc123' page_number='3' full_phrase='Revenue grew 45% in Q4.' anchor_text='grew 45%' line_ids='12,13' /> according to reports.`;

const multiCitationInput = `First claim<cite attachment_id='abc123' page_number='1' full_phrase='First fact.' anchor_text='First' />.
Second claim<cite attachment_id='abc123' page_number='2' full_phrase='Second fact.' anchor_text='Second' />.`;

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

describe("renderCitationsForTerminal", () => {
  it("renders citations with brackets variant (default)", () => {
    const output = renderCitationsForTerminal(simpleInput, { color: false });
    expect(output.plain).toContain("[1◌]");
    expect(output.plain).toContain("Revenue grew 45%");
    expect(output.citations).toHaveLength(1);
  });

  it("renders with ANSI colors when color is true", () => {
    const output = renderCitationsForTerminal(simpleInput, { color: true });
    expect(output.text).toContain("\x1b["); // ANSI escape code
    expect(output.plain).not.toContain("\x1b["); // plain text without ANSI
  });

  it("renders without colors when color is false", () => {
    const output = renderCitationsForTerminal(simpleInput, { color: false });
    expect(output.text).not.toContain("\x1b[");
    expect(output.text).toBe(output.plain);
  });

  it("renders inline variant", () => {
    const output = renderCitationsForTerminal(simpleInput, { variant: "inline", color: false });
    expect(output.plain).toContain("grew 45%◌");
  });

  it("renders minimal variant", () => {
    const output = renderCitationsForTerminal(simpleInput, { variant: "minimal", color: false });
    expect(output.plain).toContain("◌");
    expect(output.plain).not.toContain("[1");
  });

  it("includes sources section when requested", () => {
    const output = renderCitationsForTerminal(simpleInput, {
      includeSources: true,
      color: false,
    });
    expect(output.sources).toBeDefined();
    expect(output.sources).toContain("Sources");
    expect(output.sources).toContain("─");
    expect(output.full).toContain("Sources");
  });

  it("uses custom source labels", () => {
    const output = renderCitationsForTerminal(simpleInput, {
      includeSources: true,
      sourceLabels: { abc123: "Financial Report" },
      color: false,
    });
    expect(output.sources).toContain("Financial Report");
  });

  it("handles multiple citations", () => {
    const output = renderCitationsForTerminal(multiCitationInput, { color: false });
    expect(output.citations).toHaveLength(2);
    expect(output.plain).toContain("[1◌]");
    expect(output.plain).toContain("[2◌]");
  });

  it("renders with verified status (green)", () => {
    const citation = {
      attachmentId: "abc123",
      pageNumber: 3,
      fullPhrase: "Revenue grew 45% in Q4.",
      anchorText: "grew 45%",
      lineIds: [12, 13],
    };
    const key = generateCitationKey(citation);
    const output = renderCitationsForTerminal(simpleInput, {
      verifications: { [key]: verifiedVerification },
      color: true,
    });
    expect(output.text).toContain("\x1b[32m"); // green
    expect(output.plain).toContain("✓");
  });

  it("renders with not_found status (red)", () => {
    const citation = {
      attachmentId: "abc123",
      pageNumber: 3,
      fullPhrase: "Revenue grew 45% in Q4.",
      anchorText: "grew 45%",
      lineIds: [12, 13],
    };
    const key = generateCitationKey(citation);
    const output = renderCitationsForTerminal(simpleInput, {
      verifications: { [key]: notFoundVerification },
      color: true,
    });
    expect(output.text).toContain("\x1b[31m"); // red
    expect(output.plain).toContain("✗");
  });

  it("returns correct structure", () => {
    const output = renderCitationsForTerminal(simpleInput, { color: false });
    expect(output).toHaveProperty("content");
    expect(output).toHaveProperty("text");
    expect(output).toHaveProperty("plain");
    expect(output).toHaveProperty("full");
    expect(output).toHaveProperty("citations");
    expect(output.content).toBe(output.text);
  });

  it("truncates source quotes to maxWidth", () => {
    const longPhraseInput = `Text<cite attachment_id='abc123' page_number='1' full_phrase='${"a".repeat(200)}' anchor_text='test' /> end.`;
    const output = renderCitationsForTerminal(longPhraseInput, {
      includeSources: true,
      maxWidth: 40,
      color: false,
    });
    expect(output.sources).toContain("...");
  });
});
