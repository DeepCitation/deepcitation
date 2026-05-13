import { describe, expect, it } from "bun:test";
import {
  citationDataToCitation,
  extractCitationsFromMarkers,
  extractTrailingClaimText,
  extractVisibleText,
  getAllCitationsFromNumericResponse,
  getCitationMarkerIds,
  hasCitationData,
  parseCitationData,
  replaceCitationMarkers,
  stripCitations,
  stripClaimText,
} from "../parsing/citationParser.js";
import {
  CITATION_DATA_END_DELIMITER,
  CITATION_DATA_START_DELIMITER,
  type CitationData,
} from "../prompts/citationPrompts.js";
import type { SearchStatus } from "../types/search.js";
import { getCitationKey } from "../utils/citationKey.js";

describe("parseCitationData", () => {
  it("parses a basic deferred citation response", () => {
    const response = `The company reported strong growth [1]. Revenue increased significantly [2].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "abc123",
    "reasoning": "directly states growth metrics",
    "source_context": "The company achieved 45% year-over-year growth",
    "source_match": "45% year-over-year growth",
    "page_id": "page_number_2_index_1",
    "line_ids": [12, 13]
  },
  {
    "id": 2,
    "attachment_id": "abc123",
    "reasoning": "states Q4 revenue figure",
    "source_context": "Q4 revenue reached $2.3 billion",
    "source_match": "$2.3 billion",
    "page_id": "page_number_3_index_2",
    "line_ids": [5, 6, 7]
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.visibleText).toBe("The company reported strong growth [1]. Revenue increased significantly [2].");
    expect(result.citations.length).toBe(2);
    expect(result.citationMap.get(1)?.attachment_id).toBe("abc123");
    expect(result.citationMap.get(2)?.source_match).toBe("$2.3 billion");
  });

  it("handles response without citation block", () => {
    const response = "This is a simple response without citations.";
    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.visibleText).toBe(response);
    expect(result.citations.length).toBe(0);
  });

  it("handles empty input", () => {
    const result = parseCitationData("");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid input");
  });

  it("handles null/undefined input", () => {
    const result = parseCitationData(null as unknown as string);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid input");
  });

  it("handles citations with quotes in source_context", () => {
    const response = `The contract states "no liability" [1].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "doc456",
    "source_context": "The user's liability shall be limited to \\"no liability\\" as stated",
    "source_match": "no liability",
    "page_id": "page_number_5_index_0",
    "line_ids": [20, 21]
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].source_context).toContain("no liability");
  });

  it("handles citations with newlines in source_context", () => {
    const response = `Multi-line content [1].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "doc789",
    "source_context": "Line one\\nLine two\\nLine three",
    "source_match": "Line two",
    "page_id": "page_number_1_index_0"
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].source_context).toContain("Line one");
  });

  it("repairs literal newlines inside JSON string values", () => {
    const response = `Multi-line content [1].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "doc789",
    "source_context": "Line one
Line two
Line three",
    "source_match": "Line two",
    "page_id": "page_number_1_index_0"
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].source_context).toContain("Line one");
  });

  it("handles multiple citations in single sentence", () => {
    const response = `Revenue was $1B [1] with profit of $100M [2] in Q4 [3].

${CITATION_DATA_START_DELIMITER}
[
  {"id": 1, "attachment_id": "a", "source_context": "$1B", "source_match": "$1B"},
  {"id": 2, "attachment_id": "a", "source_context": "$100M", "source_match": "$100M"},
  {"id": 3, "attachment_id": "a", "source_context": "Q4", "source_match": "Q4"}
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(3);
    expect(result.visibleText).toBe("Revenue was $1B [1] with profit of $100M [2] in Q4 [3].");
  });

  it("repairs JSON with trailing commas", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[
  {"id": 1, "attachment_id": "a", "source_context": "test", "source_match": "test",},
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
  });

  it("handles missing end delimiter", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "a", "source_context": "test", "source_match": "test"}]`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
  });

  it("handles malformed end delimiter variant", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "a", "source_context": "test", "source_match": "test"}]
<<</CITATION_DATA>>>`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
  });

  it("handles empty citation block", () => {
    const response = `No citations here.

${CITATION_DATA_START_DELIMITER}
[]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(0);
  });

  it("treats whitespace-only citation blocks as recoverable empties", () => {
    const response = `Body text.\n\n${CITATION_DATA_START_DELIMITER}\n\n${CITATION_DATA_END_DELIMITER}\n`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(0);
    expect(result.visibleText).toBe("Body text.");
  });

  it("handles AV citations with timestamps", () => {
    const response = `The speaker said [1].

${CITATION_DATA_START_DELIMITER}
[
  {
    "id": 1,
    "attachment_id": "video123",
    "source_context": "This is important",
    "source_match": "important",
    "timestamps": {
      "start_time": "00:05:23.000",
      "end_time": "00:05:45.500"
    }
  }
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].timestamps?.start_time).toBe("00:05:23.000");
    expect(result.citations[0].timestamps?.end_time).toBe("00:05:45.500");
  });

  it("handles markdown code block markers in JSON", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
\`\`\`json
[{"id": 1, "attachment_id": "a", "source_context": "test", "source_match": "test"}]
\`\`\`
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
  });
});

describe("getAllCitationsFromNumericResponse", () => {
  it("returns citations dictionary with generated keys", () => {
    const response = `Test [1] and [2].

${CITATION_DATA_START_DELIMITER}
[
  {"id": 1, "attachment_id": "abc", "source_context": "phrase one", "source_match": "one", "page_id": "page_number_1_index_0", "line_ids": [1]},
  {"id": 2, "attachment_id": "abc", "source_context": "phrase two", "source_match": "two", "page_id": "page_number_2_index_0", "line_ids": [5]}
]
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromNumericResponse(response);

    expect(Object.keys(citations).length).toBe(2);

    // Verify the citations have proper structure
    const citationValues = Object.values(citations);
    expect(citationValues[0].sourceContext).toBe("phrase one");
    expect(citationValues[0].attachmentId).toBe("abc");
    expect(citationValues[1].sourceContext).toBe("phrase two");
  });

  it("returns empty object for response without citations", () => {
    const response = "Simple text without citations.";
    const citations = getAllCitationsFromNumericResponse(response);
    expect(Object.keys(citations).length).toBe(0);
  });

  it("skips citations without sourceContext", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "abc", "source_match": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromNumericResponse(response);
    expect(Object.keys(citations).length).toBe(0);
  });
});

