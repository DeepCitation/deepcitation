import { describe, expect, it } from "@jest/globals";
import {
  parseDeferredCitationResponse,
  getAllCitationsFromDeferredResponse,
  deferredCitationToCitation,
  hasDeferredCitations,
  extractVisibleText,
  replaceDeferredMarkers,
  getCitationMarkerIds,
} from "../parsing/deferredCitationParser.js";
import {
  CITATION_DATA_START_DELIMITER,
  CITATION_DATA_END_DELIMITER,
} from "../prompts/deferredCitationPrompt.js";

describe("parseDeferredCitationResponse", () => {
  it("parses a basic deferred citation response", () => {
    const response = `The company reported strong growth [1]. Revenue increased significantly [2].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "abc123",
    "reasoning": "directly states growth metrics",
    "full_phrase": "The company achieved 45% year-over-year growth",
    "key_span": "45% year-over-year growth",
    "page_key": "page_number_2_index_1",
    "line_ids": [12, 13]
  },
  {
    "id": 2,
    "attachment_id": "abc123",
    "reasoning": "states Q4 revenue figure",
    "full_phrase": "Q4 revenue reached $2.3 billion",
    "key_span": "$2.3 billion",
    "page_key": "page_number_3_index_2",
    "line_ids": [5, 6, 7]
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.visibleText).toBe(
      "The company reported strong growth [1]. Revenue increased significantly [2]."
    );
    expect(result.citations.length).toBe(2);
    expect(result.citationMap.get(1)?.attachment_id).toBe("abc123");
    expect(result.citationMap.get(2)?.key_span).toBe("$2.3 billion");
  });

  it("handles response without citation block", () => {
    const response = "This is a simple response without citations.";
    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.visibleText).toBe(response);
    expect(result.citations.length).toBe(0);
  });

  it("handles empty input", () => {
    const result = parseDeferredCitationResponse("");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid input");
  });

  it("handles null/undefined input", () => {
    const result = parseDeferredCitationResponse(null as unknown as string);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid input");
  });

  it("handles citations with quotes in full_phrase", () => {
    const response = `The contract states "no liability" [1].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "doc456",
    "full_phrase": "The user's liability shall be limited to \\"no liability\\" as stated",
    "key_span": "no liability",
    "page_key": "page_number_5_index_0",
    "line_ids": [20, 21]
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].full_phrase).toContain("no liability");
  });

  it("handles citations with newlines in full_phrase", () => {
    const response = `Multi-line content [1].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "doc789",
    "full_phrase": "Line one\\nLine two\\nLine three",
    "key_span": "Line two",
    "page_key": "page_number_1_index_0"
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].full_phrase).toContain("Line one");
  });

  it("handles multiple citations in single sentence", () => {
    const response = `Revenue was $1B [1] with profit of $100M [2] in Q4 [3].

${CITATION_DATA_START_DELIMITER}
[
  {"id": 1, "attachment_id": "a", "full_phrase": "$1B", "key_span": "$1B"},
  {"id": 2, "attachment_id": "a", "full_phrase": "$100M", "key_span": "$100M"},
  {"id": 3, "attachment_id": "a", "full_phrase": "Q4", "key_span": "Q4"}
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(3);
    expect(result.visibleText).toBe(
      "Revenue was $1B [1] with profit of $100M [2] in Q4 [3]."
    );
  });

  it("repairs JSON with trailing commas", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[
  {"id": 1, "attachment_id": "a", "full_phrase": "test", "key_span": "test",},
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
  });

  it("handles missing end delimiter", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "a", "full_phrase": "test", "key_span": "test"}]`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
  });

  it("handles empty citation block", () => {
    const response = `No citations here.

${CITATION_DATA_START_DELIMITER}
[]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(0);
  });

  it("normalizes camelCase field names to snake_case", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachmentId": "doc123",
    "fullPhrase": "The full phrase here",
    "keySpan": "key span",
    "pageKey": "page_number_1_index_0",
    "lineIds": [1, 2, 3]
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].attachment_id).toBe("doc123");
    expect(result.citations[0].full_phrase).toBe("The full phrase here");
    expect(result.citations[0].key_span).toBe("key span");
  });

  it("handles AV citations with timestamps", () => {
    const response = `The speaker said [1].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "video123",
    "full_phrase": "This is important",
    "key_span": "important",
    "timestamps": {
      "start_time": "00:05:23.000",
      "end_time": "00:05:45.500"
    }
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].timestamps?.start_time).toBe("00:05:23.000");
    expect(result.citations[0].timestamps?.end_time).toBe("00:05:45.500");
  });

  it("handles markdown code block markers in JSON", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
\`\`\`json
[{"id": 1, "attachment_id": "a", "full_phrase": "test", "key_span": "test"}]
\`\`\`
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
  });
});

describe("getAllCitationsFromDeferredResponse", () => {
  it("returns citations dictionary with generated keys", () => {
    const response = `Test [1] and [2].

${CITATION_DATA_START_DELIMITER}
[
  {"id": 1, "attachment_id": "abc", "full_phrase": "phrase one", "key_span": "one", "page_key": "page_number_1_index_0", "line_ids": [1]},
  {"id": 2, "attachment_id": "abc", "full_phrase": "phrase two", "key_span": "two", "page_key": "page_number_2_index_0", "line_ids": [5]}
]
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromDeferredResponse(response);

    expect(Object.keys(citations).length).toBe(2);

    // Verify the citations have proper structure
    const citationValues = Object.values(citations);
    expect(citationValues[0].fullPhrase).toBe("phrase one");
    expect(citationValues[0].attachmentId).toBe("abc");
    expect(citationValues[1].fullPhrase).toBe("phrase two");
  });

  it("returns empty object for response without citations", () => {
    const response = "Simple text without citations.";
    const citations = getAllCitationsFromDeferredResponse(response);
    expect(Object.keys(citations).length).toBe(0);
  });

  it("skips citations without fullPhrase", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "abc", "key_span": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromDeferredResponse(response);
    expect(Object.keys(citations).length).toBe(0);
  });
});

