import { describe, expect, it } from "@jest/globals";
import { denseAnnotatePage } from "../cli/cite.js";
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

describe("hydrateCitations — sourceContext context", () => {
  it("fills source_context from multiple line IDs, not just anchor text", () => {
    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "initial closing",
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

    // source_context must be longer than source_match — it should contain text from both lines
    const fp = citations[0].source_context;
    expect(fp).toBeDefined();
    expect(fp?.length).toBeGreaterThan("initial closing".length);
    // source_match must be a substring of source_context
    expect(fp?.toLowerCase()).toContain("initial closing");
    // source_context should also include text from the adjacent tagged line
    expect(fp?.toLowerCase()).toContain("automatically convert");
  });

  it("does NOT set source_context = source_match when line IDs resolve", () => {
    // Regression: if hydration fell through to the fallback path,
    // it set source_context = source_match, which causes HighlightedSourceContext
    // to render without a visible highlight (anchor fills the entire phrase).
    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "initial closing",
        page_id: "1_0",
        line_ids: [9, 10],
      } as CitationData,
    ];

    hydrateCitations({
      summaryContent: SUMMARY_JSON,
      citations,
      warnOnMiss: false,
    });

    // source_context must NOT equal source_match
    expect(citations[0].source_context).not.toBe(citations[0].source_match);
  });

  it("expands source_context with neighbor lines when a single cited line matches the anchor verbatim", () => {
    // Iter 23 motor.png root cause: agent cited l:[N] where the resolved line
    // is an OCR-fragmented chunk that happens to equal source_match exactly.
    // Without expansion, source_context === source_match, HighlightedSourceContext has
    // nothing to highlight inside the quote, and the display→popover→evidence
    // threading collapses (the <q> just shows the same 4 words as the inline).
    //
    // Fix: the happy path must always pull ±1 neighbor lines so source_context is
    // reliably wider than source_match — same behavior the wrong-lineId
    // fallback already provides.
    const ocrFragmentedSummary = JSON.stringify({
      attachmentId: "test-id",
      deepTextPages: [
        [
          "c )", // line 1 — label fragment
          "Each parking unit shall", // line 2 — OCR-fragmented, matches anchor verbatim
          "be used and occupied only for motor vehicle parking purposes.", // line 3
          "The term motor vehicle shall be deemed to include automobiles.", // line 4
        ].join("\n"),
      ],
    });

    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "Each parking unit shall",
        page_id: "1_0",
        line_ids: [2],
      } as CitationData,
    ];

    hydrateCitations({ summaryContent: ocrFragmentedSummary, citations, warnOnMiss: false });

    const fp = citations[0].source_context;
    expect(fp).toBeDefined();
    // Anchor still present
    expect(fp?.toLowerCase()).toContain("each parking unit shall");
    // Must be broader than the bare anchor — needs surrounding context so the
    // popover quote has something to highlight INSIDE the phrase.
    expect(fp).not.toBe("Each parking unit shall");
    // Specifically, neighbor lines must be pulled in so the reader sees the
    // "be used and occupied only for motor vehicle parking purposes" context.
    expect(fp?.toLowerCase()).toContain("be used and occupied");
  });
});

// ── Omitted line_ids — deterministic anchor-text derivation ─────────────────
// The LLM may now omit `l` entirely. hydrateCitations must handle empty/absent
// line_ids the same as wrong line_ids: skip the ID-lookup loop and fall through
// to findAnchorWithFallback on source_match.
describe("hydrateCitations — omitted line_ids", () => {
  it("hydrates when line_ids is an empty array", () => {
    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "automatically convert",
        page_id: "page_number_1_index_0",
        line_ids: [],
      } as unknown as CitationData,
    ];

    const result = hydrateCitations({ summaryContent: SUMMARY_JSON, citations, warnOnMiss: false });

    expect(result.hydrated).toBe(1);
    expect(result.misses).toEqual([]);
    expect(citations[0].source_context).toBeDefined();
    expect(citations[0].source_context?.toLowerCase()).toContain("automatically convert");
    // Must be broader than just the anchor
    expect(citations[0].source_context!.length).toBeGreaterThan("automatically convert".length);
  });

  it("hydrates when line_ids is absent (undefined)", () => {
    // "automatically convert" is on tagged line 10 in SUMMARY_JSON, so it's in the lineMap.
    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "automatically convert",
        page_id: "page_number_1_index_0",
        // no line_ids field at all
      } as CitationData,
    ];

    const result = hydrateCitations({ summaryContent: SUMMARY_JSON, citations, warnOnMiss: false });

    expect(result.hydrated).toBe(1);
    expect(result.misses).toEqual([]);
    expect(citations[0].source_context?.toLowerCase()).toContain("automatically convert");
    expect(citations[0].source_context!.length).toBeGreaterThan("automatically convert".length);
  });

  it("uses page hint to prefer correct page when anchor appears on multiple pages", () => {
    const multiPageSummary = JSON.stringify({
      attachmentId: "test-id",
      deepTextPages: [
        // Page 1: "Discount Price" in a formula/definition context (3 lines)
        '"Discount Rate" is [100 minus the discount]%.\n"Discount Price" means the lowest price per share multiplied by the Discount Rate.\nSee Section 2 for other definitions.',
        // Page 2: "Discount Price" in an operative clause with neighbors (3 lines)
        "The Safe will convert on the initial closing.\nThe Discount Price shall be used to calculate Safe Preferred Stock.\nThe number of shares equals Purchase Amount divided by the Discount Price.",
      ],
    });

    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "Discount Price",
        page_id: "page_number_2_index_1", // LLM hints page 2
        // no line_ids
      } as CitationData,
    ];

    hydrateCitations({ summaryContent: multiPageSummary, citations, warnOnMiss: false });

    // Should resolve from page 2 (the hint) rather than page 1 (first occurrence)
    expect(citations[0].page_id).toContain("2_1");
    // source_context must be broader than just the anchor — neighbors pulled in
    expect(citations[0].source_context!.length).toBeGreaterThan("Discount Price".length);
    expect(citations[0].source_context?.toLowerCase()).toContain("discount price");
  });
});