describe("citationDataToCitation", () => {
  it("converts deferred citation data to standard Citation format", () => {
    const data = {
      id: 1,
      attachment_id: "doc123",
      reasoning: "test reasoning",
      source_context: "The full phrase here",
      source_match: "anchor text",
      page_id: "page_number_3_index_2",
      line_ids: [10, 11, 12],
    };

    const citation = citationDataToCitation(data);

    expect(citation.attachmentId).toBe("doc123");
    expect(citation.reasoning).toBe("test reasoning");
    expect(citation.sourceContext).toBe("The full phrase here");
    expect(citation.sourceMatch).toBe("anchor text");
    expect(citation.pageNumber).toBe(3);
    expect(citation.startPageId).toBe("page_number_3_index_2");
    expect(citation.lineIds).toEqual([10, 11, 12]);
    expect(citation.citationNumber).toBe(1);
  });

  it("sorts line IDs", () => {
    const data = {
      id: 1,
      attachment_id: "doc",
      source_context: "test",
      line_ids: [15, 10, 12, 11],
    };

    const citation = citationDataToCitation(data);
    expect(citation.lineIds).toEqual([10, 11, 12, 15]);
  });

  it("handles AV citations with timestamps", () => {
    const data = {
      id: 1,
      attachment_id: "video",
      source_context: "transcript text",
      timestamps: {
        start_time: "00:01:00.000",
        end_time: "00:01:30.500",
      },
    };

    const citation = citationDataToCitation(data);
    expect(citation.type).toBe("audio");
    expect(citation.sourceContext).toBe("transcript text");
    // timestamps are mapped to camelCase on AudioVideoCitation
    if (citation.type === "audio" || citation.type === "video") {
      expect(citation.timestamps?.startTime).toBe("00:01:00.000");
      expect(citation.timestamps?.endTime).toBe("00:01:30.500");
    }
  });

  it("allows overriding citation number", () => {
    const data = {
      id: 5,
      attachment_id: "doc",
      source_context: "test",
    };

    const citation = citationDataToCitation(data, 99);
    expect(citation.citationNumber).toBe(99);
  });
});

describe("hasCitationData", () => {
  it("returns true when delimiter is present", () => {
    const response = `Text ${CITATION_DATA_START_DELIMITER} [...] ${CITATION_DATA_END_DELIMITER}`;
    expect(hasCitationData(response)).toBe(true);
  });

  it("returns false when delimiter is absent", () => {
    expect(hasCitationData("Simple text")).toBe(false);
  });

  it("returns false for non-string input", () => {
    expect(hasCitationData(null as unknown as string)).toBe(false);
    expect(hasCitationData(123 as unknown as string)).toBe(false);
  });
});

describe("extractVisibleText", () => {
  it("extracts only visible text portion", () => {
    const response = `This is visible text [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "source_context": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    expect(extractVisibleText(response)).toBe("This is visible text [1].");
  });

  it("returns full text if no delimiter", () => {
    const response = "Full text without citations.";
    expect(extractVisibleText(response)).toBe(response);
  });
});

describe("replaceCitationMarkers", () => {
  it("removes markers by default", () => {
    const text = "Revenue grew 45% [1] in Q4 [2].";
    expect(replaceCitationMarkers(text)).toBe("Revenue grew 45%  in Q4 .");
  });

  it("replaces markers with key spans", () => {
    const text = "Revenue grew 45% [1] in Q4 [2].";
    const citationMap = new Map([
      [1, { id: 1, source_match: "45%" }],
      [2, { id: 2, source_match: "Q4 2024" }],
    ]);

    const result = replaceCitationMarkers(text, {
      citationMap,
      showSourceMatch: true,
    });
    expect(result).toBe("Revenue grew 45% 45% in Q4 Q4 2024.");
  });

  it("uses custom replacer function", () => {
    const text = "Test [1] and [2].";
    const result = replaceCitationMarkers(text, {
      replacer: id => `(ref${id})`,
    });
    expect(result).toBe("Test (ref1) and (ref2).");
  });

  it("handles missing citations gracefully", () => {
    const text = "Test [1] and [99].";
    const citationMap = new Map([[1, { id: 1, source_match: "found" }]]);

    const result = replaceCitationMarkers(text, {
      citationMap,
      showSourceMatch: true,
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

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);

    // Verify keys are expanded to full names
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].attachment_id).toBe("abc123");
    expect(result.citations[0].reasoning).toBe("states growth");
    expect(result.citations[0].source_context).toBe("45% year-over-year growth");
    expect(result.citations[0].source_match).toBe("45% growth");
    expect(result.citations[0].page_id).toBe("2_1");
    expect(result.citations[0].line_ids).toEqual([12, 13]);

    // Verify citation map uses expanded id
    expect(result.citationMap.get(1)?.attachment_id).toBe("abc123");
    expect(result.citationMap.get(2)?.source_match).toBe("$2.3 billion");
  });

  it("parses compact AV citations with short timestamp keys", () => {
    const response = `The speaker said [1].

${CITATION_DATA_START_DELIMITER}
[
  {"n":1,"a":"video123","r":"explains concept","f":"This is important","k":"important","t":{"s":"00:05:23.000","e":"00:05:45.500"}}
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

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
  {"id":2,"attachment_id":"doc2","source_context":"full format","source_match":"full"}
]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].source_context).toBe("compact format");
    expect(result.citations[1].id).toBe(2);
    expect(result.citations[1].source_context).toBe("full format");
  });
});

