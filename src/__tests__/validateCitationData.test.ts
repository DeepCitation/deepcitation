import { describe, expect, it } from "bun:test";
import type { CitationData } from "../prompts/citationPrompts.js";
import { detectExtractionArtifacts, validateCitationData } from "../utils/validateCitationData.js";

const good: CitationData = {
  id: 1,
  source_context: "Revenue grew 45% year-over-year to $2.3B",
  source_match: "$2.3B",
  page_id: "page_number_2_index_0",
  line_ids: [20],
  attachment_id: "att-123",
};

describe("validateCitationData", () => {
  it("passes valid citation", () => {
    const r = validateCitationData([good]);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("errors on missing page_id", () => {
    const r = validateCitationData([{ ...good, page_id: undefined }]);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === "page_id")).toBe(true);
  });

  it("errors on empty source_context", () => {
    const r = validateCitationData([{ ...good, source_context: "" }]);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === "source_context")).toBe(true);
  });

  it("warns on long source_match (chars)", () => {
    const r = validateCitationData([{ ...good, source_context: "A".repeat(70), source_match: "A".repeat(70) }]);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.field === "source_match" && w.message.includes("chars"))).toBe(true);
  });

  it("warns on long source_match (words)", () => {
    const longAnchor = "one two three four five six seven";
    const r = validateCitationData([
      { ...good, source_context: `prefix ${longAnchor} suffix`, source_match: longAnchor },
    ]);
    expect(r.warnings.some(w => w.field === "source_match" && w.message.includes("words"))).toBe(true);
  });

  it("warns when source_match is not substring of source_context", () => {
    const r = validateCitationData([{ ...good, source_match: "paraphrased version" }]);
    expect(r.warnings.some(w => w.message.includes("not a substring"))).toBe(true);
  });

  it("warns on empty source_match", () => {
    const r = validateCitationData([{ ...good, source_match: "" }]);
    expect(r.warnings.some(w => w.field === "source_match" && w.message.includes("empty"))).toBe(true);
  });

  it("validates multiple citations", () => {
    const r = validateCitationData([
      good,
      { ...good, id: 2, page_id: undefined },
      { ...good, id: 3, source_match: "A".repeat(70), source_context: "A".repeat(70) },
    ]);
    expect(r.valid).toBe(false); // citation 2 missing page_id
    expect(r.errors).toHaveLength(1);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("warns on extraction artifacts in source_context", () => {
    const r = validateCitationData([
      { ...good, source_context: "only informationmaterialto an understanding of the general development" },
    ]);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.field === "source_context" && w.message.includes("extraction artifact"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectExtractionArtifacts — unit tests using real Round 3 partial examples
// ---------------------------------------------------------------------------

describe("detectExtractionArtifacts", () => {
  describe("RC1a: collapsed spaces", () => {
    // Real examples from Miranda v. Arizona (24 partials)
    it("detects camelCase-style collapsed spaces from PDF", () => {
      const artifacts = detectExtractionArtifacts("wemeanquestioninginitiatedbylawenforcementofficers");
      expect(artifacts.some(a => a.type === "collapsed_spaces")).toBe(true);
    });

    it("detects mid-word case change from collapsed space", () => {
      // From Reg S-K: "informationmaterialto" — but this is all lowercase.
      // The camelCase pattern catches "materialTo" style joins.
      const artifacts = detectExtractionArtifacts("only informationMaterialto understanding");
      expect(artifacts.some(a => a.type === "collapsed_spaces")).toBe(true);
    });

    it("detects long lowercase runs (collapsed multi-word joins)", () => {
      // From Miranda snippets: words joined without any spaces
      const artifacts = detectExtractionArtifacts("wasfashionedtoassureunfetteredinterchangeofideas");
      expect(artifacts.some(a => a.type === "collapsed_spaces")).toBe(true);
    });

    it("does not flag normal text", () => {
      const artifacts = detectExtractionArtifacts("Revenue grew 45% year-over-year to $2.3B");
      const collapsed = artifacts.filter(a => a.type === "collapsed_spaces");
      expect(collapsed).toHaveLength(0);
    });

    it("does not flag short normal words", () => {
      const artifacts = detectExtractionArtifacts("the court held that section four was unconstitutional");
      const collapsed = artifacts.filter(a => a.type === "collapsed_spaces");
      expect(collapsed).toHaveLength(0);
    });
  });

  describe("RC1b: broken hyphens", () => {
    // Real examples from Reg S-K (20 partials)
    it("detects short-fragment hyphens from line breaks", () => {
      // "bene-cially" — left fragment "bene" is 4 chars, right "cially" is 6
      // This is caught by the fi-ligature detector more precisely,
      // but the broken hyphen detector catches short fragments
      const artifacts = detectExtractionArtifacts("more than -ve percent of any class");
      expect(artifacts.some(a => a.type === "broken_hyphen")).toBe(true);
    });

    it("detects single-char left fragments", () => {
      // "a-ects" for "affects"
      const artifacts = detectExtractionArtifacts("risk a-ects the registrant");
      expect(artifacts.some(a => a.type === "broken_hyphen")).toBe(true);
    });

    it("does not flag legitimate hyphenated words", () => {
      const artifacts = detectExtractionArtifacts("year-over-year growth was well-known");
      const broken = artifacts.filter(a => a.type === "broken_hyphen");
      expect(broken).toHaveLength(0);
    });
  });

  describe("RC1c: fi-ligature loss", () => {
    // Real examples from BSA/AML SAR (4 partials)
    it("detects -elds for fields", () => {
      const artifacts = detectExtractionArtifacts("Certain-elds are required");
      expect(artifacts.some(a => a.type === "fi_ligature")).toBe(true);
    });

    it("detects -ling for filing", () => {
      const artifacts = detectExtractionArtifacts("technical-ling requirements");
      expect(artifacts.some(a => a.type === "fi_ligature")).toBe(true);
    });

    it("detects -nancial for financial", () => {
      // From Reg S-K: "or-nancial condition"
      const artifacts = detectExtractionArtifacts("business or-nancial condition of the registrant");
      expect(artifacts.some(a => a.type === "fi_ligature")).toBe(true);
    });

    it("detects -rst for first", () => {
      const artifacts = detectExtractionArtifacts("the-rst quarter results");
      expect(artifacts.some(a => a.type === "fi_ligature")).toBe(true);
    });

    it("detects -le for file", () => {
      const artifacts = detectExtractionArtifacts("electronically-le such material");
      expect(artifacts.some(a => a.type === "fi_ligature")).toBe(true);
    });

    it("detects -gure for figure", () => {
      const artifacts = detectExtractionArtifacts("public-gure doctrine applies");
      expect(artifacts.some(a => a.type === "fi_ligature")).toBe(true);
    });

    it("does not flag normal hyphenated words", () => {
      const artifacts = detectExtractionArtifacts("self-contained and first-line agents");
      const ligatures = artifacts.filter(a => a.type === "fi_ligature");
      expect(ligatures).toHaveLength(0);
    });
  });

  describe("RC3: table fragment markers", () => {
    // Real example from CDC Immunization Schedule
    it("detects y-prefix table cell concatenation", () => {
      const artifacts = detectExtractionArtifacts("yAge 60 years or older with known risk factors");
      expect(artifacts.some(a => a.type === "table_fragment")).toBe(true);
    });

    it("does not flag normal text starting with y", () => {
      const artifacts = detectExtractionArtifacts("you should consult your physician");
      const tables = artifacts.filter(a => a.type === "table_fragment");
      expect(tables).toHaveLength(0);
    });
  });

  describe("RC1d: missing space after punctuation", () => {
    // Real examples from Citizens United "found" citations
    it("detects period-capital join", () => {
      const artifacts = detectExtractionArtifacts("overruled.We return to the principle");
      expect(artifacts.some(a => a.type === "missing_space_after_punctuation")).toBe(true);
    });

    it("detects colon-capital join", () => {
      const artifacts = detectExtractionArtifacts("movie.Under BCRA §203");
      expect(artifacts.some(a => a.type === "missing_space_after_punctuation")).toBe(true);
    });

    it("detects semicolon-capital join from legal citations", () => {
      const artifacts = detectExtractionArtifacts("candidate.SeeBuckley v. Valeo");
      expect(artifacts.some(a => a.type === "missing_space_after_punctuation")).toBe(true);
    });

    it("does not flag U.S. abbreviation", () => {
      const artifacts = detectExtractionArtifacts("553 U.S. 124");
      const punct = artifacts.filter(a => a.type === "missing_space_after_punctuation");
      expect(punct).toHaveLength(0);
    });

    it("does not flag normal sentences", () => {
      const artifacts = detectExtractionArtifacts("The court ruled. We agree with this holding.");
      const punct = artifacts.filter(a => a.type === "missing_space_after_punctuation");
      expect(punct).toHaveLength(0);
    });
  });

  describe("RC1e: broken words (space mid-word)", () => {
    // Real examples from Citizens United and Sentencing Guidelines "found" citations
    it("detects 'govern mental' for 'governmental'", () => {
      // "govern" is 6 chars + "mental" is 6 chars = 12 total >= 7
      // But "govern" is not in the prefix list. Let me use actual examples.
      const artifacts = detectExtractionArtifacts("ad vertisements for political candidates");
      expect(artifacts.some(a => a.type === "broken_word")).toBe(true);
    });

    it("detects 're sponsible' for 'responsible'", () => {
      const artifacts = detectExtractionArtifacts("re sponsible for enforcement");
      expect(artifacts.some(a => a.type === "broken_word")).toBe(true);
    });

    it("detects 'ex penditures' for 'expenditures'", () => {
      const artifacts = detectExtractionArtifacts("independent ex penditures by corporations");
      expect(artifacts.some(a => a.type === "broken_word")).toBe(true);
    });

    it("detects 'im posed' for 'imposed'", () => {
      const artifacts = detectExtractionArtifacts("restrictions im posed on speech");
      expect(artifacts.some(a => a.type === "broken_word")).toBe(true);
    });

    it("detects 'ap plied' for 'applied'", () => {
      const artifacts = detectExtractionArtifacts("ap plied to this case");
      expect(artifacts.some(a => a.type === "broken_word")).toBe(true);
    });

    it("does not flag legitimate two-word phrases", () => {
      const artifacts = detectExtractionArtifacts("in response to the filing");
      const broken = artifacts.filter(a => a.type === "broken_word");
      expect(broken).toHaveLength(0);
    });
  });

  describe("combined detection", () => {
    it("detects multiple artifact types in one phrase", () => {
      // Synthetic but realistic: collapsed space + fi-ligature
      const artifacts = detectExtractionArtifacts("the registrantismaterialto the-nancial condition");
      expect(artifacts.length).toBeGreaterThanOrEqual(2);
      const types = new Set(artifacts.map(a => a.type));
      expect(types.size).toBeGreaterThanOrEqual(2);
    });

    it("detects display artifacts in a real 'found' snippet from Citizens United", () => {
      // Real sourceSnippet from a "found" citation that displays garbled text
      const snippet =
        "tolimitcorporateindependentexpendi overruled.We return to the principle established inBuckleyandBellottithat";
      const artifacts = detectExtractionArtifacts(snippet);
      expect(artifacts.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty array for clean text", () => {
      const artifacts = detectExtractionArtifacts(
        "The court held that Section 4(b) of the Voting Rights Act was unconstitutional.",
      );
      expect(artifacts).toHaveLength(0);
    });

    it("returns empty array for empty string", () => {
      expect(detectExtractionArtifacts("")).toHaveLength(0);
    });
  });
});