// ── Edge cases: miss path, claim_text promotion, already-hydrated skip ───────
describe("hydrateCitations — edge cases", () => {
  it("counts a miss and does not crash when anchor text not found anywhere", () => {
    // Regression guard: when line_ids is empty AND findAnchorWithFallback returns null,
    // the citation must be in misses[], not silently counted as hydrated.
    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "xyzzy_does_not_exist_in_any_line",
        page_id: "page_number_1_index_0",
        // no line_ids — falls through to anchor-text search which will also fail
      } as CitationData,
    ];

    const result = hydrateCitations({ summaryContent: SUMMARY_JSON, citations, warnOnMiss: false });

    expect(result.hydrated).toBe(0);
    expect(result.misses).toEqual([1]);
    // source_context must remain absent — don't set it to garbage on miss
    expect(citations[0].source_context).toBeUndefined();
  });

  it("preserves original source_match as claim_text when fallback finds a different verbatim anchor", () => {
    // When the LLM writes a paraphrase as source_match (e.g. "will automatically converts")
    // the anchor-text search finds the best N-gram match ("will automatically")
    // rather than the full paraphrase. hydrate must:
    //   a) promote the original source_match → claim_text (the prose label)
    //   b) set source_match to the verbatim evidence text (for the API highlight)
    // This ensures the popover shows the claim in context, not just the raw anchor.
    const citations: CitationData[] = [
      {
        id: 1,
        // Paraphrase — "converts" (present tense) vs "convert" (infinitive in the doc).
        // Strategy 1 sliding window: "will automatically converts" → no match (plural);
        // falls to 2-gram "will automatically" which IS in the evidence text.
        source_match: "will automatically converts",
        page_id: "page_number_1_index_0",
        line_ids: [], // empty → falls through to findAnchorWithFallback
      } as unknown as CitationData,
    ];

    hydrateCitations({ summaryContent: SUMMARY_JSON, citations, warnOnMiss: false });

    // claim_text should hold the original paraphrase (the display label for the popover)
    expect(citations[0].claim_text).toBe("will automatically converts");
    // source_match is now the verbatim N-gram found in the evidence
    // (the API uses this to locate the highlight position)
    expect(citations[0].source_match?.toLowerCase()).toContain("will automatically");
    // source_match must NOT still be the original paraphrase — it was overwritten
    expect(citations[0].source_match).not.toBe("will automatically converts");
    // And source_context must be broader than just the anchor
    expect(citations[0].source_context).toBeDefined();
  });

  it("falls back to global search when hinted page does not exist", () => {
    // If the LLM provides a page_id that doesn't match any page in the summary,
    // hydrateCitations must not return a miss — it should retry globally.
    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "automatically convert",
        page_id: "page_number_99_index_98", // page 99 doesn't exist in SUMMARY_JSON
        line_ids: [],
      } as unknown as CitationData,
    ];

    const result = hydrateCitations({ summaryContent: SUMMARY_JSON, citations, warnOnMiss: false });

    // Must still hydrate — the anchor exists on page 1 even though the hint is wrong
    expect(result.hydrated).toBe(1);
    expect(result.misses).toEqual([]);
    expect(citations[0].source_context?.toLowerCase()).toContain("automatically convert");
  });

  it("skips citations that already have source_context", () => {
    // hydrateCitations must not overwrite existing source_context —
    // idempotency guard so running hydrate twice doesn't corrupt existing data.
    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "automatically convert",
        source_context: "pre-existing context text",
        page_id: "page_number_1_index_0",
        line_ids: [10],
      } as CitationData,
    ];

    const result = hydrateCitations({ summaryContent: SUMMARY_JSON, citations, warnOnMiss: false });

    // hydrated=0: skipped, not hydrated again
    expect(result.hydrated).toBe(0);
    expect(citations[0].source_context).toBe("pre-existing context text");
  });
});

