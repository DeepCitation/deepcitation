import { describe, expect, it } from "@jest/globals";
import { parseCitationResponse } from "../parsing/parseCitationResponse.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "../prompts/citationPrompts.js";
import type { VerificationRecord } from "../types/citation.js";
import { getCitationKey } from "../utils/citationKey.js";

// ─── Helpers ───────────────────────────────────────────────────

/** Build a numeric-format LLM response from visible text + citation data array. */
function makeNumericResponse(visibleText: string, citations: unknown[]): string {
  return `${visibleText}\n\n${CITATION_DATA_START_DELIMITER}\n${JSON.stringify(citations)}\n${CITATION_DATA_END_DELIMITER}`;
}

// ─── Numeric Format ───────────────────────────────────────────

describe("parseCitationResponse — numeric format", () => {
  const NUMERIC_RESPONSE = makeNumericResponse(
    "The company reported strong growth [1]. Revenue increased significantly [2].",
    [
      {
        id: 1,
        attachment_id: "abc12345678901234567",
        reasoning: "directly states growth metrics",
        full_phrase: "The company achieved 45% year-over-year growth",
        anchor_text: "45% year-over-year growth",
        page_id: "page_number_2_index_1",
        line_ids: [12, 13],
      },
      {
        id: 2,
        attachment_id: "abc12345678901234567",
        reasoning: "states Q4 revenue figure",
        full_phrase: "Q4 revenue reached $2.3 billion",
        anchor_text: "$2.3 billion",
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
    expect(first.fullPhrase).toBe("The company achieved 45% year-over-year growth");
    expect(first.anchorText).toBe("45% year-over-year growth");
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
    expect(citation.fullPhrase).toBe("Revenue grew 30% year over year");
    expect(citation.anchorText).toBe("grew 30%");
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
        full_phrase: "AI will transform healthcare",
        anchor_text: "transform healthcare",
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
      { id: 1, attachment_id: "att_1", full_phrase: "Claim one", anchor_text: "Claim" },
    ]);
    const result = parseCitationResponse(response);
    expect(result.markerMap[1]).toBeDefined();
    expect(result.markerMap[3]).toBeUndefined();
  });
});

// ─── Integration: React rendering pattern ──────────────────────

describe("parseCitationResponse — integration patterns", () => {
  it("numeric format: split → markerMap → CitationComponent pattern", () => {
    const response = makeNumericResponse("Revenue grew [1] in Q4 [2].", [
      {
        id: 1,
        attachment_id: "abc12345678901234567",
        full_phrase: "Revenue grew 23%",
        anchor_text: "grew 23%",
        page_id: "1_0",
      },
      {
        id: 2,
        attachment_id: "abc12345678901234567",
        full_phrase: "Q4 results exceeded expectations",
        anchor_text: "exceeded expectations",
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
        rendered.push(`[Citation: ${citation.anchorText}]`);
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
        full_phrase: "Claim A is substantiated",
        anchor_text: "Claim A",
        page_id: "1_0",
      },
      {
        id: 2,
        attachment_id: "abc12345678901234567",
        full_phrase: "Claim B has supporting evidence",
        anchor_text: "Claim B",
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
