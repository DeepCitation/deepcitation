import { describe, expect, it } from "bun:test";
import { parseCitationResponse } from "../parsing/parseCitationResponse.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "../prompts/citationPrompts.js";
import type { VerificationRecord } from "../types/citation.js";
import { getCitationKey } from "../utils/citationKey.js";
import { makeNumericResponse } from "./testHelpers.js";

// ─── Numeric Format ───────────────────────────────────────────

describe("parseCitationResponse — numeric format", () => {
  const NUMERIC_RESPONSE = makeNumericResponse(
    "The company reported strong growth [1]. Revenue increased significantly [2].",
    [
      {
        id: 1,
        attachment_id: "abc12345678901234567",
        reasoning: "directly states growth metrics",
        source_context: "The company achieved 45% year-over-year growth",
        source_match: "45% year-over-year growth",
        page_id: "page_number_2_index_1",
        line_ids: [12, 13],
      },
      {
        id: 2,
        attachment_id: "abc12345678901234567",
        reasoning: "states Q4 revenue figure",
        source_context: "Q4 revenue reached $2.3 billion",
        source_match: "$2.3 billion",
        page_id: "page_number_3_index_2",
        line_ids: [5, 6, 7],
      },
    ],
  );

  it("detects numeric format", () => {
    const result = parseCitationResponse(NUMERIC_RESPONSE);
    expect(result.format).toBe("numeric");
  });

  it("strips the data block from visibleText", () => {
    const result = parseCitationResponse(NUMERIC_RESPONSE);
    expect(result.visibleText).toBe("The company reported strong growth [1]. Revenue increased significantly [2].");
    expect(result.visibleText).not.toContain("CITATION_DATA");
  });

  it("populates citations keyed by citationKey", () => {
    const result = parseCitationResponse(NUMERIC_RESPONSE);
    const keys = Object.keys(result.citations);
    expect(keys.length).toBe(2);

    // Each citation has correct camelCase fields
    const firstKey = result.markerMap[1];
    const first = result.citations[firstKey];
    expect(first.sourceContext).toBe("The company achieved 45% year-over-year growth");
    expect(first.sourceMatch).toBe("45% year-over-year growth");
    expect(first.type).toBe("document");
    if (first.type === "document") {
      expect(first.attachmentId).toBe("abc12345678901234567");
      expect(first.pageNumber).toBe(2);
    }
  });

  it("builds markerMap mapping [N] → citationKey", () => {
    const result = parseCitationResponse(NUMERIC_RESPONSE);
    expect(result.markerMap[1]).toBeDefined();
    expect(result.markerMap[2]).toBeDefined();

    // markerMap[N] matches getCitationKey(citations[markerMap[N]])
    for (const [_, key] of Object.entries(result.markerMap)) {
      const citation = result.citations[key];
      expect(citation).toBeDefined();
      expect(getCitationKey(citation)).toBe(key);
    }
  });

  it("does not overwrite citations when distinct markers share the same source anchor", () => {
    const response = makeNumericResponse("Severe depression [1]. Symptoms persisted [2].", [
      {
        id: 1,
        attachment_id: "abc12345678901234567",
        source_context: "Severe depression caused persistent impairment",
        source_match: "Severe depression",
        page_id: "page_number_1_index_0",
        line_ids: [10],
      },
      {
        id: 2,
        attachment_id: "abc12345678901234567",
        source_context: "Severe depression caused persistent impairment",
        source_match: "Severe depression",
        page_id: "page_number_1_index_0",
        line_ids: [10],
      },
    ]);

    const result = parseCitationResponse(response);
    const firstKey = result.markerMap[1];
    const secondKey = result.markerMap[2];

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(secondKey).not.toBe(firstKey);
    expect(result.citations[firstKey].citationNumber).toBe(1);
    expect(result.citations[secondKey].citationNumber).toBe(2);
    expect(getCitationKey(result.citations[firstKey])).toBe(firstKey);
    expect(getCitationKey(result.citations[secondKey])).toBe(firstKey);
  });

  it("split(splitPattern) produces correct segments with markers", () => {
    const result = parseCitationResponse(NUMERIC_RESPONSE);
    const segments = result.visibleText.split(result.splitPattern);

    // Segments alternate between text and [N] markers
    expect(segments).toContain("[1]");
    expect(segments).toContain("[2]");
    // First segment is plain text
    expect(segments[0]).toBe("The company reported strong growth ");
  });

  it("compact keys (n, a, f, k, p) are expanded correctly", () => {
    const compactResponse = makeNumericResponse("Growth was strong [1].", [
      {
        n: 1,
        a: "file123456789012345x",
        f: "Revenue grew 30% year over year",
        k: "grew 30%",
        p: "2_1",
      },
    ]);
    const result = parseCitationResponse(compactResponse);
    const key = result.markerMap[1];
    const citation = result.citations[key];
    expect(citation.sourceContext).toBe("Revenue grew 30% year over year");
    expect(citation.sourceMatch).toBe("grew 30%");
    if (citation.type === "document") {
      expect(citation.attachmentId).toBe("file123456789012345x");
      expect(citation.pageNumber).toBe(2);
    }
  });

  it("audio/video citations with timestamps produce type 'audio'", () => {
    const avResponse = makeNumericResponse("The speaker mentioned AI [1].", [
      {
        id: 1,
        attachment_id: "audio12345678901234x",
        source_context: "AI will transform healthcare",
        source_match: "transform healthcare",
        timestamps: { start_time: "00:01:30", end_time: "00:01:45" },
      },
    ]);
    const result = parseCitationResponse(avResponse);
    const key = result.markerMap[1];
    const citation = result.citations[key];
    expect(citation.type).toBe("audio");
    if (citation.type === "audio") {
      expect(citation.timestamps?.startTime).toBe("00:01:30");
      expect(citation.timestamps?.endTime).toBe("00:01:45");
    }
  });
});

