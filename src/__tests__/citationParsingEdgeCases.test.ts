import { describe, expect, it } from "bun:test";
import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";
import { makeNumericResponse } from "./testHelpers.js";

describe("Citation Parsing Edge Cases", () => {
  describe("Numeric format with multiple citations", () => {
    it("parses multiple consecutive citations", () => {
      const input = makeNumericResponse("First [1] Second [2]", [
        {
          id: 1,
          attachment_id: "file1",
          source_context: "first phrase",
          source_match: "first",
          page_id: "1_0",
          line_ids: [1],
        },
        {
          id: 2,
          attachment_id: "file2",
          source_context: "second phrase",
          source_match: "second",
          page_id: "2_0",
          line_ids: [2],
        },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(2);
      const sourceMatches = Object.values(result).map(c => c.sourceMatch);
      expect(sourceMatches).toContain("first");
      expect(sourceMatches).toContain("second");
    });
  });

  describe("Special characters in attributes", () => {
    it("preserves unicode characters in source_context", () => {
      const input = makeNumericResponse("Temperature reading [1]", [
        {
          id: 1,
          attachment_id: "test123",
          source_context: "Temperature: 98.6°F • Heart rate: 72 bpm",
          source_match: "98.6°F",
          page_id: "1_0",
        },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.sourceContext).toContain("°");
      expect(citation.sourceContext).toContain("•");
    });

    it("preserves forward slashes in attribute values", () => {
      const input = makeNumericResponse("Date reference [1]", [
        {
          id: 1,
          attachment_id: "test123",
          source_context: "Date: 01/15/2024",
          source_match: "01/15/2024",
          page_id: "1_0",
        },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].sourceContext).toBe("Date: 01/15/2024");
    });

    it("preserves equals signs in attribute values", () => {
      const input = makeNumericResponse("Formula [1]", [
        { id: 1, attachment_id: "test123", source_context: "Formula: E=mc²", source_match: "E=mc²", page_id: "1_0" },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].sourceContext).toContain("E=mc");
    });
  });

  describe("Edge cases with incomplete data", () => {
    it("skips citations without source_context", () => {
      const input = makeNumericResponse("Test [1] [2]", [
        { id: 1, attachment_id: "test123", source_match: "no phrase" },
        { id: 2, attachment_id: "test123", source_context: "has phrase", source_match: "phrase", page_id: "1_0" },
      ]);
      const result = getAllCitationsFromLlmOutput(input);
      // Only citations with sourceContext are included
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].sourceContext).toBe("has phrase");
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
          source_context: "phrase",
          source_match: "phrase",
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
            sourceContext: "important findings in Q4",
            sourceMatch: "important findings",
            startPageId: "page_number_1_index_0",
          },
          { sourceContext: "revenue growth of 15 percent", sourceMatch: "15%", startPageId: "page_number_2_index_0" },
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
          source_context: "methodology results conclusions",
          source_match: "methodology",
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