describe("deferredCitationToCitation", () => {
  it("converts deferred citation data to standard Citation format", () => {
    const data = {
      id: 1,
      attachment_id: "doc123",
      reasoning: "test reasoning",
      full_phrase: "The full phrase here",
      key_span: "key phrase",
      page_key: "page_number_3_index_2",
      line_ids: [10, 11, 12],
    };

    const citation = deferredCitationToCitation(data);

    expect(citation.attachmentId).toBe("doc123");
    expect(citation.reasoning).toBe("test reasoning");
    expect(citation.fullPhrase).toBe("The full phrase here");
    expect(citation.keySpan).toBe("key phrase");
    expect(citation.pageNumber).toBe(3);
    expect(citation.startPageKey).toBe("page_number_3_index_2");
    expect(citation.lineIds).toEqual([10, 11, 12]);
    expect(citation.citationNumber).toBe(1);
  });

  it("sorts line IDs", () => {
    const data = {
      id: 1,
      attachment_id: "doc",
      full_phrase: "test",
      line_ids: [15, 10, 12, 11],
    };

    const citation = deferredCitationToCitation(data);
    expect(citation.lineIds).toEqual([10, 11, 12, 15]);
  });

  it("handles AV citations with timestamps", () => {
    const data = {
      id: 1,
      attachment_id: "video",
      full_phrase: "transcript text",
      timestamps: {
        start_time: "00:01:00.000",
        end_time: "00:01:30.500",
      },
    };

    const citation = deferredCitationToCitation(data);
    expect(citation.timestamps?.startTime).toBe("00:01:00.000");
    expect(citation.timestamps?.endTime).toBe("00:01:30.500");
  });

  it("allows overriding citation number", () => {
    const data = {
      id: 5,
      attachment_id: "doc",
      full_phrase: "test",
    };

    const citation = deferredCitationToCitation(data, 99);
    expect(citation.citationNumber).toBe(99);
  });
});

describe("hasDeferredCitations", () => {
  it("returns true when delimiter is present", () => {
    const response = `Text ${CITATION_DATA_START_DELIMITER} [...] ${CITATION_DATA_END_DELIMITER}`;
    expect(hasDeferredCitations(response)).toBe(true);
  });

  it("returns false when delimiter is absent", () => {
    expect(hasDeferredCitations("Simple text")).toBe(false);
  });

  it("returns false for non-string input", () => {
    expect(hasDeferredCitations(null as unknown as string)).toBe(false);
    expect(hasDeferredCitations(123 as unknown as string)).toBe(false);
  });
});

describe("extractVisibleText", () => {
  it("extracts only visible text portion", () => {
    const response = `This is visible text [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "full_phrase": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    expect(extractVisibleText(response)).toBe("This is visible text [1].");
  });

  it("returns full text if no delimiter", () => {
    const response = "Full text without citations.";
    expect(extractVisibleText(response)).toBe(response);
  });
});

describe("replaceDeferredMarkers", () => {
  it("removes markers by default", () => {
    const text = "Revenue grew 45% [1] in Q4 [2].";
    expect(replaceDeferredMarkers(text)).toBe("Revenue grew 45%  in Q4 .");
  });

  it("replaces markers with key spans", () => {
    const text = "Revenue grew 45% [1] in Q4 [2].";
    const citationMap = new Map([
      [1, { id: 1, key_span: "45%" }],
      [2, { id: 2, key_span: "Q4 2024" }],
    ]);

    const result = replaceDeferredMarkers(text, {
      citationMap,
      showKeySpan: true,
    });
    expect(result).toBe("Revenue grew 45% 45% in Q4 Q4 2024.");
  });

  it("uses custom replacer function", () => {
    const text = "Test [1] and [2].";
    const result = replaceDeferredMarkers(text, {
      replacer: (id) => `(ref${id})`,
    });
    expect(result).toBe("Test (ref1) and (ref2).");
  });

  it("handles missing citations gracefully", () => {
    const text = "Test [1] and [99].";
    const citationMap = new Map([[1, { id: 1, key_span: "found" }]]);

    const result = replaceDeferredMarkers(text, {
      citationMap,
      showKeySpan: true,
    });
    expect(result).toBe("Test found and .");
  });
});

describe("getCitationMarkerIds", () => {
  it("extracts all marker IDs in order", () => {
    const text = "First [1], then [2], also [1] again, and [10].";
    expect(getCitationMarkerIds(text)).toEqual([1, 2, 1, 10]);
  });

  it("returns empty array for no markers", () => {
    expect(getCitationMarkerIds("No citations here.")).toEqual([]);
  });

  it("handles multi-digit IDs", () => {
    const text = "Citation [123] and [456].";
    expect(getCitationMarkerIds(text)).toEqual([123, 456]);
  });
});
