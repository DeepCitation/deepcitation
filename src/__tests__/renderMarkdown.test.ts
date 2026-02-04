import { describe, it, expect } from "@jest/globals";
import {
  renderCitationsAsMarkdown,
  toMarkdown,
  getIndicator,
  toSuperscript,
  humanizeLinePosition,
  INDICATOR_SETS,
} from "../markdown/index.js";
import { getCitationStatus } from "../parsing/parseCitation.js";
import type { Verification } from "../types/verification.js";
import type { IndicatorStyle, MarkdownVariant } from "../markdown/types.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const simpleInput = `Revenue grew 45%<cite attachment_id='abc123' page_number='3' full_phrase='Revenue grew 45% in Q4.' anchor_text='grew 45%' line_ids='12,13' /> according to reports.`;

const multiCitationInput = `First claim<cite attachment_id='abc123' page_number='1' full_phrase='First fact.' anchor_text='First' citation_number='1' />.
Second claim<cite attachment_id='abc123' page_number='2' full_phrase='Second fact.' anchor_text='Second' citation_number='2' />.
Third claim<cite attachment_id='abc123' page_number='3' full_phrase='Third fact.' anchor_text='Third' citation_number='3' />.`;

const verifiedVerification: Verification = {
  status: "found",
  verifiedPageNumber: 3,
  verifiedLineIds: [12, 13],
};

const partialVerification: Verification = {
  status: "found_on_other_page",
  verifiedPageNumber: 5,
};

const linePositionVerification: Verification = {
  status: "found_on_other_line",
  verifiedPageNumber: 3,
  verifiedLineIds: [80],
  totalLinesOnPage: 100,
};

const notFoundVerification: Verification = {
  status: "not_found",
};

const pendingVerification: Verification = {
  status: "pending",
};

// =============================================================================
// INDICATOR TESTS
// =============================================================================

describe("getIndicator", () => {
  describe("check style (default)", () => {
    it("returns ✓ for verified", () => {
      const status = getCitationStatus(verifiedVerification);
      expect(getIndicator(status, "check")).toBe("✓");
    });

    it("returns ⚠ for partial match", () => {
      const status = getCitationStatus(partialVerification);
      expect(getIndicator(status, "check")).toBe("⚠");
    });

    it("returns ✗ for not found", () => {
      const status = getCitationStatus(notFoundVerification);
      expect(getIndicator(status, "check")).toBe("✗");
    });

    it("returns ◌ for pending", () => {
      const status = getCitationStatus(pendingVerification);
      expect(getIndicator(status, "check")).toBe("◌");
    });
  });

  describe("all indicator styles", () => {
    const styles: IndicatorStyle[] = ["check", "semantic", "circle", "square", "letter", "word", "none"];

    it.each(styles)("style %s has all four indicators defined", (style) => {
      const set = INDICATOR_SETS[style];
      expect(set).toBeDefined();
      expect(typeof set.verified).toBe("string");
      expect(typeof set.partial).toBe("string");
      expect(typeof set.notFound).toBe("string");
      expect(typeof set.pending).toBe("string");
    });

    it("none style returns empty strings", () => {
      const set = INDICATOR_SETS["none"];
      expect(set.verified).toBe("");
      expect(set.partial).toBe("");
      expect(set.notFound).toBe("");
      expect(set.pending).toBe("");
    });
  });
});

// =============================================================================
// SUPERSCRIPT TESTS
// =============================================================================

describe("toSuperscript", () => {
  it("converts single digit", () => {
    expect(toSuperscript(1)).toBe("¹");
    expect(toSuperscript(5)).toBe("⁵");
    expect(toSuperscript(0)).toBe("⁰");
  });

  it("converts multi-digit numbers", () => {
    expect(toSuperscript(12)).toBe("¹²");
    expect(toSuperscript(123)).toBe("¹²³");
    expect(toSuperscript(99)).toBe("⁹⁹");
  });
});

// =============================================================================
// HUMANIZE LINE POSITION TESTS
// =============================================================================

