import { describe, expect, it } from "@jest/globals";
import {
  deferredCitationToCitation,
  extractVisibleText,
  getAllCitationsFromDeferredResponse,
  getCitationMarkerIds,
  hasDeferredCitations,
  parseDeferredCitationResponse,
  replaceDeferredMarkers,
} from "../parsing/citationParser.js";
import {
  CITATION_DATA_END_DELIMITER,
  CITATION_DATA_START_DELIMITER,
} from "../prompts/citationPrompts.js";

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
    "anchor_text": "45% year-over-year growth",
    "page_id": "page_number_2_index_1",
    "line_ids": [12, 13]
  },
  {
    "id": 2,
    "attachment_id": "abc123",
    "reasoning": "states Q4 revenue figure",
    "full_phrase": "Q4 revenue reached $2.3 billion",
    "anchor_text": "$2.3 billion",
    "page_id": "page_number_3_index_2",
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
    expect(result.citationMap.get(2)?.anchor_text).toBe("$2.3 billion");
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
    "anchor_text": "no liability",
    "page_id": "page_number_5_index_0",
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
    "anchor_text": "Line two",
    "page_id": "page_number_1_index_0"
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
  {"id": 1, "attachment_id": "a", "full_phrase": "$1B", "anchor_text": "$1B"},
  {"id": 2, "attachment_id": "a", "full_phrase": "$100M", "anchor_text": "$100M"},
  {"id": 3, "attachment_id": "a", "full_phrase": "Q4", "anchor_text": "Q4"}
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
  {"id": 1, "attachment_id": "a", "full_phrase": "test", "anchor_text": "test",},
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
  });

  it("handles missing end delimiter", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "a", "full_phrase": "test", "anchor_text": "test"}]`;

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

  it("handles AV citations with timestamps", () => {
    const response = `The speaker said [1].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "video123",
    "full_phrase": "This is important",
    "anchor_text": "important",
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
[{"id": 1, "attachment_id": "a", "full_phrase": "test", "anchor_text": "test"}]
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
  {"id": 1, "attachment_id": "abc", "full_phrase": "phrase one", "anchor_text": "one", "page_id": "page_number_1_index_0", "line_ids": [1]},
  {"id": 2, "attachment_id": "abc", "full_phrase": "phrase two", "anchor_text": "two", "page_id": "page_number_2_index_0", "line_ids": [5]}
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
[{"id": 1, "attachment_id": "abc", "anchor_text": "test"}]
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
      anchor_text: "anchor text",
      page_id: "page_number_3_index_2",
      line_ids: [10, 11, 12],
    };

    const citation = deferredCitationToCitation(data);

    expect(citation.attachmentId).toBe("doc123");
    expect(citation.reasoning).toBe("test reasoning");
    expect(citation.fullPhrase).toBe("The full phrase here");
    expect(citation.anchorText).toBe("anchor text");
    expect(citation.pageNumber).toBe(3);
    expect(citation.startPageId).toBe("page_number_3_index_2");
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
      [1, { id: 1, anchor_text: "45%" }],
      [2, { id: 2, anchor_text: "Q4 2024" }],
    ]);

    const result = replaceDeferredMarkers(text, {
      citationMap,
      showAnchorText: true,
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
    const citationMap = new Map([[1, { id: 1, anchor_text: "found" }]]);

    const result = replaceDeferredMarkers(text, {
      citationMap,
      showAnchorText: true,
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

describe("compact format support", () => {
  it("parses compact short-key format", () => {
    const response = `The company grew [1]. Revenue increased [2].

${CITATION_DATA_START_DELIMITER}
[
  {"n":1,"a":"abc123","r":"states growth","f":"45% year-over-year growth","k":"45% growth","p":"2_1","l":[12,13]},
  {"n":2,"a":"abc123","r":"states revenue","f":"Q4 revenue reached $2.3 billion","k":"$2.3 billion","p":"3_2","l":[5,6,7]}
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);

    // Verify keys are expanded to full names
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].attachment_id).toBe("abc123");
    expect(result.citations[0].reasoning).toBe("states growth");
    expect(result.citations[0].full_phrase).toBe("45% year-over-year growth");
    expect(result.citations[0].anchor_text).toBe("45% growth");
    expect(result.citations[0].page_id).toBe("2_1");
    expect(result.citations[0].line_ids).toEqual([12, 13]);

    // Verify citation map uses expanded id
    expect(result.citationMap.get(1)?.attachment_id).toBe("abc123");
    expect(result.citationMap.get(2)?.anchor_text).toBe("$2.3 billion");
  });

  it("parses compact AV citations with short timestamp keys", () => {
    const response = `The speaker said [1].

${CITATION_DATA_START_DELIMITER}
[
  {"n":1,"a":"video123","r":"explains concept","f":"This is important","k":"important","t":{"s":"00:05:23.000","e":"00:05:45.500"}}
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].attachment_id).toBe("video123");
    expect(result.citations[0].timestamps?.start_time).toBe("00:05:23.000");
    expect(result.citations[0].timestamps?.end_time).toBe("00:05:45.500");
  });

  it("handles mixed compact and full key formats", () => {
    const response = `Test [1] and [2].

${CITATION_DATA_START_DELIMITER}
[
  {"n":1,"a":"doc1","f":"compact format","k":"compact"},
  {"id":2,"attachment_id":"doc2","full_phrase":"full format","anchor_text":"full"}
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].full_phrase).toBe("compact format");
    expect(result.citations[1].id).toBe(2);
    expect(result.citations[1].full_phrase).toBe("full format");
  });
});

describe("grouped by attachment format", () => {
  it("parses grouped format with multiple citations per attachment", () => {
    const response = `The company grew [1]. Revenue increased [2].

${CITATION_DATA_START_DELIMITER}
{
  "abc123": [
    {"id": 1, "reasoning": "states growth", "full_phrase": "45% year-over-year growth", "anchor_text": "45% growth", "page_id": "2_1", "line_ids": [12, 13]},
    {"id": 2, "reasoning": "states revenue", "full_phrase": "Q4 revenue reached $2.3 billion", "anchor_text": "$2.3 billion", "page_id": "3_2", "line_ids": [5, 6, 7]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);

    // Verify attachment_id is injected from the group key
    expect(result.citations[0].attachment_id).toBe("abc123");
    expect(result.citations[1].attachment_id).toBe("abc123");

    // Verify other fields
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].full_phrase).toBe("45% year-over-year growth");
    expect(result.citations[1].id).toBe(2);
    expect(result.citations[1].anchor_text).toBe("$2.3 billion");
  });

  it("parses grouped format with multiple attachments", () => {
    const response = `From doc1 [1] and doc2 [2].

${CITATION_DATA_START_DELIMITER}
{
  "doc1": [
    {"id": 1, "full_phrase": "content from doc1", "anchor_text": "doc1"}
  ],
  "doc2": [
    {"id": 2, "full_phrase": "content from doc2", "anchor_text": "doc2"}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);

    expect(result.citations[0].attachment_id).toBe("doc1");
    expect(result.citations[0].full_phrase).toBe("content from doc1");

    expect(result.citations[1].attachment_id).toBe("doc2");
    expect(result.citations[1].full_phrase).toBe("content from doc2");
  });

  it("parses grouped format with compact keys", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
{
  "attachment123": [
    {"n": 1, "r": "reason", "f": "full phrase here", "k": "phrase", "p": "1_0", "l": [5]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].attachment_id).toBe("attachment123");
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].reasoning).toBe("reason");
    expect(result.citations[0].full_phrase).toBe("full phrase here");
    expect(result.citations[0].anchor_text).toBe("phrase");
    expect(result.citations[0].page_id).toBe("1_0");
    expect(result.citations[0].line_ids).toEqual([5]);
  });

  it("parses grouped AV format with timestamps", () => {
    const response = `The speaker said [1].

${CITATION_DATA_START_DELIMITER}
{
  "video456": [
    {"id": 1, "full_phrase": "transcript text", "anchor_text": "text", "timestamps": {"start_time": "00:01:00.000", "end_time": "00:01:30.000"}}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].attachment_id).toBe("video456");
    expect(result.citations[0].timestamps?.start_time).toBe("00:01:00.000");
    expect(result.citations[0].timestamps?.end_time).toBe("00:01:30.000");
  });

  it("still supports flat array format for backward compatibility", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "abc", "full_phrase": "test", "anchor_text": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].attachment_id).toBe("abc");
  });

  it("converts grouped format to standard Citation format correctly", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
{
  "docXYZ": [
    {"id": 1, "full_phrase": "the quote", "anchor_text": "quote", "page_id": "5_2", "line_ids": [10, 11]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromDeferredResponse(response);
    const citationValues = Object.values(citations);

    expect(citationValues.length).toBe(1);
    expect(citationValues[0].attachmentId).toBe("docXYZ");
    expect(citationValues[0].fullPhrase).toBe("the quote");
    expect(citationValues[0].pageNumber).toBe(5);
    expect(citationValues[0].startPageId).toBe("page_number_5_index_2");
  });
});

describe("simplified page_id format", () => {
  it("parses simplified N_I page format", () => {
    const data = {
      id: 1,
      attachment_id: "doc",
      full_phrase: "test phrase",
      anchor_text: "test",
      page_id: "3_2",
      line_ids: [10],
    };

    const citation = deferredCitationToCitation(data);

    expect(citation.pageNumber).toBe(3);
    expect(citation.startPageId).toBe("page_number_3_index_2");
  });

  it("still parses legacy page_number_N_index_I format", () => {
    const data = {
      id: 1,
      attachment_id: "doc",
      full_phrase: "test phrase",
      anchor_text: "test",
      page_id: "page_number_5_index_3",
      line_ids: [20],
    };

    const citation = deferredCitationToCitation(data);

    expect(citation.pageNumber).toBe(5);
    expect(citation.startPageId).toBe("page_number_5_index_3");
  });

  it("handles single-digit and multi-digit page numbers", () => {
    const singleDigit = deferredCitationToCitation({
      id: 1,
      page_id: "1_0",
      full_phrase: "test",
    });
    expect(singleDigit.pageNumber).toBe(1);
    expect(singleDigit.startPageId).toBe("page_number_1_index_0");

    const multiDigit = deferredCitationToCitation({
      id: 2,
      page_id: "123_45",
      full_phrase: "test",
    });
    expect(multiDigit.pageNumber).toBe(123);
    expect(multiDigit.startPageId).toBe("page_number_123_index_45");
  });

  it("returns undefined for invalid page_id format", () => {
    const data = {
      id: 1,
      attachment_id: "doc",
      full_phrase: "test",
      page_id: "invalid_format",
    };

    const citation = deferredCitationToCitation(data);

    expect(citation.pageNumber).toBeUndefined();
    expect(citation.startPageId).toBeUndefined();
  });

  it("auto-corrects 0_0 to page 1 (only when both page and index are 0)", () => {
    // page_id "0_0" should be corrected to page 1, index 0
    const zeroIndexed = deferredCitationToCitation({
      id: 1,
      page_id: "0_0",
      full_phrase: "test",
    });
    expect(zeroIndexed.pageNumber).toBe(1);
    expect(zeroIndexed.startPageId).toBe("page_number_1_index_0");
  });

  it("does NOT auto-correct ambiguous page_ids like 0_5", () => {
    // page_id "0_5" is ambiguous - could be page 0 with index 5, or a mistake
    // We should NOT guess, so leave it as page 0
    const zeroWithIndex = deferredCitationToCitation({
      id: 2,
      page_id: "0_5",
      full_phrase: "test",
    });
    expect(zeroWithIndex.pageNumber).toBe(0);
    expect(zeroWithIndex.startPageId).toBe("page_number_0_index_5");
  });

  it("does NOT change non-zero page numbers", () => {
    // Non-zero page numbers should NOT be corrected
    const pageTwo = deferredCitationToCitation({
      id: 3,
      page_id: "2_0",
      full_phrase: "test",
    });
    expect(pageTwo.pageNumber).toBe(2);
    expect(pageTwo.startPageId).toBe("page_number_2_index_0");
  });

  it("auto-corrects legacy format page_number_0_index_0", () => {
    // Legacy format "page_number_0_index_0" should also be corrected
    const legacyZero = deferredCitationToCitation({
      id: 1,
      page_id: "page_number_0_index_0",
      full_phrase: "test",
    });
    expect(legacyZero.pageNumber).toBe(1);
    expect(legacyZero.startPageId).toBe("page_number_1_index_0");
  });

  it("does NOT auto-correct ambiguous legacy format like page_number_0_index_5", () => {
    // Legacy format with page 0 but non-zero index is ambiguous
    const legacyAmbiguous = deferredCitationToCitation({
      id: 1,
      page_id: "page_number_0_index_5",
      full_phrase: "test",
    });
    expect(legacyAmbiguous.pageNumber).toBe(0);
    expect(legacyAmbiguous.startPageId).toBe("page_number_0_index_5");
  });
});

describe("JSON repair - invalid escape sequences", () => {
  it("repairs invalid escape sequences like \\~", () => {
    const response = `Patient info [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "Output \\~100/hr", "anchor_text": "Output ~100/hr"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].full_phrase).toBe("Output ~100/hr");
  });

  it("repairs multiple invalid escape sequences in same string", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "\\~test\\xvalue\\!", "anchor_text": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].full_phrase).toBe("~testxvalue!");
  });

  it("preserves valid escape sequences while fixing invalid ones", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "line1\\nline2\\~test", "anchor_text": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \n should be preserved, \~ should become ~
    expect(result.citations[0].full_phrase).toBe("line1\nline2~test");
  });

  it("handles medical notation with special characters", () => {
    const response = `Patient is John Doe [1].

${CITATION_DATA_START_DELIMITER}
{
  "0": [
    {"id": 1, "reasoning": "summarizes info", "full_phrase": "Output \\~100/hr", "anchor_text": "Output ~100/hr", "page_id": "0_0", "line_ids": [30]},
    {"id": 1, "reasoning": "summarizes info", "full_phrase": "Na+ 138", "anchor_text": "Na+ 138", "page_id": "0_0", "line_ids": [36]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].full_phrase).toBe("Output ~100/hr");
    expect(result.citations[0].attachment_id).toBe("0");
  });

  it("preserves valid unicode escape sequences like \\u0020", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "space\\u0020here", "anchor_text": "space here"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \u0020 is a valid unicode escape for space and should be preserved
    expect(result.citations[0].full_phrase).toBe("space here");
  });

  it("preserves multiple valid unicode escapes in same string", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "a\\u0041b\\u0042c", "anchor_text": "aAbBc"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \u0041 = 'A', \u0042 = 'B'
    expect(result.citations[0].full_phrase).toBe("aAbBc");
  });

  it("repairs invalid unicode-like sequences (not followed by 4 hex digits)", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "test\\utest", "anchor_text": "testutest"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \utest is invalid (not 4 hex digits), backslash should be removed
    expect(result.citations[0].full_phrase).toBe("testutest");
  });

  it("handles mixed valid unicode escapes and invalid escapes", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "\\~prefix\\u0020middle\\u0020\\xsuffix", "anchor_text": "prefix middle suffix"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \~ and \x should be repaired (backslash removed)
    // \u0020 should be preserved as space
    expect(result.citations[0].full_phrase).toBe("~prefix middle xsuffix");
  });

  it("preserves unicode escapes with lowercase hex digits", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "test\\u00e9test", "anchor_text": "testétest"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \u00e9 = 'é' (valid lowercase hex)
    expect(result.citations[0].full_phrase).toBe("testétest");
  });

  it("preserves unicode escapes with uppercase hex digits", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "test\\u00E9test", "anchor_text": "testétest"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \u00E9 = 'é' (valid uppercase hex)
    expect(result.citations[0].full_phrase).toBe("testétest");
  });

  it("repairs \\u followed by only 3 hex digits", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "test\\u00Fvalue", "anchor_text": "testu00Fvalue"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \u00F is invalid (only 3 hex digits), backslash should be removed
    expect(result.citations[0].full_phrase).toBe("testu00Fvalue");
  });

  it("repairs consecutive invalid unicode-like escapes", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "test\\utest\\u00Gend", "anchor_text": "testutestu00Gend"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \utest is invalid (non-hex chars), \u00G is invalid (G is not hex)
    // Both should have backslashes removed
    expect(result.citations[0].full_phrase).toBe("testutestu00Gend");
  });

  it("preserves valid unicode escape at end of string", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "full_phrase": "test\\u0020", "anchor_text": "test "}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    // \u0020 at end of string should be preserved as space
    expect(result.citations[0].full_phrase).toBe("test ");
  });
});

