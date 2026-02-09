import { describe, expect, it } from "@jest/globals";
import { generateCitationKey } from "../../react/utils.js";
import { renderCitationsForSlack } from "../../rendering/slack/slackRenderer.js";
import type { Verification } from "../../types/verification.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const simpleInput = `Revenue grew 45%<cite attachment_id='abc123' page_number='3' full_phrase='Revenue grew 45% in Q4.' anchor_text='grew 45%' line_ids='12,13' /> according to reports.`;

const multiCitationInput = `First claim<cite attachment_id='abc123' page_number='1' full_phrase='First fact.' anchor_text='First' />.
Second claim<cite attachment_id='abc123' page_number='2' full_phrase='Second fact.' anchor_text='Second' />.`;

const verifiedVerification: Verification = {
  status: "found",
  verifiedPageNumber: 3,
  label: "Q4 Report",
};

const notFoundVerification: Verification = {
  status: "not_found",
};

// =============================================================================
// TESTS
// =============================================================================

describe("renderCitationsForSlack", () => {
  it("renders citations with brackets variant (default)", () => {
    const output = renderCitationsForSlack(simpleInput);
    expect(output.message).toContain("[1◌]");
    expect(output.message).toContain("Revenue grew 45%");
    expect(output.message).toContain("according to reports.");
    expect(output.citations).toHaveLength(1);
  });

  it("renders citations with inline variant", () => {
    const output = renderCitationsForSlack(simpleInput, { variant: "inline" });
    expect(output.message).toContain("grew 45%◌");
  });

  it("renders citations with number variant", () => {
    const output = renderCitationsForSlack(simpleInput, { variant: "number" });
    expect(output.message).toContain("¹◌");
  });

  it("wraps citations in Slack links when proofBaseUrl is provided", () => {
    const output = renderCitationsForSlack(simpleInput, {
      proofBaseUrl: "https://proof.deepcitation.com",
    });
    expect(output.message).toContain("<https://proof.deepcitation.com/p/");
    expect(output.message).toContain("|[1◌]>");
    expect(output.proofUrls).toBeDefined();
  });

  it("handles multiple citations", () => {
    const output = renderCitationsForSlack(multiCitationInput);
    expect(output.citations).toHaveLength(2);
    expect(output.message).toContain("[1◌]");
    expect(output.message).toContain("[2◌]");
  });

  it("includes sources section when requested", () => {
    const output = renderCitationsForSlack(simpleInput, {
      includeSources: true,
    });
    expect(output.sources).toBeDefined();
    expect(output.sources).toContain("*Sources:*");
    expect(output.full).toContain("*Sources:*");
  });

  it("uses custom source labels", () => {
    const output = renderCitationsForSlack(simpleInput, {
      includeSources: true,
      sourceLabels: { abc123: "Financial Report" },
    });
    expect(output.sources).toContain("Financial Report");
  });

  it("truncates output at maxMessageLength", () => {
    const output = renderCitationsForSlack(simpleInput, {
      includeSources: true,
      maxMessageLength: 50,
    });
    expect(output.full.length).toBeLessThanOrEqual(50);
    expect(output.full).toMatch(/\.\.\.$/);
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
    const output = renderCitationsForSlack(simpleInput, {
      verifications: { [key]: verifiedVerification },
    });
    expect(output.message).toContain("✓");
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
    const output = renderCitationsForSlack(simpleInput, {
      verifications: { [key]: notFoundVerification },
    });
    expect(output.message).toContain("✗");
  });

  it("returns correct structure", () => {
    const output = renderCitationsForSlack(simpleInput);
    expect(output).toHaveProperty("content");
    expect(output).toHaveProperty("message");
    expect(output).toHaveProperty("full");
    expect(output).toHaveProperty("citations");
    expect(output.content).toBe(output.message);
  });
});
