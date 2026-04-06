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