describe("grouped by attachment format", () => {
  it("parses grouped format with multiple citations per attachment", () => {
    const response = `The company grew [1]. Revenue increased [2].

${CITATION_DATA_START_DELIMITER}
{
  "abc123": [
    {"id": 1, "reasoning": "states growth", "source_context": "45% year-over-year growth", "source_match": "45% growth", "page_id": "2_1", "line_ids": [12, 13]},
    {"id": 2, "reasoning": "states revenue", "source_context": "Q4 revenue reached $2.3 billion", "source_match": "$2.3 billion", "page_id": "3_2", "line_ids": [5, 6, 7]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);

    // Verify attachment_id is injected from the group key
    expect(result.citations[0].attachment_id).toBe("abc123");
    expect(result.citations[1].attachment_id).toBe("abc123");

    // Verify other fields
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].source_context).toBe("45% year-over-year growth");
    expect(result.citations[1].id).toBe(2);
    expect(result.citations[1].source_match).toBe("$2.3 billion");
  });

  it("parses grouped format with multiple attachments", () => {
    const response = `From doc1 [1] and doc2 [2].

${CITATION_DATA_START_DELIMITER}
{
  "doc1": [
    {"id": 1, "source_context": "content from doc1", "source_match": "doc1"}
  ],
  "doc2": [
    {"id": 2, "source_context": "content from doc2", "source_match": "doc2"}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);

    expect(result.citations[0].attachment_id).toBe("doc1");
    expect(result.citations[0].source_context).toBe("content from doc1");

    expect(result.citations[1].attachment_id).toBe("doc2");
    expect(result.citations[1].source_context).toBe("content from doc2");
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

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].attachment_id).toBe("attachment123");
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].reasoning).toBe("reason");
    expect(result.citations[0].source_context).toBe("full phrase here");
    expect(result.citations[0].source_match).toBe("phrase");
    expect(result.citations[0].page_id).toBe("1_0");
    expect(result.citations[0].line_ids).toEqual([5]);
  });

  it("parses grouped AV format with timestamps", () => {
    const response = `The speaker said [1].

${CITATION_DATA_START_DELIMITER}
{
  "video456": [
    {"id": 1, "source_context": "transcript text", "source_match": "text", "timestamps": {"start_time": "00:01:00.000", "end_time": "00:01:30.000"}}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].attachment_id).toBe("video456");
    expect(result.citations[0].timestamps?.start_time).toBe("00:01:00.000");
    expect(result.citations[0].timestamps?.end_time).toBe("00:01:30.000");
  });

  it("still supports flat array format for backward compatibility", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "abc", "source_context": "test", "source_match": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].attachment_id).toBe("abc");
  });

  it("converts grouped format to standard Citation format correctly", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
{
  "docXYZ": [
    {"id": 1, "source_context": "the quote", "source_match": "quote", "page_id": "5_2", "line_ids": [10, 11]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromNumericResponse(response);
    const citationValues = Object.values(citations);

    expect(citationValues.length).toBe(1);
    expect(citationValues[0].attachmentId).toBe("docXYZ");
    expect(citationValues[0].sourceContext).toBe("the quote");
    expect(citationValues[0].pageNumber).toBe(5);
    expect(citationValues[0].startPageId).toBe("page_number_5_index_2");
  });
});

describe("simplified page_id format", () => {
  it("parses simplified N_I page format", () => {
    const data = {
      id: 1,
      attachment_id: "doc",
      source_context: "test phrase",
      source_match: "test",
      page_id: "3_2",
      line_ids: [10],
    };

    const citation = citationDataToCitation(data);

    expect(citation.pageNumber).toBe(3);
    expect(citation.startPageId).toBe("page_number_3_index_2");
  });

  it("still parses legacy page_number_N_index_I format", () => {
    const data = {
      id: 1,
      attachment_id: "doc",
      source_context: "test phrase",
      source_match: "test",
      page_id: "page_number_5_index_3",
      line_ids: [20],
    };

    const citation = citationDataToCitation(data);

    expect(citation.pageNumber).toBe(5);
    expect(citation.startPageId).toBe("page_number_5_index_3");
  });

  it("handles single-digit and multi-digit page numbers", () => {
    const singleDigit = citationDataToCitation({
      id: 1,
      page_id: "1_0",
      source_context: "test",
    });
    expect(singleDigit.pageNumber).toBe(1);
    expect(singleDigit.startPageId).toBe("page_number_1_index_0");

    const multiDigit = citationDataToCitation({
      id: 2,
      page_id: "123_45",
      source_context: "test",
    });
    expect(multiDigit.pageNumber).toBe(123);
    expect(multiDigit.startPageId).toBe("page_number_123_index_45");
  });

  it("returns undefined for invalid page_id format", () => {
    const data = {
      id: 1,
      attachment_id: "doc",
      source_context: "test",
      page_id: "invalid_format",
    };

    const citation = citationDataToCitation(data);

    expect(citation.pageNumber).toBeUndefined();
    expect(citation.startPageId).toBeUndefined();
  });

  it("auto-corrects 0_0 to page 1 (only when both page and index are 0)", () => {
    // page_id "0_0" should be corrected to page 1, index 0
    const zeroIndexed = citationDataToCitation({
      id: 1,
      page_id: "0_0",
      source_context: "test",
    });
    expect(zeroIndexed.pageNumber).toBe(1);
    expect(zeroIndexed.startPageId).toBe("page_number_1_index_0");
  });

  it("does NOT auto-correct ambiguous page_ids like 0_5", () => {
    // page_id "0_5" is ambiguous - could be page 0 with index 5, or a mistake
    // We should NOT guess, so leave it as page 0
    const zeroWithIndex = citationDataToCitation({
      id: 2,
      page_id: "0_5",
      source_context: "test",
    });
    expect(zeroWithIndex.pageNumber).toBe(0);
    expect(zeroWithIndex.startPageId).toBe("page_number_0_index_5");
  });

  it("does NOT change non-zero page numbers", () => {
    // Non-zero page numbers should NOT be corrected
    const pageTwo = citationDataToCitation({
      id: 3,
      page_id: "2_0",
      source_context: "test",
    });
    expect(pageTwo.pageNumber).toBe(2);
    expect(pageTwo.startPageId).toBe("page_number_2_index_0");
  });

  it("auto-corrects legacy format page_number_0_index_0", () => {
    // Legacy format "page_number_0_index_0" should also be corrected
    const legacyZero = citationDataToCitation({
      id: 1,
      page_id: "page_number_0_index_0",
      source_context: "test",
    });
    expect(legacyZero.pageNumber).toBe(1);
    expect(legacyZero.startPageId).toBe("page_number_1_index_0");
  });

  it("does NOT auto-correct ambiguous legacy format like page_number_0_index_5", () => {
    // Legacy format with page 0 but non-zero index is ambiguous
    const legacyAmbiguous = citationDataToCitation({
      id: 1,
      page_id: "page_number_0_index_5",
      source_context: "test",
    });
    expect(legacyAmbiguous.pageNumber).toBe(0);
    expect(legacyAmbiguous.startPageId).toBe("page_number_0_index_5");
  });
});

describe("JSON repair - invalid escape sequences", () => {
  it("repairs invalid escape sequences like \\~", () => {
    const response = `Patient info [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "Output \\~100/hr", "source_match": "Output ~100/hr"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].source_context).toBe("Output ~100/hr");
  });

  it("repairs multiple invalid escape sequences in same string", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "\\~test\\xvalue\\!", "source_match": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations[0].source_context).toBe("~testxvalue!");
  });

  it("preserves valid escape sequences while fixing invalid ones", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "line1\\nline2\\~test", "source_match": "test"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \n should be preserved, \~ should become ~
    expect(result.citations[0].source_context).toBe("line1\nline2~test");
  });

  it("handles medical notation with special characters", () => {
    const response = `Patient is John Doe [1].

${CITATION_DATA_START_DELIMITER}
{
  "0": [
    {"id": 1, "reasoning": "summarizes info", "source_context": "Output \\~100/hr", "source_match": "Output ~100/hr", "page_id": "0_0", "line_ids": [30]},
    {"id": 1, "reasoning": "summarizes info", "source_context": "Na+ 138", "source_match": "Na+ 138", "page_id": "0_0", "line_ids": [36]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].source_context).toBe("Output ~100/hr");
    expect(result.citations[0].attachment_id).toBe("0");
  });

  it("preserves valid unicode escape sequences like \\u0020", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "space\\u0020here", "source_match": "space here"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \u0020 is a valid unicode escape for space and should be preserved
    expect(result.citations[0].source_context).toBe("space here");
  });

  it("preserves multiple valid unicode escapes in same string", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "a\\u0041b\\u0042c", "source_match": "aAbBc"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \u0041 = 'A', \u0042 = 'B'
    expect(result.citations[0].source_context).toBe("aAbBc");
  });

  it("repairs invalid unicode-like sequences (not followed by 4 hex digits)", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "test\\utest", "source_match": "testutest"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \utest is invalid (not 4 hex digits), backslash should be removed
    expect(result.citations[0].source_context).toBe("testutest");
  });

  it("handles mixed valid unicode escapes and invalid escapes", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "\\~prefix\\u0020middle\\u0020\\xsuffix", "source_match": "prefix middle suffix"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \~ and \x should be repaired (backslash removed)
    // \u0020 should be preserved as space
    expect(result.citations[0].source_context).toBe("~prefix middle xsuffix");
  });

  it("preserves unicode escapes with lowercase hex digits", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "test\\u00e9test", "source_match": "testétest"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \u00e9 = 'é' (valid lowercase hex)
    expect(result.citations[0].source_context).toBe("testétest");
  });

  it("preserves unicode escapes with uppercase hex digits", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "test\\u00E9test", "source_match": "testétest"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \u00E9 = 'é' (valid uppercase hex)
    expect(result.citations[0].source_context).toBe("testétest");
  });

  it("repairs \\u followed by only 3 hex digits", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "test\\u00Fvalue", "source_match": "testu00Fvalue"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \u00F is invalid (only 3 hex digits), backslash should be removed
    expect(result.citations[0].source_context).toBe("testu00Fvalue");
  });

  it("repairs consecutive invalid unicode-like escapes", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "test\\utest\\u00Gend", "source_match": "testutestu00Gend"}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \utest is invalid (non-hex chars), \u00G is invalid (G is not hex)
    // Both should have backslashes removed
    expect(result.citations[0].source_context).toBe("testutestu00Gend");
  });

  it("preserves valid unicode escape at end of string", () => {
    const response = `Test [1].

${CITATION_DATA_START_DELIMITER}
[{"id": 1, "attachment_id": "doc", "source_context": "test\\u0020", "source_match": "test "}]
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    // \u0020 at end of string should be preserved as space
    expect(result.citations[0].source_context).toBe("test ");
  });
});