// ── RC5 failure scenario (iter 19 Run 3) ────────────────────────────────────
// Root cause: agent cites wrong page (e.g. page 17 certificate page instead of
// page 25 Schedule C). Hydration assembles source_context from the wrong lines
// (OCR garbage), detects anchor not present, falls through. Currently the
// fallback path sets source_context = verbatimAnchor = sourceMatch (no context),
// which causes the API to return partial_text_found (RC5) because there is no
// surrounding phrase to narrow the highlight to. The fix: include adjacent lines.
describe("hydrateCitations — wrong line IDs (RC5 regression)", () => {
  it("when wrong line IDs are provided, source_context is broader than source_match", () => {
    const citations: CitationData[] = [
      {
        id: 1,
        // Anchor appears on page 25, line 10 — but agent cited page 17, lines 4-6
        source_match: "The Commercial Units",
        page_id: "17_0",
        line_ids: [4, 5, 6],
      } as CitationData,
    ];

    hydrateCitations({ summaryContent: WRONG_PAGE_SUMMARY_JSON, citations, warnOnMiss: false });

    const fp = citations[0].source_context;
    expect(fp).toBeDefined();
    // source_context must contain the anchor
    expect(fp?.toLowerCase()).toContain("the commercial units");
    // source_context must be BROADER than just the anchor — needs surrounding context
    // so the API can compute the highlight position (anchor within phrase).
    // This assertion fails before the fix: fallback sets source_context = verbatimAnchor.
    expect(fp!.length).toBeGreaterThan("The Commercial Units".length);
    expect(fp).not.toBe("The Commercial Units");
  });

  it("when wrong line IDs are provided, line_ids are updated to actual location", () => {
    const citations: CitationData[] = [
      {
        id: 1,
        source_match: "The Commercial Units",
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
        source_match: "The Commercial Units",
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

// ── denseAnnotatePage ─────────────────────────────────────────────────────────
// Utility that wraps every non-blank line with <line id="N">...</line> so that
// callers can produce a consistently-tagged format for pages that have no
// existing OCR-derived <line id> tags.
//
// CONSTRAINT: Must NOT be applied to pages that already have sparse <line id>
// tags — those IDs are OCR-pipeline anchors corresponding to real PDF line
// positions. Re-annotating would shift IDs and break the verify API's highlight
// indexing (lineIds are 0-based indices into pdfDataForSearch[page].lines[]).
describe("denseAnnotatePage", () => {
  it("wraps each non-blank line with a sequential <line id> tag starting at 1", () => {
    const result = denseAnnotatePage("line one\nline two\nline three");
    expect(result).toBe(
      '<line id="1">line one</line>\n<line id="2">line two</line>\n<line id="3">line three</line>',
    );
  });

  it("skips blank lines and does not advance the ID counter for them", () => {
    // Blank lines (whitespace-only) must not consume an ID — the next non-blank
    // line should continue the sequence without gaps.
    const result = denseAnnotatePage("line one\n\nline two\n   \nline three");
    expect(result).toBe(
      '<line id="1">line one</line>\n<line id="2">line two</line>\n<line id="3">line three</line>',
    );
  });

  it("returns empty string for blank-only input", () => {
    expect(denseAnnotatePage("")).toBe("");
    expect(denseAnnotatePage("   \n\n  ")).toBe("");
  });

  it("trims leading/trailing whitespace from each line's content", () => {
    const result = denseAnnotatePage("  indented line  \nnormal");
    expect(result).toContain('<line id="1">indented line</line>');
    expect(result).toContain('<line id="2">normal</line>');
  });

  it("accepts a custom startId so per-page counters can continue across pages", () => {
    // A caller processing page 2 can start IDs at 1 (default) for per-page reset,
    // or at N for a global counter. Here we verify startId=5 makes IDs begin at 5.
    const result = denseAnnotatePage("first\nsecond", 5);
    expect(result).toBe('<line id="5">first</line>\n<line id="6">second</line>');
  });

  it("produces output that parseSummaryToLineMap can round-trip via extractLines", () => {
    // End-to-end: annotate a page, embed it in a summary JSON, parse it back,
    // and verify that the qualified map resolves the expected lines.
    const rawPage = "Section 1. Definitions\nThis document sets forth the terms.\nAll capitalized terms are defined below.";
    const annotated = denseAnnotatePage(rawPage);

    const summaryJson = JSON.stringify({
      attachmentId: "round-trip-test",
      deepTextPages: [annotated],
    });

    const lineMap = parseSummaryToLineMap(summaryJson);
    expect(lineMap.qualified.get("page_number_1_index_0:1")).toBe("Section 1. Definitions");
    expect(lineMap.qualified.get("page_number_1_index_0:2")).toBe("This document sets forth the terms.");
    expect(lineMap.qualified.get("page_number_1_index_0:3")).toBe("All capitalized terms are defined below.");
  });
});