describe("humanizeLinePosition", () => {
  it("returns null when totalLinesOnPage is missing", () => {
    expect(humanizeLinePosition(50, null)).toBeNull();
    expect(humanizeLinePosition(50, undefined)).toBeNull();
    expect(humanizeLinePosition(50, 0)).toBeNull();
  });

  it("returns start for lines < 20%", () => {
    expect(humanizeLinePosition(10, 100)).toBe("start");
    expect(humanizeLinePosition(19, 100)).toBe("start");
  });

  it("returns early for lines 20-33%", () => {
    expect(humanizeLinePosition(20, 100)).toBe("early");
    expect(humanizeLinePosition(32, 100)).toBe("early");
  });

  it("returns middle for lines 33-66%", () => {
    expect(humanizeLinePosition(33, 100)).toBe("middle");
    expect(humanizeLinePosition(50, 100)).toBe("middle");
    expect(humanizeLinePosition(65, 100)).toBe("middle");
  });

  it("returns late for lines 66-80%", () => {
    expect(humanizeLinePosition(66, 100)).toBe("late");
    expect(humanizeLinePosition(79, 100)).toBe("late");
  });

  it("returns end for lines > 80%", () => {
    expect(humanizeLinePosition(80, 100)).toBe("end");
    expect(humanizeLinePosition(100, 100)).toBe("end");
  });
});

// =============================================================================
// RENDER MARKDOWN TESTS
// =============================================================================

describe("renderCitationsAsMarkdown", () => {
  describe("basic rendering", () => {
    it("returns structured output with markdown, references, and citations", () => {
      const result = renderCitationsAsMarkdown(simpleInput);

      expect(result).toHaveProperty("markdown");
      expect(result).toHaveProperty("references");
      expect(result).toHaveProperty("full");
      expect(result).toHaveProperty("citations");
      expect(Array.isArray(result.citations)).toBe(true);
    });

    it("extracts citations from input", () => {
      const result = renderCitationsAsMarkdown(multiCitationInput);

      expect(result.citations).toHaveLength(3);
      expect(result.citations[0].citationNumber).toBe(1);
      expect(result.citations[1].citationNumber).toBe(2);
      expect(result.citations[2].citationNumber).toBe(3);
    });

    it("removes cite tags from output", () => {
      const result = renderCitationsAsMarkdown(simpleInput);

      expect(result.markdown).not.toContain("<cite");
      expect(result.markdown).not.toContain("/>");
    });
  });

  describe("variant: inline", () => {
    it("renders anchor text with indicator", () => {
      const result = renderCitationsAsMarkdown(simpleInput, {
        variant: "inline",
        indicatorStyle: "check",
        linkStyle: "none",
      });

      expect(result.markdown).toContain("grew 45%");
      expect(result.markdown).toContain("◌"); // pending by default
    });
  });

  describe("variant: brackets", () => {
    it("renders bracketed number with indicator", () => {
      const result = renderCitationsAsMarkdown(simpleInput, {
        variant: "brackets",
        indicatorStyle: "check",
        linkStyle: "none",
      });

      expect(result.markdown).toContain("[1◌]");
    });
  });

  describe("variant: superscript", () => {
    it("renders superscript number", () => {
      const result = renderCitationsAsMarkdown(simpleInput, {
        variant: "superscript",
        indicatorStyle: "check",
        linkStyle: "none",
      });

      expect(result.markdown).toContain("¹");
    });
  });

  describe("variant: footnote", () => {
    it("renders footnote marker", () => {
      const result = renderCitationsAsMarkdown(simpleInput, {
        variant: "footnote",
      });

      expect(result.markdown).toContain("[^1]");
    });

    it("generates footnote-style references", () => {
      const result = renderCitationsAsMarkdown(simpleInput, {
        variant: "footnote",
        includeReferences: true,
      });

      expect(result.references).toContain("[^1]:");
    });
  });

  describe("variant: academic", () => {
    it("renders academic-style citation", () => {
      const result = renderCitationsAsMarkdown(simpleInput, {
        variant: "academic",
        indicatorStyle: "check",
        linkStyle: "none",
        sourceLabels: { abc123: "Annual Report" },
      });

      expect(result.markdown).toContain("Annual Report");
      expect(result.markdown).toContain("p.3");
    });
  });

  describe("variant: minimal", () => {
    it("renders only indicator", () => {
      const result = renderCitationsAsMarkdown(simpleInput, {
        variant: "minimal",
        indicatorStyle: "check",
        linkStyle: "none",
      });

      expect(result.markdown).toContain("◌");
      expect(result.markdown).not.toContain("[1");
    });
  });
});