describe("grouped format with numeric string keys", () => {
  it("parses grouped format with numeric string key like '0'", () => {
    const response = `Patient info [1].

${CITATION_DATA_START_DELIMITER}
{
  "0": [
    {"id": 1, "reasoning": "summarizes info", "source_context": "John Doe 50/M", "source_match": "John Doe", "page_id": "0_0", "line_ids": [1]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

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
    {"id": 1, "source_context": "content from page 0", "source_match": "page 0", "page_id": "0_0", "line_ids": [1]}
  ],
  "1": [
    {"id": 2, "source_context": "content from page 1", "source_match": "page 1", "page_id": "1_0", "line_ids": [1]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const result = parseCitationData(response);

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
    {"id": 1, "source_context": "the quote", "source_match": "quote", "page_id": "0_0", "line_ids": [10, 11]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromNumericResponse(response);
    const citationValues = Object.values(citations);

    expect(citationValues.length).toBe(1);
    expect(citationValues[0].attachmentId).toBe("0");
    expect(citationValues[0].sourceContext).toBe("the quote");
    // page_id "0_0" is auto-corrected to page 1 (1-indexed)
    expect(citationValues[0].pageNumber).toBe(1);
    expect(citationValues[0].startPageId).toBe("page_number_1_index_0");
  });

  it("parses UI-shaped citation records that use citationNumber and pageNumber aliases", () => {
    const response = `Patient name [4].

${CITATION_DATA_START_DELIMITER}
{
  "citations": [
    {
      "citationNumber": 4,
      "attachmentId": "patient-record",
      "sourceContext": "Patient: Stephanie Bidoyan",
      "sourceMatch": "Stephanie Bidoyan",
      "pageNumber": 1,
      "lineIds": [2]
    }
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromNumericResponse(response);
    const citationValues = Object.values(citations);

    expect(citationValues.length).toBe(1);
    expect(citationValues[0].citationNumber).toBe(4);
    expect(citationValues[0].attachmentId).toBe("patient-record");
    expect(citationValues[0].pageNumber).toBe(1);
    expect(citationValues[0].sourceContext).toBe("Patient: Stephanie Bidoyan");
  });

  it("parses nested citation objects with common source quote aliases", () => {
    const response = `Patient has severe anxiety [30].

${CITATION_DATA_START_DELIMITER}
{
  "citations": {
    "patient-record": [
      {
        "number": 30,
        "reason": "symptoms causing impairment",
        "sourceQuote": "Severe anxiety, constant suicidal ideation severe depression",
        "match": "Severe anxiety",
        "page": 1,
        "lines": [49, 50]
      }
    ]
  }
}
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromNumericResponse(response);
    const citationValues = Object.values(citations);

    expect(citationValues.length).toBe(1);
    expect(citationValues[0].citationNumber).toBe(30);
    expect(citationValues[0].attachmentId).toBe("patient-record");
    expect(citationValues[0].sourceContext).toContain("constant suicidal ideation");
    expect(citationValues[0].sourceMatch).toBe("Severe anxiety");
    expect(citationValues[0].pageNumber).toBe(1);
  });

  it("preserves repeated source anchors when numeric markers use different citation numbers", () => {
    const response = `Primary diagnosis: borderline personality disorder [6].
Diagnosis details: borderline personality disorder [23].

${CITATION_DATA_START_DELIMITER}
{
  "patient-record": [
    {"n": 6, "f": "Diagnosed with borderline personality disorder in grade 12.", "k": "borderline personality disorder", "p": "page_number_1_index_0", "l": [10]},
    {"n": 23, "f": "Diagnosed with borderline personality disorder in grade 12.", "k": "borderline personality disorder", "p": "page_number_1_index_0", "l": [10]}
  ]
}
${CITATION_DATA_END_DELIMITER}`;

    const citations = getAllCitationsFromNumericResponse(response);
    const entries = Object.values(citations);
    const ids = entries.map(citation => citation.citationNumber).sort((a, b) => (a ?? 0) - (b ?? 0));

    expect(ids).toEqual([6, 23]);
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.sourceContext === "Diagnosed with borderline personality disorder in grade 12.")).toBe(
      true,
    );
    expect(entries.every(e => e.sourceMatch === "borderline personality disorder")).toBe(true);
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

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(4);

    // Check first citation - patient demographics
    expect(result.citations[0].attachment_id).toBe("646274488");
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[0].reasoning).toBe("patient demographics");
    expect(result.citations[0].source_context).toBe("10 John Doe 50/M Full");
    expect(result.citations[0].source_match).toBe("John Doe 50/M");
    expect(result.citations[0].page_id).toBe("0_0");
    expect(result.citations[0].line_ids).toEqual([1, 2, 3]);

    // Check last citation - plan
    expect(result.citations[3].reasoning).toBe("lists the plan for the patient");
    expect(result.citations[3].source_match).toBe("Optimize for transplant");
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

    const citations = getAllCitationsFromNumericResponse(response);
    const citationValues = Object.values(citations);

    expect(citationValues.length).toBe(2);

    // Verify first citation conversion
    expect(citationValues[0].attachmentId).toBe("646274488");
    expect(citationValues[0].sourceContext).toBe("10 John Doe 50/M Full");
    expect(citationValues[0].sourceMatch).toBe("John Doe 50/M");
    // page_id "0_0" is auto-corrected to page 1 (1-indexed)
    expect(citationValues[0].pageNumber).toBe(1);
    expect(citationValues[0].startPageId).toBe("page_number_1_index_0");
    expect(citationValues[0].lineIds).toEqual([1, 2, 3]);
    expect(citationValues[0].reasoning).toBe("patient demographics");

    // Verify second citation conversion
    expect(citationValues[1].sourceContext).toBe("Na+ 138 k+ 4.4 Mg 1.7 Cr 1.21 WBC 18");
    expect(citationValues[1].sourceMatch).toBe("Na+ 138");
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

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(3);

    // All should have the same id but different content
    expect(result.citations[0].id).toBe(1);
    expect(result.citations[1].id).toBe(1);
    expect(result.citations[2].id).toBe(1);

    expect(result.citations[0].source_context).toBe("First phrase");
    expect(result.citations[1].source_context).toBe("Second phrase");
    expect(result.citations[2].source_context).toBe("Third phrase");
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

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].source_context).toBe("NSR w/ PVCs Pulses 2/2 Edema 1+");
    expect(result.citations[1].source_context).toBe("Na+ 138 k+ 4.4 iCal Mg+ 1.7");
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

    const result = parseCitationData(response);

    expect(result.success).toBe(true);
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].source_context).toBe("Cardiac cath showing ↑ pulm HTN, low CI");
    expect(result.citations[0].source_match).toBe("↑ pulm HTN");
  });
});

describe("replaceCitationMarkers with verifications", () => {
  const makeVerification = (status: SearchStatus, citationNumber: number) => ({
    status,
    citation: {
      type: "document" as const,
      citationNumber,
      sourceContext: `phrase ${citationNumber}`,
      attachmentId: "doc",
    },
  });

  it("appends verification indicators to markers", () => {
    const text = "Revenue grew [1] in Q4 [2].";
    const verifications = {
      key1: makeVerification("found", 1),
      key2: makeVerification("not_found", 2),
    };

    const result = replaceCitationMarkers(text, {
      verifications,
      showVerificationStatus: true,
    });
    expect(result).toBe("Revenue grew [1☑️] in Q4 [2❌].");
  });

  it("shows pending indicator for missing verifications", () => {
    const text = "Test [1] and [2].";
    const verifications = {
      key1: makeVerification("found", 1),
    };

    const result = replaceCitationMarkers(text, {
      verifications,
      showVerificationStatus: true,
    });
    // [2] has no verification data → unknown ("◌"), not pending
    expect(result).toBe("Test [1☑️] and [2◌].");
  });

  it("shows partial match indicator", () => {
    const text = "Test [1].";
    const verifications = {
      key1: makeVerification("found_on_other_page", 1),
    };

    const result = replaceCitationMarkers(text, {
      verifications,
      showVerificationStatus: true,
    });
    expect(result).toBe("Test [1✅].");
  });

  it("shows pending indicator for pending status", () => {
    const text = "Test [1].";
    const verifications = {
      key1: makeVerification("pending", 1),
    };

    const result = replaceCitationMarkers(text, {
      verifications,
      showVerificationStatus: true,
    });
    expect(result).toBe("Test [1⌛].");
  });

  it("custom replacer takes precedence over showVerificationStatus", () => {
    const text = "Test [1].";
    const verifications = {
      key1: makeVerification("found", 1),
    };

    const result = replaceCitationMarkers(text, {
      verifications,
      showVerificationStatus: true,
      replacer: id => `(ref${id})`,
    });
    expect(result).toBe("Test (ref1).");
  });

  it("resolves via citationMap key lookup when available", () => {
    const text = "Test [1].";
    const citationMap = new Map([
      [1, { id: 1, attachment_id: "doc", source_context: "phrase one", source_match: "one", page_id: "1_0" }],
    ]);

    // Key is generated from the citation data
    const rawCitation = citationMap.get(1);
    if (!rawCitation) throw new Error("expected citationMap to have entry for key 1");
    const citation = citationDataToCitation(rawCitation, 1);
    const key = getCitationKey(citation);

    const verifications = {
      [key]: makeVerification("found", 1),
    };

    const result = replaceCitationMarkers(text, {
      citationMap,
      verifications,
      showVerificationStatus: true,
    });
    expect(result).toBe("Test [1☑️].");
  });

  it("does nothing when showVerificationStatus is false", () => {
    const text = "Test [1].";
    const verifications = {
      key1: makeVerification("found", 1),
    };

    const result = replaceCitationMarkers(text, {
      verifications,
      showVerificationStatus: false,
    });
    // Default behavior: remove markers
    expect(result).toBe("Test .");
  });
});

describe("stripCitations", () => {
  it("does not strip XML cite tags (numeric-only)", () => {
    const xmlInput = `Text <cite attachment_id='abc' source_context='foo' source_match='bar' /> more`;
    expect(stripCitations(xmlInput)).toBe(xmlInput);
  });
});

describe("stripClaimText", () => {
  it("returns null when sourceMatch is empty", () => {
    expect(stripClaimText("Date: 01/11/2025 ", "")).toBeNull();
  });

  it("strips plain trailing sourceMatch", () => {
    expect(stripClaimText("Date: 01/11/2025 ", "01/11/2025")).toBe("Date: ");
  });

  it("strips **bold** wrapper", () => {
    expect(stripClaimText("Date: **01/11/2025** ", "01/11/2025")).toBe("Date: ");
  });

  it("strips *italic* wrapper", () => {
    expect(stripClaimText("Date: *01/11/2025* ", "01/11/2025")).toBe("Date: ");
  });

  it("strips `code` wrapper (LLM tabular output)", () => {
    expect(stripClaimText("Date: `01/11/2025` ", "01/11/2025")).toBe("Date: ");
  });

  it("strips 'single quote' wrapper", () => {
    expect(stripClaimText("Date: '01/11/2025' ", "01/11/2025")).toBe("Date: ");
  });

  it('strips "double quote" wrapper', () => {
    expect(stripClaimText('Date: "01/11/2025" ', "01/11/2025")).toBe("Date: ");
  });

  it("strips curly-single-quote wrapper", () => {
    expect(stripClaimText("Date: ‘01/11/2025’ ", "01/11/2025")).toBe("Date: ");
  });

  it("strips curly-double-quote wrapper", () => {
    expect(stripClaimText("Date: “01/11/2025” ", "01/11/2025")).toBe("Date: ");
  });

  it("strips **`code`** composite wrapper", () => {
    expect(stripClaimText("Total: **`$19.40`** ", "$19.40")).toBe("Total: ");
  });

  it("strips *`code`* composite wrapper", () => {
    expect(stripClaimText("Total: *`$19.40`* ", "$19.40")).toBe("Total: ");
  });

  it("returns null when sourceMatch is asymmetrically wrapped", () => {
    // Guardrail: mismatched wrappers must not be stripped.
    expect(stripClaimText("Date: `01/11/2025' ", "01/11/2025")).toBeNull();
  });

  it("handles the USPS receipt backtick case end-to-end", () => {
    // Reproduces the segment passed to stripClaimText by parseMarkdown.tsx
    // when the LLM emits: `Priority Mail® Flat Rate Env` [3]
    const segment = "*   `Priority Mail® Flat Rate Env`";
    expect(stripClaimText(segment, "Priority Mail® Flat Rate Env")).toBe("*   ");
  });
});

describe("extractTrailingClaimText", () => {
  it("returns null for an empty segment", () => {
    expect(extractTrailingClaimText("", "x")).toBeNull();
  });

  it("returns null when there is no trailing wrapper or sourceMatch", () => {
    expect(extractTrailingClaimText("plain text with no wrap", "x")).toBeNull();
  });

  it("prefers exact sourceMatch when it is present (plain)", () => {
    expect(extractTrailingClaimText("Date: 01/11/2025 ", "01/11/2025")).toEqual({
      stripped: "Date: ",
      claimText: "01/11/2025",
    });
  });

  it("prefers exact sourceMatch when it is wrapped in backticks", () => {
    expect(extractTrailingClaimText("Date: `01/11/2025` ", "01/11/2025")).toEqual({
      stripped: "Date: ",
      claimText: "01/11/2025",
    });
  });

  it("falls back to wrapped content when sourceMatch is only a prefix of the wrap", () => {
    // Treasury row: LLM wrapped "Department of the Treasury Internal Revenue Service"
    // but the citation's sourceMatch is just "Department of the Treasury".
    // Exact match fails → fallback returns the full wrapped content as claimText.
    const segment = "Sent To: 'Department of the Treasury Internal Revenue Service' ";
    expect(extractTrailingClaimText(segment, "Department of the Treasury")).toEqual({
      stripped: "Sent To: ",
      claimText: "Department of the Treasury Internal Revenue Service",
    });
  });

  it("falls back to wrapped content when sourceMatch is unrelated (LLM mis-citation)", () => {
    // Austin row: LLM wrapped "Austin, TX 73301-0215" but the citation's
    // sourceMatch is "Department of the Treasury" (an LLM mis-citation).
    // The parser honors what the LLM wrote so the consumer can pass it
    // via claimText prop; the popover still shows the verified sourceMatch.
    const segment = "Address: 'Austin, TX 73301-0215' ";
    expect(extractTrailingClaimText(segment, "Department of the Treasury")).toEqual({
      stripped: "Address: ",
      claimText: "Austin, TX 73301-0215",
    });
  });

  it("falls back with no sourceMatch at all", () => {
    expect(extractTrailingClaimText("x: `value` ", undefined)).toEqual({
      stripped: "x: ",
      claimText: "value",
    });
  });

  it("falls back for curly quotes", () => {
    expect(extractTrailingClaimText("x: “quoted” ", null)).toEqual({
      stripped: "x: ",
      claimText: "quoted",
    });
  });

  it("does not bridge across two adjacent backtick spans", () => {
    // Regex-safety: the content run must not span across an earlier `…`
    // span. Only the last wrap should be extracted.
    expect(extractTrailingClaimText("`first` middle `last` ", null)).toEqual({
      stripped: "`first` middle ",
      claimText: "last",
    });
  });

  it("ignores asymmetric wrappers", () => {
    expect(extractTrailingClaimText("Date: `01/11/2025' ", null)).toBeNull();
  });

  it("ignores newline-crossing wrappers", () => {
    expect(extractTrailingClaimText("line1 `wrap with\nnewline` ", null)).toBeNull();
  });

  // Behavioral proxy for the internal LRU cache on per-sourceMatch patterns:
  // 200 distinct sourceMatch values exercise the eviction path beyond the
  // cap of 128, after which previously-evicted keys must still produce
  // correct results (i.e. the cache is a perf optimization, never a
  // correctness hazard).
  it("remains correct when stripPatternCache churns past its cap", () => {
    const uniqueMatches = Array.from({ length: 200 }, (_, i) => `value_${i}`);
    for (const m of uniqueMatches) {
      expect(stripClaimText(`prefix: ${m}`, m)).toBe("prefix: ");
    }
    // Re-hit the earliest keys (likely evicted) — should recompute and still strip.
    expect(stripClaimText("prefix: value_0", "value_0")).toBe("prefix: ");
    expect(stripClaimText("prefix: value_5", "value_5")).toBe("prefix: ");
  });
});

describe("extractCitationsFromMarkers", () => {
  it("extracts citations from post-claim markers (OpenAI style)", () => {
    const text = `- Patient: Doe, John A. [1]
- Date of birth: 09/20/1961 [2]
- Test result: POSITIVE [3]`;

    const citations = extractCitationsFromMarkers(text);
    const values = Object.values(citations);
    expect(values.length).toBe(3);

    const byNumber = values.sort((a, b) => (a.citationNumber ?? 0) - (b.citationNumber ?? 0));
    expect(byNumber[0].sourceContext).toContain("Patient: Doe, John A.");
    expect(byNumber[1].sourceContext).toContain("Date of birth: 09/20/1961");
    expect(byNumber[2].sourceContext).toContain("Test result: POSITIVE");
  });

  it("extracts citations from pre-claim markers (Anthropic style)", () => {
    const text = `The result was [1] POSITIVE with a [2] HIGH bacterial risk.`;

    const citations = extractCitationsFromMarkers(text);
    const values = Object.values(citations);
    expect(values.length).toBe(2);
    // Both markers share the same sentence
    expect(values[0].sourceContext).toContain("POSITIVE");
    expect(values[0].sourceContext).toContain("HIGH bacterial risk");
  });

  it("extracts citations from comma-separated markers (Gemini style)", () => {
    const text = `The report lists high-risk pathogens [2, 3, 4]. Treatment options are available [15, 19].`;

    const citations = extractCitationsFromMarkers(text);
    const values = Object.values(citations);
    // Should extract 5 unique citation IDs: 2, 3, 4, 15, 19
    expect(values.length).toBe(5);

    const ids = values.map(c => c.citationNumber).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(ids).toEqual([2, 3, 4, 15, 19]);
  });

  it("extracts citations from adjacent markers (OpenAI style)", () => {
    const text = `High-risk pathogens: A. actinomycetemcomitans; P. gingivalis; F. nucleatum [9][10][11]`;

    const citations = extractCitationsFromMarkers(text);
    const values = Object.values(citations);
    expect(values.length).toBe(3);

    const ids = values.map(c => c.citationNumber).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(ids).toEqual([9, 10, 11]);
    // All should share the same sentence context
    for (const c of values) {
      expect(c.sourceContext).toContain("High-risk pathogens");
    }
  });

  it("handles mixed marker styles in one text", () => {
    const text = `Result was positive [1]. Five bacteria detected [2, 3, 4]. Treatment: therapy [5] and antibiotics [6][7].`;

    const citations = extractCitationsFromMarkers(text);
    const ids = Object.values(citations)
      .map(c => c.citationNumber)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns empty for text without markers", () => {
    const citations = extractCitationsFromMarkers("No citations here.");
    expect(Object.keys(citations).length).toBe(0);
  });

  it("returns empty for empty/null input", () => {
    expect(Object.keys(extractCitationsFromMarkers("")).length).toBe(0);
    expect(Object.keys(extractCitationsFromMarkers(null as unknown as string)).length).toBe(0);
  });

  it("strips markdown bold from source_context", () => {
    const text = `The result was [1] **POSITIVE** with **HIGH** risk.`;
    const citations = extractCitationsFromMarkers(text);
    const phrase = Object.values(citations)[0].sourceContext;
    expect(phrase).not.toContain("**");
    expect(phrase).toContain("POSITIVE");
    expect(phrase).toContain("HIGH");
  });

  it("deduplicates citation IDs", () => {
    // Same ID appears in both single and multi markers
    const text = `Result was positive [1]. More details about the result [1, 2].`;
    const citations = extractCitationsFromMarkers(text);
    const ids = Object.values(citations).map(c => c.citationNumber);
    // Should have exactly 2 unique IDs, not 3
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });
});

// ── cite: link format ─────────────────────────────────────────────

describe("replaceCitationMarkers — cite: link format", () => {
  it("strips cite-link markers preserving anchor text", () => {
    expect(replaceCitationMarkers("The [Discount Rate](cite:2) is applied.")).toBe("The Discount Rate is applied.");
  });

  it("applies replacer function to cite-link ID", () => {
    const result = replaceCitationMarkers("See [Rate](cite:5) here.", {
      replacer: id => `(ref${id})`,
    });
    expect(result).toBe("See (ref5) here.");
  });

  it("uses citationMap source_match when showSourceMatch is true", () => {
    const citationMap = new Map([[2, { id: 2, source_match: "Resolved Rate" } as CitationData]]);
    const result = replaceCitationMarkers("The [Discount Rate](cite:2) applies.", {
      citationMap,
      showSourceMatch: true,
    });
    expect(result).toBe("The Resolved Rate applies.");
  });

  it("handles mixed [N] and cite-link in same string", () => {
    expect(replaceCitationMarkers("Old [1] and [New Rate](cite:2).")).toBe("Old  and New Rate.");
  });

  it("does not leave (cite:N) tokens in stripped output", () => {
    const result = replaceCitationMarkers("The [Discount Rate](cite:2) is applied.");
    expect(result).not.toContain("(cite:");
    expect(result).not.toContain("[Discount Rate]");
  });
});

describe("getCitationMarkerIds — cite: link format", () => {
  it("extracts IDs from cite-link markers", () => {
    expect(getCitationMarkerIds("The [Discount Rate](cite:2) and [Price](cite:3).")).toEqual([2, 3]);
  });

  it("extracts IDs from mixed [N] and cite-link", () => {
    expect(getCitationMarkerIds("Old [1] and [Rate](cite:5).")).toEqual([1, 5]);
  });

  it("preserves document order for cite-link IDs", () => {
    expect(getCitationMarkerIds("[B](cite:3) then [A](cite:1)")).toEqual([3, 1]);
  });

  it("does not return empty array for cite-link-only text", () => {
    expect(getCitationMarkerIds("[Discount Rate](cite:2)").length).toBeGreaterThan(0);
  });
});

describe("extractCitationsFromMarkers — cite: link format", () => {
  it("uses inline anchor text from cite-link markers", () => {
    const text = "The [Discount Rate](cite:2) is applied to the [Conversion Price](cite:3).";
    const citations = extractCitationsFromMarkers(text);
    const values = Object.values(citations).sort((a, b) => (a.citationNumber ?? 0) - (b.citationNumber ?? 0));

    expect(values.length).toBe(2);
    expect(values[0].citationNumber).toBe(2);
    expect(values[0].sourceMatch).toBe("Discount Rate");
    expect(values[1].citationNumber).toBe(3);
    expect(values[1].sourceMatch).toBe("Conversion Price");
  });

  it("sets sourceContext to the surrounding sentence", () => {
    const text = "The [Discount Rate](cite:2) is applied to the conversion price.";
    const citations = extractCitationsFromMarkers(text);
    const c = Object.values(citations)[0];
    expect(c.sourceContext).toContain("Discount Rate");
    expect(c.sourceContext).toContain("conversion price");
    expect(c.sourceContext).not.toContain("(cite:");
  });

  it("extracts citation from list item cite-link", () => {
    const text = "- [Junior to](cite:9) payment of outstanding indebtedness";
    const citations = extractCitationsFromMarkers(text);
    const c = Object.values(citations)[0];
    expect(c.sourceMatch).toBe("Junior to");
    expect(c.citationNumber).toBe(9);
  });

  it("extracts citations from mixed [N] and cite-link text", () => {
    const text = "Old style [1] and [New Rate](cite:2).";
    const citations = extractCitationsFromMarkers(text);
    const ids = Object.values(citations)
      .map(c => c.citationNumber)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(ids).toEqual([1, 2]);
  });

  it("truncates anchor text exceeding 50 characters at word boundary", () => {
    const longAnchor = "A very long anchor text phrase that exceeds the fifty character limit easily";
    const text = `The [${longAnchor}](cite:1) applies.`;
    const citations = extractCitationsFromMarkers(text);
    const c = Object.values(citations)[0];
    expect(c?.sourceMatch?.length).toBeLessThanOrEqual(50);
  });

  it("never includes cite-link syntax in sourceMatch or sourceContext", () => {
    const text = "The [Discount Rate](cite:2) matters.";
    const citations = extractCitationsFromMarkers(text);
    for (const c of Object.values(citations)) {
      expect(c.sourceMatch ?? "").not.toContain("(cite:");
      expect(c.sourceContext ?? "").not.toContain("(cite:");
    }
  });
});

describe("stripCitations — cite: link format", () => {
  it("strips cite-link syntax preserving anchor text", () => {
    expect(stripCitations("The [Discount Rate](cite:2) is applied.")).toBe("The Discount Rate is applied.");
  });

  it("still strips old [N] markers", () => {
    expect(stripCitations("Revenue grew [1].")).toBe("Revenue grew .");
  });

  it("does not leave (cite:N) tokens in output", () => {
    expect(stripCitations("[Rate](cite:2)")).not.toContain("(cite:");
  });
});

// ---------------------------------------------------------------------------
// Supporting facts (children) — parser round-trip
// ---------------------------------------------------------------------------

describe("citationDataToCitation — children → supportingFacts", () => {
  it("maps children array to supportingFacts with correct fields", () => {
    const data: CitationData = {
      id: 1,
      attachment_id: "doc-a",
      source_context: "preserve and segregate all output log data",
      source_match: "preserve and segregate",
      page_id: "2_0",
      line_ids: [12, 13],
      children: [
        {
          id: 0,
          source_match: "output log data",
          source_context: "preserve and segregate all output log data",
          page_id: "2_0",
          line_ids: [12],
        },
        {
          id: 0,
          source_match: "May 13, 2025",
          source_context: "Dated: May 13, 2025\nNew York, New York",
          page_id: "5_0",
          line_ids: [38, 39],
        },
      ],
    };

    const citation = citationDataToCitation(data);
    expect(citation.supportingFacts).toBeDefined();
    expect(citation.supportingFacts).toHaveLength(2);

    const facts = citation.supportingFacts ?? [];
    const [fact0, fact1] = facts;
    expect(fact0?.childIndex).toBe(0);
    expect(fact0?.sourceMatch).toBe("output log data");
    expect(fact0?.pageNumber).toBe(2);
    expect(fact0?.lineIds).toEqual([12]);

    expect(fact1?.childIndex).toBe(1);
    expect(fact1?.sourceMatch).toBe("May 13, 2025");
    expect(fact1?.pageNumber).toBe(5);
    expect(fact1?.lineIds).toEqual([38, 39]);
  });

  it("omits supportingFacts when no children present", () => {
    const data: CitationData = {
      id: 1,
      source_match: "simple fact",
      source_context: "a simple fact",
    };
    const citation = citationDataToCitation(data);
    expect(citation.supportingFacts).toBeUndefined();
  });

  it("maps cross-document child with its own attachment_id", () => {
    const data: CitationData = {
      id: 1,
      attachment_id: "main-doc",
      source_match: "indemnification",
      source_context: "indemnification obligation",
      children: [
        {
          id: 0,
          attachment_id: "exhibit-b",
          source_match: "$5 million",
          source_context: "shall not exceed $5,000,000",
          page_id: "2_0",
        },
      ],
    };

    const citation = citationDataToCitation(data);
    expect(citation.supportingFacts?.[0]?.attachmentId).toBe("exhibit-b");
  });

  it("sorts child lineIds", () => {
    const data: CitationData = {
      id: 1,
      source_match: "test",
      source_context: "test context",
      children: [{ id: 0, source_match: "child", line_ids: [5, 2, 8] }],
    };
    const citation = citationDataToCitation(data);
    expect(citation.supportingFacts?.[0]?.lineIds).toEqual([2, 5, 8]);
  });
});

describe("parseCitationData — compact children round-trip", () => {
  it("expands compact-key children through full parse pipeline", () => {
    const json = JSON.stringify([
      {
        n: 1,
        a: "court-order",
        k: "preserve and segregate",
        f: "preserve and segregate all output log data",
        p: "2_0",
        l: [12, 13],
        c: [
          { k: "output log data", f: "preserve and segregate all output log data", p: "2_0", l: [12] },
          { k: "May 13, 2025", f: "Dated: May 13, 2025", p: "5_0", l: [38, 39] },
        ],
      },
    ]);
    const llmOutput = `Some text [1].\n<<<CITATION_DATA>>>\n${json}\n<<<END_CITATION_DATA>>>`;

    const result = parseCitationData(llmOutput);
    expect(result.success).toBe(true);
    expect(result.citations).toHaveLength(1);

    const citationData = result.citations[0];
    expect(citationData?.children).toBeDefined();
    expect(citationData?.children).toHaveLength(2);
    expect(citationData?.children?.[0]?.source_match).toBe("output log data");
    expect(citationData?.children?.[1]?.source_match).toBe("May 13, 2025");
    expect(citationData?.children?.[1]?.page_id).toBe("5_0");
  });

  it("handles children with string line_ids (coercion)", () => {
    const json = JSON.stringify([
      {
        n: 1,
        k: "test",
        f: "test context",
        c: [{ k: "child", f: "child context", l: ["42", "99"] }],
      },
    ]);
    const llmOutput = `Text [1].\n<<<CITATION_DATA>>>\n${json}\n<<<END_CITATION_DATA>>>`;

    const result = parseCitationData(llmOutput);
    expect(result.citations[0]?.children?.[0]?.line_ids).toEqual([42, 99]);
  });

  it("getAllCitationsFromNumericResponse maps compact children to supportingFacts", () => {
    const json = JSON.stringify([
      {
        n: 1,
        a: "doc-1",
        k: "primary fact",
        f: "the primary fact context",
        p: "1_0",
        c: [{ k: "supporting detail", f: "supporting detail context", p: "3_0", l: [10] }],
      },
    ]);
    const llmOutput = `Analysis [1].\n<<<CITATION_DATA>>>\n${json}\n<<<END_CITATION_DATA>>>`;

    const citations = getAllCitationsFromNumericResponse(llmOutput);
    const keys = Object.keys(citations);
    expect(keys).toHaveLength(1);

    const citation = Object.values(citations)[0];
    expect(citation?.supportingFacts).toHaveLength(1);
    expect(citation?.supportingFacts?.[0]?.sourceMatch).toBe("supporting detail");
    expect(citation?.supportingFacts?.[0]?.pageNumber).toBe(3);
    expect(citation?.supportingFacts?.[0]?.childIndex).toBe(0);
  });
});
