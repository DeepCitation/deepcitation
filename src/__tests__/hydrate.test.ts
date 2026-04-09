import { describe, expect, it } from "@jest/globals";
import { hydrateCitations, parseSummaryToLineMap } from "../cli/hydrate.js";
import type { CitationData } from "../prompts/citationPrompts.js";

// Minimal summary with page tags and line IDs matching the YC SAFE structure
const SUMMARY_JSON = JSON.stringify({
  attachmentId: "test-attachment-id",
  deepTextPromptPortion: [
    "<page_number_1_index_0>",
    '<line id="1">Version 1.2</line>',
    "DISCOUNT ONLY",
    "THIS INSTRUMENT AND ANY SECURITIES ISSUABLE PURSUANT HERETO",
    '<line id="5">CERTAIN STATES.</line>',
    'The "Discount Rate" is [100 minus the discount]%.',
    "See Section 2.",
    "1. Events",
    "(a) Equity Financing. If there is an Equity Financing before the termination of this Safe, on the initial closing",
    '<line id="10">of such Equity Financing, this Safe will automatically convert into shares of Safe Preferred Stock equal to the</line>',
    "Purchase Amount divided by the Discount Price.",
    "</page_number_1_index_0>",
  ].join("\n"),
});

describe("parseSummaryToLineMap", () => {
  it("resolves tagged line IDs with qualified page keys", () => {
    const lineMap = parseSummaryToLineMap(SUMMARY_JSON);
    expect(lineMap.qualified.get("page_number_1_index_0:10")).toContain("automatically convert");
  });

  it("resolves synthetic (inferred) line IDs between tagged lines", () => {
    const lineMap = parseSummaryToLineMap(SUMMARY_JSON);
    // Between line 5 and line 10, synthetic IDs 6-9 should be assigned
    const line9 = lineMap.qualified.get("page_number_1_index_0:9");
    expect(line9).toContain("initial closing");
  });

  it("assigns per-page line IDs for untagged deepTextPages (not global)", () => {
    // Root cause of iter 20 4% partial rate: global IDs (149, 150, 151) were sent
    // to the verify API which expects per-page IDs (page had only 101 lines).
    // Each untagged page must use a 1-based counter that resets per page.
    const rawPagesSummary = JSON.stringify({
      attachmentId: "test-id",
      deepTextPages: [
        // Page 1: 5 lines
        "line A\nline B\nline C\nline D\nline E",
        // Page 2: 3 lines
        "line X\nline Y\nline Z",
      ],
    });
    const lineMap = parseSummaryToLineMap(rawPagesSummary);
    // Page 1 lines should use per-page IDs 1-5
    expect(lineMap.qualified.get("page_number_1_index_0:1")).toBe("line A");
    expect(lineMap.qualified.get("page_number_1_index_0:5")).toBe("line E");
    // Page 2 lines should ALSO start at 1 (per-page reset), NOT 6
    expect(lineMap.qualified.get("page_number_2_index_1:1")).toBe("line X");
    expect(lineMap.qualified.get("page_number_2_index_1:3")).toBe("line Z");
    // Global IDs (6, 7, 8) must NOT appear as page 2 qualified keys
    expect(lineMap.qualified.get("page_number_2_index_1:6")).toBeUndefined();
  });
});

// Summary with two pages: page 17 has certificate OCR garbage at lines 4-6,
// page 25 has the actual Schedule C content with "The Commercial Units" at line 10.
// Mirrors the Run 3 RC5 failure: Haiku cited page 17 but content is on page 25.
const WRONG_PAGE_SUMMARY_JSON = JSON.stringify({
  attachmentId: "test-attachment-id",
  deepTextPages: [
    // 16 dummy pages before page 17
    ...Array.from({ length: 16 }, (_, i) => `Page ${i + 1} content`),
    // Page 17: certificate OCR garbage (wrong location Haiku cited)
    [
      '<line id="1">CERTIFICATE OF RECEIPT CERTIFICAT DE RECEPISSE</line>',
      "OTTAWA-CARLETON",
      "CONDOMINIUM PLAN NO. 748",
      '<line id="5">SOLICITOR: ADDRESS: 03971-0350</line>',
      "NEW PROPERTY IDENTIFIER BLOCK",
      "DECLARANT:",
      '<line id="10">REGISTERED OWNER:</line>',
    ].join("\n"),
    // 7 more dummy pages
    ...Array.from({ length: 7 }, (_, i) => `Page ${i + 18} content`),
    // Page 25: Schedule C with the actual cited content
    [
      '<line id="1">SCHEDULE C — UNIT BOUNDARIES</line>',
      "This schedule describes the boundaries of each unit type.",
      "The units are classified as Commercial, Residential, and Parking.",
      '<line id="5">Section 1. Commercial Units</line>',
      "The Exchange at Westboro Condominium declares three unit types.",
      "Each type has distinct boundaries and permitted uses.",
      '<line id="10">The Commercial Units comprise units 1 to 6 on Level 1.</line>',
      "Their lower limit is the upper unfinished surface of the concrete slab.",
      "Their upper limit is the lower unfinished surface of the slab above.",
      '<line id="15">Vertical boundaries follow the backside surfaces of drywall.</line>',
    ].join("\n"),
  ],
});

