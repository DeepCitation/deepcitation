import { describe, expect, it } from "@jest/globals";
import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "../prompts/citationPrompts.js";

/** Build a numeric-format LLM response from visible text + citation data array. */
function makeNumericResponse(visibleText: string, citations: unknown[]): string {
  return `${visibleText}\n\n${CITATION_DATA_START_DELIMITER}\n${JSON.stringify(citations)}\n${CITATION_DATA_END_DELIMITER}`;
}

describe("Citation Parsing Edge Cases", () => {
  describe("Numeric format with multiple citations", () => {
    it("parses multiple consecutive citations", () => {
      const input = makeNumericResponse("First [1] Second [2]", [
        {
          id: 1,
          attachment_id: "file1",
          full_phrase: "first phrase",
          anchor_text: "first",
          page_id: "1_0",
          line_ids: [1],
        },
        {
          id: 2,
          attachment_id: "file2",
          full_phrase: "second phrase",
          anchor_text: "second",
          page_id: "2_0",
          line_ids: [2],
        },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(2);
      const anchorTexts = Object.values(result).map(c => c.anchorText);
      expect(anchorTexts).toContain("first");
      expect(anchorTexts).toContain("second");
    });
  });

  describe("Special characters in attributes", () => {
    it("preserves unicode characters in full_phrase", () => {
      const input = makeNumericResponse("Temperature reading [1]", [
        {
          id: 1,
          attachment_id: "test123",
          full_phrase: "Temperature: 98.6°F • Heart rate: 72 bpm",
          anchor_text: "98.6°F",
          page_id: "1_0",
        },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("°");
      expect(citation.fullPhrase).toContain("•");
    });

    it("preserves forward slashes in attribute values", () => {
      const input = makeNumericResponse("Date reference [1]", [
        { id: 1, attachment_id: "test123", full_phrase: "Date: 01/15/2024", anchor_text: "01/15/2024", page_id: "1_0" },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].fullPhrase).toBe("Date: 01/15/2024");
    });

    it("preserves equals signs in attribute values", () => {
      const input = makeNumericResponse("Formula [1]", [
        { id: 1, attachment_id: "test123", full_phrase: "Formula: E=mc²", anchor_text: "E=mc²", page_id: "1_0" },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].fullPhrase).toContain("E=mc");
    });
  });

  describe("Edge cases with incomplete data", () => {
    it("skips citations without full_phrase", () => {
      const input = makeNumericResponse("Test [1] [2]", [
        { id: 1, attachment_id: "test123", anchor_text: "no phrase" },
        { id: 2, attachment_id: "test123", full_phrase: "has phrase", anchor_text: "phrase", page_id: "1_0" },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      // Only citations with fullPhrase are included
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].fullPhrase).toBe("has phrase");
    });

    it("handles empty input", () => {
      const result = getAllCitationsFromLlmOutput("");
      expect(Object.keys(result).length).toBe(0);
    });

    it("handles null input", () => {
      const result = getAllCitationsFromLlmOutput(null);
      expect(Object.keys(result).length).toBe(0);
    });
  });

  describe("Line_ids edge cases", () => {
    it("sorts line_ids in ascending order", () => {
      const input = makeNumericResponse("Test [1]", [
        {
          id: 1,
          attachment_id: "test123",
          full_phrase: "phrase",
          anchor_text: "phrase",
          page_id: "1_0",
          line_ids: [50, 30, 10, 40, 20],
        },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      if (citation.type === "document") {
        expect(citation.lineIds).toEqual([10, 20, 30, 40, 50]);
      }
    });
  });

  describe("JSON object input", () => {
    it("parses JSON citation format from object input", () => {
      const input = {
        citations: [
          {
            fullPhrase: "important findings in Q4",
            anchorText: "important findings",
            startPageId: "page_number_1_index_0",
          },
          { fullPhrase: "revenue growth of 15 percent", anchorText: "15%", startPageId: "page_number_2_index_0" },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(2);
    });

    it("parses citations with reasoning", () => {
      const input = makeNumericResponse("Data [1]", [
        {
          id: 1,
          attachment_id: "test123",
          reasoning: "This citation references the section where the author discusses methodology",
          full_phrase: "methodology results conclusions",
          anchor_text: "methodology",
          page_id: "1_0",
        },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.reasoning).toContain("methodology");
    });
  });
});