// =============================================================================
// REFERENCE SECTION TESTS
// =============================================================================

describe("reference section", () => {
  it("is not included by default", () => {
    const result = renderCitationsAsMarkdown(simpleInput);

    expect(result.references).toBeUndefined();
    expect(result.full).toBe(result.markdown);
  });

  it("is included when requested", () => {
    const result = renderCitationsAsMarkdown(simpleInput, {
      includeReferences: true,
    });

    expect(result.references).toBeDefined();
    expect(result.full).toContain("## References");
  });

  it("uses custom heading", () => {
    const result = renderCitationsAsMarkdown(simpleInput, {
      includeReferences: true,
      referenceHeading: "## Sources",
    });

    expect(result.references).toContain("## Sources");
  });

  it("includes page numbers by default", () => {
    const result = renderCitationsAsMarkdown(simpleInput, {
      includeReferences: true,
    });

    expect(result.references).toContain("p.3");
  });

  it("omits page numbers when disabled", () => {
    const result = renderCitationsAsMarkdown(simpleInput, {
      includeReferences: true,
      showPageNumber: false,
    });

    expect(result.references).not.toContain("p.3");
  });
});

// =============================================================================
// ANCHOR LINK TESTS
// =============================================================================

describe("anchor links", () => {
  it("includes anchor links by default", () => {
    const result = renderCitationsAsMarkdown(simpleInput, {
      variant: "brackets",
    });

    expect(result.markdown).toContain("](#ref-1)");
  });

  it("omits anchor links when disabled", () => {
    const result = renderCitationsAsMarkdown(simpleInput, {
      variant: "brackets",
      linkStyle: "none",
    });

    expect(result.markdown).not.toContain("](#ref-");
  });

  it("reference section includes anchor targets", () => {
    const result = renderCitationsAsMarkdown(simpleInput, {
      variant: "brackets",
      includeReferences: true,
    });

    expect(result.references).toContain('<a id="ref-1">');
  });
});

// =============================================================================
// toMarkdown SIMPLIFIED FUNCTION TESTS
// =============================================================================

describe("toMarkdown", () => {
  it("returns full string output", () => {
    const result = toMarkdown(simpleInput, {
      variant: "brackets",
      includeReferences: true,
    });

    expect(typeof result).toBe("string");
    expect(result).toContain("## References");
  });

  it("equals renderCitationsAsMarkdown().full", () => {
    const options = { variant: "brackets" as const, includeReferences: true };
    const simple = toMarkdown(simpleInput, options);
    const structured = renderCitationsAsMarkdown(simpleInput, options);

    expect(simple).toBe(structured.full);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe("edge cases", () => {
  it("handles empty input", () => {
    const result = renderCitationsAsMarkdown("");

    expect(result.markdown).toBe("");
    expect(result.citations).toHaveLength(0);
  });

  it("handles input with no citations", () => {
    const result = renderCitationsAsMarkdown("Just plain text without any citations.");

    expect(result.markdown).toBe("Just plain text without any citations.");
    expect(result.citations).toHaveLength(0);
  });

  it("handles citations with escaped quotes", () => {
    const input = `Test<cite full_phrase='He said \\'hello\\' to everyone.' anchor_text='hello' />`;
    const result = renderCitationsAsMarkdown(input);

    expect(result.citations[0].citation.fullPhrase).toBe("He said 'hello' to everyone.");
  });

  it("handles missing optional attributes", () => {
    const input = `Test<cite attachment_id='abc' />`;
    const result = renderCitationsAsMarkdown(input);

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].citation.attachmentId).toBe("abc");
  });
});