// ─── Edge Cases ────────────────────────────────────────────────

describe("parseCitationResponse — edge cases", () => {
  it("no citations → format 'none', empty citations and markerMap", () => {
    const result = parseCitationResponse("Just a plain response with no citations.");
    expect(result.format).toBe("none");
    expect(Object.keys(result.citations).length).toBe(0);
    expect(Object.keys(result.markerMap).length).toBe(0);
    expect(result.visibleText).toBe("Just a plain response with no citations.");
  });

  it("empty string → safe empty result", () => {
    const result = parseCitationResponse("");
    expect(result.format).toBe("none");
    expect(result.visibleText).toBe("");
    expect(Object.keys(result.citations).length).toBe(0);
  });

  it("null-ish input → safe empty result", () => {
    // @ts-expect-error — testing runtime safety with invalid input
    const result = parseCitationResponse(null);
    expect(result.format).toBe("none");
    expect(result.visibleText).toBe("");

    // @ts-expect-error — testing runtime safety with invalid input
    const result2 = parseCitationResponse(undefined);
    expect(result2.format).toBe("none");
  });

  it("malformed JSON block → numeric format with empty citations", () => {
    const malformed = `Some text [1].\n\n${CITATION_DATA_START_DELIMITER}\n{invalid json not parseable`;
    const result = parseCitationResponse(malformed);
    expect(result.format).toBe("numeric");
    expect(Object.keys(result.citations).length).toBe(0);
    expect(Object.keys(result.markerMap).length).toBe(0);
    expect(result.visibleText).toBe("Some text [1].");
  });

  it("marker number not in markerMap returns undefined", () => {
    const response = makeNumericResponse("Claim [1] and [3].", [
      { id: 1, attachment_id: "att_1", source_context: "Claim one", source_match: "Claim" },
    ]);
    const result = parseCitationResponse(response);
    expect(result.markerMap[1]).toBeDefined();
    expect(result.markerMap[3]).toBeUndefined();
  });

  it("recovers valid grouped citation objects from a truncated citation-data block", () => {
    const response = `Diagnosis: **Acrophobia** [11].

${CITATION_DATA_START_DELIMITER}
{
  "attachment-alpha": [
    {
      "id": 11,
      "reasoning": "Secondary diagnosis",
      "source_context": "Acrophobia.",
      "source_match": "Acrophobia",
      "page_id": "page_number_1_index_0",
      "line_ids": [6]
    },
    {
      "id": 12,
      "reasoning": "This object is truncated",
      "source_context": "unterminated`;

    const result = parseCitationResponse(response);
    const citation = result.citations[result.markerMap[11]];

    expect(citation?.attachmentId).toBe("attachment-alpha");
    expect(citation?.sourceMatch).toBe("Acrophobia");
  });

  it("resolves duplicate numeric IDs by the visible claim near the marker", () => {
    const response = `Limitations include **chronic pain** [84] and using hand for long periods [85].

${CITATION_DATA_START_DELIMITER}
{
  "attachment-a": [
    {
      "id": 84,
      "source_context": "coping skills",
      "source_match": "coping skills",
      "page_id": "page_number_1_index_0"
    },
    {
      "id": 85,
      "source_context": "psychologist Tracy with Alberta Health Services",
      "source_match": "psychologist Tracy with Alberta",
      "page_id": "page_number_1_index_0"
    }
  ],
  "attachment-b": [
    {
      "id": 84,
      "source_context": "Chronic pain",
      "source_match": "chronic pain",
      "page_id": "page_number_1_index_0"
    },
    {
      "id": 85,
      "source_context": "the hand for long periods",
      "source_match": "Using hand for long periods",
      "page_id": "page_number_1_index_0"
    }
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationResponse(response);

    expect(result.citations[result.markerMap[84]]?.sourceMatch).toBe("chronic pain");
    expect(result.citations[result.markerMap[85]]?.sourceMatch).toBe("Using hand for long periods");
  });
});

// ─── Integration: React rendering pattern ──────────────────────

describe("parseCitationResponse — integration patterns", () => {
  it("numeric format: split → markerMap → CitationComponent pattern", () => {
    const response = makeNumericResponse("Revenue grew [1] in Q4 [2].", [
      {
        id: 1,
        attachment_id: "abc12345678901234567",
        source_context: "Revenue grew 23%",
        source_match: "grew 23%",
        page_id: "1_0",
      },
      {
        id: 2,
        attachment_id: "abc12345678901234567",
        source_context: "Q4 results exceeded expectations",
        source_match: "exceeded expectations",
        page_id: "2_0",
      },
    ]);

    const result = parseCitationResponse(response);
    const segments = result.visibleText.split(result.splitPattern);

    // Simulate React rendering
    const rendered: string[] = [];
    for (const seg of segments) {
      const match = seg.match(/^\[(\d+)\]$/);
      if (match) {
        const n = Number(match[1]);
        const key = result.markerMap[n];
        const citation = result.citations[key];
        rendered.push(`[Citation: ${citation.sourceMatch}]`);
      } else if (seg) {
        rendered.push(seg);
      }
    }

    expect(rendered.join("")).toBe("Revenue grew [Citation: grew 23%] in Q4 [Citation: exceeded expectations].");
  });

  it("verification lookup: verifications[markerMap[N]] returns correct verification", () => {
    const response = makeNumericResponse("Claim A [1] and claim B [2].", [
      {
        id: 1,
        attachment_id: "abc12345678901234567",
        source_context: "Claim A is substantiated",
        source_match: "Claim A",
        page_id: "1_0",
      },
      {
        id: 2,
        attachment_id: "abc12345678901234567",
        source_context: "Claim B has supporting evidence",
        source_match: "Claim B",
        page_id: "2_0",
      },
    ]);

    const result = parseCitationResponse(response);

    // Simulate verifications keyed by citationKey (as returned by verifyCitations)
    const verifications: VerificationRecord = {};
    verifications[result.markerMap[1]] = {
      status: "found",
      label: "Claim A",
    } as any;
    verifications[result.markerMap[2]] = {
      status: "not_found",
      label: "Claim B",
    } as any;

    // Lookup via markerMap
    expect(verifications[result.markerMap[1]]?.status).toBe("found");
    expect(verifications[result.markerMap[2]]?.status).toBe("not_found");
  });
});

// ─── Cite Link Format ────────────────────────────────────────────

describe("parseCitationResponse — cite link format", () => {
  const CITE_LINK_RESPONSE = makeNumericResponse(
    "The [Discount Rate](cite:1) is applied to the [Conversion Price](cite:2).",
    [
      {
        id: 1,
        attachment_id: "abc12345678901234567",
        source_context: "The discount rate of 80%",
        source_match: "Discount Rate",
        page_id: "page_number_2_index_1",
        line_ids: [12, 13],
      },
      {
        id: 2,
        attachment_id: "abc12345678901234567",
        source_context: "Conversion price equals the VWAP",
        source_match: "Conversion Price",
        page_id: "page_number_3_index_2",
        line_ids: [5, 6],
      },
    ],
  );

  it("detects cite-link format (or numeric — same JSON block)", () => {
    const result = parseCitationResponse(CITE_LINK_RESPONSE);
    expect(result.format).toBe("numeric");
  });

  it("preserves cite-link markers in visibleText for downstream splitting", () => {
    const result = parseCitationResponse(CITE_LINK_RESPONSE);
    expect(result.visibleText).toContain("[Discount Rate](cite:1)");
    expect(result.visibleText).toContain("[Conversion Price](cite:2)");
    expect(result.visibleText).not.toContain(CITATION_DATA_START_DELIMITER);
  });

  it("populates markerMap for cite-link IDs", () => {
    const result = parseCitationResponse(CITE_LINK_RESPONSE);
    expect(result.markerMap[1]).toBeDefined();
    expect(result.markerMap[2]).toBeDefined();
  });

  it("splitPattern captures cite-link segments", () => {
    const result = parseCitationResponse(CITE_LINK_RESPONSE);
    const segments = result.visibleText.split(result.splitPattern);
    expect(segments).toContain("[Discount Rate](cite:1)");
    expect(segments).toContain("[Conversion Price](cite:2)");
    expect(segments[0]).toBe("The ");
  });

  it("resolves citation data via markerMap", () => {
    const result = parseCitationResponse(CITE_LINK_RESPONSE);
    const key1 = result.markerMap[1];
    expect(result.citations[key1].sourceContext).toBe("The discount rate of 80%");
    expect(result.citations[key1].sourceMatch).toBe("Discount Rate");
  });

  it("handles mixed [N] and cite-link in same visibleText", () => {
    const mixed = makeNumericResponse("Old [1] and [New Rate](cite:2).", [
      { id: 1, attachment_id: "a", source_context: "old thing", source_match: "Old" },
      { id: 2, attachment_id: "a", source_context: "new rate value", source_match: "New Rate" },
    ]);
    const result = parseCitationResponse(mixed);
    const segments = result.visibleText.split(result.splitPattern);
    expect(segments).toContain("[1]");
    expect(segments).toContain("[New Rate](cite:2)");
    expect(result.markerMap[1]).toBeDefined();
    expect(result.markerMap[2]).toBeDefined();
  });

  it("splitPattern does not produce cite-link as a single unsplit text block", () => {
    const result = parseCitationResponse(CITE_LINK_RESPONSE);
    const segments = result.visibleText.split(result.splitPattern);
    expect(segments[0]).not.toContain("(cite:");
  });
});

// ─── Issue-235: orphan marker admission (sourceMatch without sourceContext) ──

describe("parseCitationResponse — sourceMatch-only admission (issue-235)", () => {
  it("admits a citation that has sourceMatch but no sourceContext", () => {
    // Simulates an LLM output where the citation block has sourceMatch + pageNumber
    // but omits sourceContext entirely. Before the fix, this entry was silently
    // dropped, leaving [3] in prose with no markerMap entry → permanent pulsing chip.
    const response = makeNumericResponse(
      "The patient has moderate impairment [3] and follows medication schedule [4].",
      [
        {
          id: 3,
          attachment_id: "att_aish_form_123456789",
          reasoning: "Selected option for mental health impairment",
          // No source_context — only source_match
          source_match: "Medium or moderate impairment",
          page_id: "page_number_1_index_0",
          line_ids: [14],
        },
        {
          id: 4,
          attachment_id: "att_aish_form_123456789",
          reasoning: "Medication adherence",
          source_context: "Patient follows prescribed medication schedule",
          source_match: "medication schedule",
          page_id: "page_number_2_index_0",
          line_ids: [7],
        },
      ],
    );

    const result = parseCitationResponse(response);

    // Both markers must have entries — no orphan
    expect(result.markerMap[3]).toBeDefined();
    expect(result.markerMap[4]).toBeDefined();

    // The sourceMatch-only entry must be in citations
    const citationKey3 = result.markerMap[3];
    const citation3 = result.citations[citationKey3];
    expect(citation3).toBeDefined();
    expect(citation3.sourceMatch).toBe("Medium or moderate impairment");
    // sourceContext should be absent/empty (not fabricated)
    expect(citation3.sourceContext ?? "").toBe("");

    // The normal entry is unaffected
    const citationKey4 = result.markerMap[4];
    expect(result.citations[citationKey4].sourceContext).toBe("Patient follows prescribed medication schedule");
  });

  it("does not admit an entry with neither sourceContext nor sourceMatch", () => {
    // An entry with no searchable text should still be dropped — it provides
    // no way to locate or display the citation.
    const response = makeNumericResponse("Claim one [1] and claim two [2].", [
      {
        id: 1,
        attachment_id: "att_aish_form_123456789",
        reasoning: "First claim",
        source_context: "Valid source context",
        source_match: "Valid match",
        page_id: "page_number_1_index_0",
      },
      {
        id: 2,
        attachment_id: "att_aish_form_123456789",
        reasoning: "Second claim has no searchable text",
        // Both source_context and source_match are absent
        page_id: "page_number_1_index_0",
      },
    ]);

    const result = parseCitationResponse(response);
    expect(result.markerMap[1]).toBeDefined();
    // Entry 2 has no searchable text — still silently dropped
    expect(result.markerMap[2]).toBeUndefined();
  });
});