describe("hydrateCitations — fullPhrase context", () => {
  it("fills full_phrase from multiple line IDs, not just anchor text", () => {
    const citations: CitationData[] = [
      {
        id: 1,
        anchor_text: "initial closing",
        page_id: "1_0",
        // Lines 9 and 10 both exist in the fixture (9 is synthetic, 10 is tagged).
        // Line 9: "(a) Equity Financing ... initial closing"
        // Line 10: "of such Equity Financing ... automatically convert ..."
        line_ids: [9, 10],
      } as CitationData,
    ];

    const result = hydrateCitations({
      summaryContent: SUMMARY_JSON,
      citations,
      warnOnMiss: false,
    });

    expect(result.hydrated).toBe(1);
    expect(result.misses).toEqual([]);

    // full_phrase must be longer than anchor_text — it should contain text from both lines
    const fp = citations[0].full_phrase;
    expect(fp).toBeDefined();
    expect(fp?.length).toBeGreaterThan("initial closing".length);
    // anchor_text must be a substring of full_phrase
    expect(fp?.toLowerCase()).toContain("initial closing");
    // full_phrase should also include text from the adjacent tagged line
    expect(fp?.toLowerCase()).toContain("automatically convert");
  });

  it("does NOT set full_phrase = anchor_text when line IDs resolve", () => {
    // Regression: if hydration fell through to the fallback path,
    // it set full_phrase = anchor_text, which causes HighlightedPhrase
    // to render without a visible highlight (anchor fills the entire phrase).
    const citations: CitationData[] = [
      {
        id: 1,
        anchor_text: "initial closing",
        page_id: "1_0",
        line_ids: [9, 10],
      } as CitationData,
    ];

    hydrateCitations({
      summaryContent: SUMMARY_JSON,
      citations,
      warnOnMiss: false,
    });

    // full_phrase must NOT equal anchor_text
    expect(citations[0].full_phrase).not.toBe(citations[0].anchor_text);
  });
});

// ── RC5 failure scenario (iter 19 Run 3) ────────────────────────────────────
// Root cause: agent cites wrong page (e.g. page 17 certificate page instead of
// page 25 Schedule C). Hydration assembles full_phrase from the wrong lines
// (OCR garbage), detects anchor not present, falls through. Currently the
// fallback path sets full_phrase = verbatimAnchor = anchorText (no context),
// which causes the API to return partial_text_found (RC5) because there is no
// surrounding phrase to narrow the highlight to. The fix: include adjacent lines.
describe("hydrateCitations — wrong line IDs (RC5 regression)", () => {
  it("when wrong line IDs are provided, full_phrase is broader than anchor_text", () => {
    const citations: CitationData[] = [
      {
        id: 1,
        // Anchor appears on page 25, line 10 — but agent cited page 17, lines 4-6
        anchor_text: "The Commercial Units",
        page_id: "17_0",
        line_ids: [4, 5, 6],
      } as CitationData,
    ];

    hydrateCitations({ summaryContent: WRONG_PAGE_SUMMARY_JSON, citations, warnOnMiss: false });

    const fp = citations[0].full_phrase;
    expect(fp).toBeDefined();
    // full_phrase must contain the anchor
    expect(fp?.toLowerCase()).toContain("the commercial units");
    // full_phrase must be BROADER than just the anchor — needs surrounding context
    // so the API can compute the highlight position (anchor within phrase).
    // This assertion fails before the fix: fallback sets full_phrase = verbatimAnchor.
    expect(fp!.length).toBeGreaterThan("The Commercial Units".length);
    expect(fp).not.toBe("The Commercial Units");
  });

  it("when wrong line IDs are provided, line_ids are updated to actual location", () => {
    const citations: CitationData[] = [
      {
        id: 1,
        anchor_text: "The Commercial Units",
        page_id: "17_0",
        line_ids: [4, 5, 6],
      } as CitationData,
    ];

    hydrateCitations({ summaryContent: WRONG_PAGE_SUMMARY_JSON, citations, warnOnMiss: false });

    // line_ids must NOT still point to the wrong location (page 17, lines 4-6)
    expect(citations[0].line_ids).not.toEqual([4, 5, 6]);
    // Should include multiple lines (anchor line + neighbors for context)
    expect(citations[0].line_ids!.length).toBeGreaterThan(1);
  });

  it("when wrong line IDs are provided, page_id is updated to the actual page", () => {
    const citations: CitationData[] = [
      {
        id: 1,
        anchor_text: "The Commercial Units",
        page_id: "17_0",
        line_ids: [4, 5, 6],
      } as CitationData,
    ];

    hydrateCitations({ summaryContent: WRONG_PAGE_SUMMARY_JSON, citations, warnOnMiss: false });

    // page_id must be updated to the page where the anchor was actually found (page 25)
    // Before fix: page_id stays as "17_0"
    expect(citations[0].page_id).not.toBe("17_0");
  });
});
