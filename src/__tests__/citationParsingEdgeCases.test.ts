import { describe, expect, it } from "@jest/globals";
import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";

describe("Citation Parsing Edge Cases", () => {
  describe("Non-self-closing citation tags", () => {
    it("parses multiple consecutive non-self-closing citations", () => {
      const input = `<cite attachment_id='file1' full_phrase='first' key_span='first' start_page_key='page_number_1_index_0' line_ids='1'>A</cite><cite attachment_id='file2' full_phrase='second' key_span='second' start_page_key='page_number_2_index_0' line_ids='2'>B</cite>`;
      const result = getAllCitationsFromLlmOutput(input);
      // backward compat: key_span in input is parsed to anchorText
      expect(Object.keys(result).length).toBe(2);
      const anchorTexts = Object.values(result).map((c) => c.anchorText);
      expect(anchorTexts).toContain("first");
      expect(anchorTexts).toContain("second");
    });

    it("parses nested markdown inside citation content", () => {
      const input = `<cite attachment_id='test123' full_phrase='important fact' key_span='fact' start_page_key='page_number_1_index_0' line_ids='1'>

**Bold text** and *italic* and \`code\`

- List item 1
- List item 2
</cite>`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].fullPhrase).toBe("important fact");
    });
  });

  describe("Escaped quotes in attributes", () => {
    it("parses escaped single quotes in reasoning attribute", () => {
      const input = `<cite attachment_id='test123' reasoning='The patient\\'s condition improved' full_phrase='condition improved' key_span='improved' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.reasoning).toContain("patient");
    });

    it("parses escaped double quotes in full_phrase", () => {
      const input = `<cite attachment_id="test123" full_phrase="He said \\"hello\\" to everyone" key_span="hello" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
    });

    it("parses multiple escaped quotes in same attribute", () => {
      const input = `<cite attachment_id='test123' reasoning='The \\'first\\' and \\'second\\' items' full_phrase='first and second' key_span='first' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
    });
  });

  describe("Multiline full_phrase handling", () => {
    it("parses full_phrase with literal newlines", () => {
      const input = `<cite attachment_id='test123' full_phrase='Line one
Line two
Line three' key_span='Line two' start_page_key='page_number_1_index_0' line_ids='1-3' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("Line one");
      expect(citation.fullPhrase).toContain("Line two");
    });

    it("parses full_phrase spanning multiple lines in non-self-closing tag", () => {
      const input = `<cite attachment_id='test123' full_phrase='First paragraph.

Second paragraph with more details.

Third paragraph concluding.' key_span='Second paragraph' start_page_key='page_number_1_index_0' line_ids='1-10'>Content here</cite>`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
    });
  });

  describe("Special characters in attributes", () => {
    it("decodes angle brackets from HTML entities in full_phrase", () => {
      const input = `<cite attachment_id='test123' full_phrase='The value was &lt;100 and &gt;50' key_span='100' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("<100");
      expect(citation.fullPhrase).toContain(">50");
    });

    it("decodes ampersands from HTML entities in full_phrase", () => {
      const input = `<cite attachment_id='test123' full_phrase='Smith &amp; Jones LLC' key_span='Smith' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("&");
    });

    it("preserves unicode characters in full_phrase", () => {
      const input = `<cite attachment_id='test123' full_phrase='Temperature: 98.6°F • Heart rate: 72 bpm' key_span='98.6°F' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("°");
      expect(citation.fullPhrase).toContain("•");
    });

    it("preserves forward slashes in attribute values", () => {
      const input = `<cite attachment_id='test123' full_phrase='Date: 01/15/2024' key_span='01/15/2024' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].fullPhrase).toBe("Date: 01/15/2024");
    });

    it("preserves equals signs in attribute values", () => {
      const input = `<cite attachment_id='test123' full_phrase='Formula: E=mc²' key_span='E=mc²' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].fullPhrase).toContain("E=mc");
    });
  });

  describe("Mixed citation formats", () => {
    it("parses mix of self-closing and non-self-closing citations", () => {
      const input = `First: <cite attachment_id='file1' full_phrase='phrase one' key_span='one' start_page_key='page_number_1_index_0' line_ids='1' />
Second: <cite attachment_id='file2' full_phrase='phrase two' key_span='two' start_page_key='page_number_2_index_0' line_ids='2'>content</cite>
Third: <cite attachment_id='file3' full_phrase='phrase three' key_span='three' start_page_key='page_number_3_index_0' line_ids='3' />`;
      // backward compat: key_span in input is parsed to anchorText
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(3);
      const anchorTexts = Object.values(result).map((c) => c.anchorText);
      expect(anchorTexts).toContain("one");
      expect(anchorTexts).toContain("two");
      expect(anchorTexts).toContain("three");
    });

    it("parses citations with and without escaped underscores", () => {
      const input = `First: <cite attachment\\_id='file1' full\\_phrase='phrase one' key\\_span='one' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='1' />
Second: <cite attachment_id='file2' full_phrase='phrase two' key_span='two' start_page_key='page_number_2_index_0' line_ids='2' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(2);
    });

    it("parses citations interspersed with markdown", () => {
      const input = `# Summary

The report shows **important findings**<cite attachment_id='file1' full_phrase='important findings in Q4' key_span='important findings' start_page_key='page_number_1_index_0' line_ids='1' />.

## Details

- Revenue increased by 15%<cite attachment_id='file2' full_phrase='revenue growth of 15 percent' key_span='15%' start_page_key='page_number_2_index_0' line_ids='5' />
- Costs decreased<cite attachment_id='file3' full_phrase='operational costs down' key_span='costs' start_page_key='page_number_3_index_0' line_ids='10' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(3);
    });
  });

  describe("Edge cases with incomplete/malformed citations", () => {
    it("parses citation with empty key_span", () => {
      const input = `<cite attachment_id='test123' full_phrase='some phrase' key_span='' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].fullPhrase).toBe("some phrase");
    });

    it("parses citation with very long full_phrase", () => {
      const longPhrase = "A".repeat(500) + " important " + "B".repeat(500);
      const input = `<cite attachment_id='test123' full_phrase='${longPhrase}' key_span='important' start_page_key='page_number_1_index_0' line_ids='1-50' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      expect(Object.values(result)[0].fullPhrase).toContain("important");
    });

    it("parses citation at very end of string", () => {
      const input = `Some text <cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
    });

    it("parses citation at very beginning of string", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1' /> followed by text`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
    });

    it("parses citation that is the entire string", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
    });
  });

  describe("Line_ids edge cases", () => {
    it("expands line_ids with large range", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1-100' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.lineIds?.length).toBe(100);
      expect(citation.lineIds?.[0]).toBe(1);
      expect(citation.lineIds?.[99]).toBe(100);
    });

    it("expands line_ids with multiple ranges", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1-3, 10-12, 20' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toContain(1);
      expect(citation.lineIds).toContain(2);
      expect(citation.lineIds).toContain(3);
      expect(citation.lineIds).toContain(10);
      expect(citation.lineIds).toContain(11);
      expect(citation.lineIds).toContain(12);
      expect(citation.lineIds).toContain(20);
    });

    it("sorts line_ids in ascending order", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='50, 30, 10, 40, 20' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toEqual([10, 20, 30, 40, 50]);
    });
  });

  describe("Reasoning attribute variations", () => {
    it("parses reasoning with complex explanation", () => {
      const input = `<cite attachment_id='test123' reasoning='This citation references the section where the author discusses: (1) methodology, (2) results, and (3) conclusions - all of which support the claim.' full_phrase='methodology results conclusions' key_span='methodology' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.reasoning).toContain("methodology");
      expect(citation.reasoning).toContain("conclusions");
    });

    it("parses reasoning with numbers and symbols", () => {
      const input = `<cite attachment_id='test123' reasoning='Page 42, Section 3.1.2 shows 95% confidence interval (p<0.05)' full_phrase='95% confidence' key_span='95%' start_page_key='page_number_42_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.reasoning).toContain("95%");
    });
  });
});