describe("grouped format with numeric string keys", () => {
  it("parses grouped format with numeric string key like '0'", () => {
    const response = `Patient info [1].

${CITATION_DATA_START_DELIMITER}
{
  "0": [
    {"id": 1, "reasoning": "summarizes info", "full_phrase": "John Doe 50/M", "anchor_text": "John Doe", "page_id": "0_0", "line_ids": [1]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    // The numeric string "0" should be used as-is for attachment_id
    expect(result.citations[0].attachment_id).toBe("0");
    expect(result.citations[0].page_id).toBe("0_0");
  });

  it("parses grouped format with multiple numeric string keys", () => {
    const response = `From page 0 [1] and page 1 [2].

${CITATION_DATA_START_DELIMITER}
{
  "0": [
    {"id": 1, "full_phrase": "content from page 0", "anchor_text": "page 0", "page_id": "0_0", "line_ids": [1]}
  ],
  "1": [
    {"id": 2, "full_phrase": "content from page 1", "anchor_text": "page 1", "page_id": "1_0", "line_ids": [1]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].attachment_id).toBe("0");
    expect(result.citations[1].attachment_id).toBe("1");
  });

  it("converts numeric string key grouped format to standard Citation format", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
{
  "0": [
    {"id": 1, "full_phrase": "the quote", "anchor_text": "quote", "page_id": "0_0", "line_ids": [10, 11]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromDeferredResponse(response);
    const citationValues = Object.values(citations);

    expect(citationValues.length).toBe(1);
    expect(citationValues[0].attachmentId).toBe("0");
    expect(citationValues[0].fullPhrase).toBe("the quote");
    // page_id "0_0" is auto-corrected to page 1 (1-indexed)
    expect(citationValues[0].pageNumber).toBe(1);
    expect(citationValues[0].startPageId).toBe("page_number_1_index_0");
  });
});

describe("real-world medical document scenario", () => {
  it("parses grouped format with compact keys and real attachment ID", () => {
    const response = `Here is a summary of the key information from the document:
Patient Information:
Story/Timeline:
Medical History:
Plan:
Vitals/Assessment:
Labs:
Medications (Gtts):
Devices/Other:
LDAs (Lines/Drains/Arteries):
Consults:
Family:
${CITATION_DATA_START_DELIMITER}
{
  "646274488": [
    {"id": 1, "r": "patient demographics", "f": "10 John Doe 50/M Full", "k": "John Doe 50/M", "p": "0_0", "l": [1, 2, 3]},
    {"id": 1, "r": "states story of the patient", "f": "15/15-worsening SUB at home 5/17-admitted at outside hospital", "k": "worsening SUB at home", "p": "0_0", "l": [12, 13, 14, 15]},
    {"id": 1, "r": "lists patient's medical history", "f": "HTN, CAD, HFrEF, Hypothyroid, HLD", "k": "HTN, CAD, HFrEF", "p": "0_0", "l": [8, 9, 10]},
    {"id": 1, "r": "lists the plan for the patient", "f": "PLAN: Optimize for transplant", "k": "Optimize for transplant", "p": "0_0", "l": [23]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(4);

    // Check first citation - patient demographics
    expect(result.citations[0].attachment_id).toBe("646274488");
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].reasoning).toBe("patient demographics");
    expect(result.citations[0].full_phrase).toBe("10 John Doe 50/M Full");
    expect(result.citations[0].anchor_text).toBe("John Doe 50/M");
    expect(result.citations[0].page_id).toBe("0_0");
    expect(result.citations[0].line_ids).toEqual([1, 2, 3]);

    // Check last citation - plan
    expect(result.citations[3].reasoning).toBe(
      "lists the plan for the patient"
    );
    expect(result.citations[3].anchor_text).toBe("Optimize for transplant");
  });

  it("converts medical document citations to standard Citation format", () => {
    const response = `Summary [1].
${CITATION_DATA_START_DELIMITER}
{
  "646274488": [
    {"id": 1, "r": "patient demographics", "f": "10 John Doe 50/M Full", "k": "John Doe 50/M", "p": "0_0", "l": [1, 2, 3]},
    {"id": 1, "r": "lists patient's labs", "f": "Na+ 138 k+ 4.4 Mg 1.7 Cr 1.21 WBC 18", "k": "Na+ 138", "p": "0_0", "l": [68, 69, 70]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromDeferredResponse(response);
    const citationValues = Object.values(citations);

    expect(citationValues.length).toBe(2);

    // Verify first citation conversion
    expect(citationValues[0].attachmentId).toBe("646274488");
    expect(citationValues[0].fullPhrase).toBe("10 John Doe 50/M Full");
    expect(citationValues[0].anchorText).toBe("John Doe 50/M");
    // page_id "0_0" is auto-corrected to page 1 (1-indexed)
    expect(citationValues[0].pageNumber).toBe(1);
    expect(citationValues[0].startPageId).toBe("page_number_1_index_0");
    expect(citationValues[0].lineIds).toEqual([1, 2, 3]);
    expect(citationValues[0].reasoning).toBe("patient demographics");

    // Verify second citation conversion
    expect(citationValues[1].fullPhrase).toBe(
      "Na+ 138 k+ 4.4 Mg 1.7 Cr 1.21 WBC 18"
    );
    expect(citationValues[1].anchorText).toBe("Na+ 138");
  });

  it("handles multiple citations with same id in grouped format", () => {
    const response = `Patient info [1].
${CITATION_DATA_START_DELIMITER}
{
  "abc123": [
    {"id": 1, "r": "first item", "f": "First phrase", "k": "First", "p": "0_0", "l": [1]},
    {"id": 1, "r": "second item", "f": "Second phrase", "k": "Second", "p": "0_0", "l": [5]},
    {"id": 1, "r": "third item", "f": "Third phrase", "k": "Third", "p": "0_0", "l": [10]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(3);

    // All should have the same id but different content
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[1].id).toBe(1);
    expect(result.citations[2].id).toBe(1);

    expect(result.citations[0].full_phrase).toBe("First phrase");
    expect(result.citations[1].full_phrase).toBe("Second phrase");
    expect(result.citations[2].full_phrase).toBe("Third phrase");
  });

  it("handles special characters in medical notation", () => {
    const response = `Patient vitals [1].
${CITATION_DATA_START_DELIMITER}
{
  "doc123": [
    {"id": 1, "r": "vitals", "f": "NSR w/ PVCs Pulses 2/2 Edema 1+", "k": "NSR w/ PVCs", "p": "0_0", "l": [26]},
    {"id": 1, "r": "labs", "f": "Na+ 138 k+ 4.4 iCal Mg+ 1.7", "k": "Na+ 138", "p": "0_0", "l": [68]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].full_phrase).toBe(
      "NSR w/ PVCs Pulses 2/2 Edema 1+"
    );
    expect(result.citations[1].full_phrase).toBe("Na+ 138 k+ 4.4 iCal Mg+ 1.7");
  });

  it("handles Unicode characters like arrows and symbols", () => {
    const response = `Patient story [1].
${CITATION_DATA_START_DELIMITER}
{
  "doc123": [
    {"id": 1, "r": "story", "f": "Cardiac cath showing ↑ pulm HTN, low CI", "k": "↑ pulm HTN", "p": "0_0", "l": [14]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseDeferredCitationResponse(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].full_phrase).toBe(
      "Cardiac cath showing ↑ pulm HTN, low CI"
    );
    expect(result.citations[0].anchor_text).toBe("↑ pulm HTN");
  });
});
