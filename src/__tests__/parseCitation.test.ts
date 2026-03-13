import { describe, expect, it } from "@jest/globals";
import {
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  groupCitationsByAttachmentId,
  normalizeCitationType,
} from "../parsing/parseCitation.js";
import type { Citation } from "../types/citation.js";
import { isDocumentCitation, isUrlCitation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

describe("getCitationStatus", () => {
  it("marks verified citations", () => {
    const found: Verification = {
      citation: {
        anchorText: "term",
        fullPhrase: "term",
        attachmentId: "file",
      },
      document: {
        verifiedPageNumber: 2,
      },
      status: "found",
      verifiedMatchSnippet: "snippet",
    };
    const status = getCitationStatus(found);
    expect(status.isVerified).toBe(true);
    expect(status.isPending).toBe(false);
  });

  it("marks misses and pending states", () => {
    const miss: Verification = {
      citation: {
        anchorText: "term",
        fullPhrase: "term",
        attachmentId: "file",
      },
      document: {
        verifiedPageNumber: -1, // sentinel: -1 means "not found" (no valid page matched)
      },
      status: "not_found",
      verifiedMatchSnippet: "snippet",
    };
    const status = getCitationStatus(miss);
    expect(status.isMiss).toBe(true);
    expect(status.isVerified).toBe(false);

    const pendingStatus = getCitationStatus(undefined);
    expect(pendingStatus.isPending).toBe(true);
  });

  describe("explicit status coverage", () => {
    it("treats found_on_other_page as partial match (verified with amber indicator)", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
          pageNumber: 4,
        },
        document: {
          verifiedPageNumber: 5,
        },
        status: "found_on_other_page",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(true); // Partial matches ARE verified (amber checkmark)
      expect(status.isMiss).toBe(false);
      expect(status.isPending).toBe(false);
    });

    it("treats found_on_other_line as partial match (verified with amber indicator)", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
          pageNumber: 3,
          lineIds: [1, 2, 3],
        },
        document: {
          verifiedPageNumber: 3,
          verifiedLineIds: [2, 3],
        },
        status: "found_on_other_line",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(true); // Partial matches ARE verified (amber checkmark)
    });

    it("treats first_word_found as partial match (verified with amber indicator)", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
          pageNumber: 1,
        },
        document: {
          verifiedPageNumber: 1,
        },
        status: "first_word_found",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(true); // Partial matches ARE verified (amber checkmark)
    });

    it("treats partial_text_found as partial match (verified with amber indicator)", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
        },
        document: {
          verifiedPageNumber: 2,
        },
        status: "partial_text_found",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(true); // Partial matches ARE verified (amber checkmark)
    });

    it("treats found_phrase_missed_anchor_text as verified but not partial", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
        },
        document: {
          verifiedPageNumber: 2,
        },
        status: "found_phrase_missed_anchor_text",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isVerified).toBe(true);
      expect(status.isPartialMatch).toBe(false);
    });

    it("treats found_anchor_text_only as partial match", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "full phrase",
          attachmentId: "file",
        },
        document: {
          verifiedPageNumber: 2,
        },
        status: "found_anchor_text_only",
        verifiedMatchSnippet: "term",
      };
      const status = getCitationStatus(verification);
      expect(status.isVerified).toBe(true);
      expect(status.isPartialMatch).toBe(true);
    });

    it("treats loading status as pending", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
        },
        document: {
          verifiedPageNumber: 2,
        },
        status: "loading",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPending).toBe(true);
      expect(status.isVerified).toBe(false);
    });

    it("treats pending status as pending", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
          pageNumber: 2,
        },
        document: {
          verifiedPageNumber: 2,
        },
        status: "pending",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPending).toBe(true);
      expect(status.isVerified).toBe(false);
    });

    it("treats not_found as miss but not verified", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
        },
        document: {
          verifiedPageNumber: -1, // sentinel: -1 means "not found" (no valid page matched)
        },
        status: "not_found",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isMiss).toBe(true);
      expect(status.isVerified).toBe(false);
      expect(status.isPartialMatch).toBe(false);
    });

    it("treats null status as pending", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
          pageNumber: 2,
        },
        document: {
          verifiedPageNumber: 2,
        },
        status: null,
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPending).toBe(true);
    });

    it("treats null verification as pending", () => {
      const status = getCitationStatus(null);
      expect(status.isPending).toBe(true);
      expect(status.isVerified).toBe(false);
      expect(status.isMiss).toBe(false);
      expect(status.isPartialMatch).toBe(false);
    });
  });
});

describe("getAllCitationsFromLlmOutput", () => {
  describe("null and empty input handling", () => {
    it("returns empty object for null input", () => {
      const result = getAllCitationsFromLlmOutput(null);
      expect(result).toEqual({});
    });

    it("returns empty object for undefined input", () => {
      const result = getAllCitationsFromLlmOutput(undefined);
      expect(result).toEqual({});
    });

    it("returns empty object for empty string", () => {
      const result = getAllCitationsFromLlmOutput("");
      expect(result).toEqual({});
    });

    it("returns empty object for string without citations", () => {
      const result = getAllCitationsFromLlmOutput("Just some plain text without any citations");
      expect(result).toEqual({});
    });

    it("returns empty object for empty object", () => {
      const result = getAllCitationsFromLlmOutput({});
      expect(result).toEqual({});
    });

    it("returns empty object for empty array", () => {
      const result = getAllCitationsFromLlmOutput([]);
      expect(result).toEqual({});
    });
  });

  describe("JSON citation extraction", () => {
    it("extracts citation from single JSON object with fullPhrase (backward compat: startPageKey -> startPageId)", () => {
      // Input uses old naming: startPageKey
      const input: Citation = {
        fullPhrase: "test phrase",
        attachmentId: "file123456789012345",
        startPageKey: "page_number_3_index_0",
        lineIds: [1, 2, 3],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("test phrase");
      expect(citation.pageNumber).toBe(3);
      expect(citation.lineIds).toEqual([1, 2, 3]);
    });

    it("extracts citations from array of JSON objects", () => {
      const input: Citation[] = [
        { fullPhrase: "first phrase", attachmentId: "file1" },
        { fullPhrase: "second phrase", attachmentId: "file2" },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
      const phrases = Object.values(result).map(c => c.fullPhrase);
      expect(phrases).toContain("first phrase");
      expect(phrases).toContain("second phrase");
    });

    it("extracts citations from nested citation property", () => {
      const input = {
        response: "Some response",
        citation: {
          fullPhrase: "nested citation",
          attachmentId: "file123",
        },
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("nested citation");
    });

    it("extracts citations from nested citations array property", () => {
      const input = {
        response: "Some response",
        citations: [
          { fullPhrase: "citation one", attachmentId: "f1" },
          { fullPhrase: "citation two", attachmentId: "f2" },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
      const phrases = Object.values(result).map(c => c.fullPhrase);
      expect(phrases).toContain("citation one");
      expect(phrases).toContain("citation two");
    });

    it("extracts deeply nested citations", () => {
      const input = {
        level1: {
          level2: {
            level3: {
              citations: [{ fullPhrase: "deep citation", attachmentId: "deep1" }],
            },
          },
        },
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("deep citation");
    });

    it("extracts citations from array containing objects with citations", () => {
      const input = [
        { citation: { fullPhrase: "array item 1", attachmentId: "f1" } },
        { citation: { fullPhrase: "array item 2", attachmentId: "f2" } },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
    });
  });

  describe("JSON citation with startPageId parsing (backward compat: startPageKey)", () => {
    // NOTE: These tests use old field name (startPageKey) to verify backward compatibility.
    // The parser accepts both old (startPageKey) and new (startPageId) names.

    it("parses page number from page_number_X_index_Y format", () => {
      // Input uses old naming: startPageKey
      const input: Citation = {
        fullPhrase: "test",
        startPageKey: "page_number_5_index_2",
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.pageNumber).toBe(5);
    });

    it("parses page number from pageKey_X_index_Y format", () => {
      // Input uses old naming: startPageKey
      const input: Citation = {
        fullPhrase: "test",
        startPageKey: "pageKey_10_index_0",
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.pageNumber).toBe(10);
    });

    it("handles missing startPageId gracefully", () => {
      const input: Citation = {
        fullPhrase: "test without page",
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.pageNumber).toBeUndefined();
    });

    it("parses page number from n_m format (e.g., '5_4' for page 5, index 4)", () => {
      // Input uses old naming: startPageKey
      const input: Citation = {
        fullPhrase: "test",
        startPageKey: "5_4",
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.pageNumber).toBe(5);
    });
  });

  describe("JSON citation lineIds handling", () => {
    it("sorts lineIds in ascending order", () => {
      const input: Citation = {
        fullPhrase: "test",
        lineIds: [5, 1, 10, 3],
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toEqual([1, 3, 5, 10]);
    });

    it("handles empty lineIds array", () => {
      const input: Citation = {
        fullPhrase: "test",
        lineIds: [],
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toBeUndefined();
    });

    it("handles null lineIds", () => {
      const input: Citation = {
        fullPhrase: "test",
        lineIds: null,
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toBeUndefined();
    });
  });

  describe("citation filtering and validation", () => {
    it("skips JSON citations without fullPhrase", () => {
      const input: Citation[] = [
        { fullPhrase: "valid citation", attachmentId: "f1" },
        { attachmentId: "f2", lineIds: [1, 2] } as Citation, // missing fullPhrase
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].fullPhrase).toBe("valid citation");
    });

    it("skips null items in citation array", () => {
      const input = [
        { fullPhrase: "valid", attachmentId: "f1" },
        null,
        { fullPhrase: "also valid", attachmentId: "f2" },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe("citation key generation", () => {
    it("generates unique keys for different citations", () => {
      const input: Citation[] = [
        { fullPhrase: "phrase one", attachmentId: "f1", pageNumber: 1 },
        { fullPhrase: "phrase two", attachmentId: "f2", pageNumber: 2 },
      ];
      const result = getAllCitationsFromLlmOutput(input);
      const keys = Object.keys(result);

      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toBe(keys[1]);
    });

    it("generates same key for identical citations", () => {
      const citation1: Citation = {
        fullPhrase: "same phrase",
        attachmentId: "same",
      };
      const citation2: Citation = {
        fullPhrase: "same phrase",
        attachmentId: "same",
      };

      const result1 = getAllCitationsFromLlmOutput(citation1);
      const result2 = getAllCitationsFromLlmOutput(citation2);

      const key1 = Object.keys(result1)[0];
      const key2 = Object.keys(result2)[0];

      expect(key1).toBe(key2);
    });

    it("generates 16-character citation keys", () => {
      const input: Citation = { fullPhrase: "test", attachmentId: "f1" };
      const result = getAllCitationsFromLlmOutput(input);
      const key = Object.keys(result)[0];

      expect(key).toHaveLength(16);
    });
  });

  describe("edge cases", () => {
    it("handles non-citation object properties", () => {
      const input = {
        notACitation: "just a string",
        someNumber: 42,
        someArray: [1, 2, 3],
        someNestedObject: { foo: "bar" },
      };
      const result = getAllCitationsFromLlmOutput(input);
      expect(result).toEqual({});
    });

    it("handles primitive values (number)", () => {
      const result = getAllCitationsFromLlmOutput(42);
      expect(result).toEqual({});
    });

    it("handles primitive values (boolean)", () => {
      const result = getAllCitationsFromLlmOutput(true);
      expect(result).toEqual({});
    });

    it("handles citation with optional value and reasoning", () => {
      const input: Citation = {
        fullPhrase: "test phrase",
        attachmentId: "f1",
        anchorText: "$500",
        reasoning: "This is the reasoning",
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];

      expect(citation.anchorText).toBe("$500");
      expect(citation.reasoning).toBe("This is the reasoning");
    });
  });

  describe("isJsonCitationFormat detection", () => {
    it("detects object with fullPhrase as citation format", () => {
      const input = { fullPhrase: "test" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("detects object with startPageId as citation format (backward compat: startPageKey)", () => {
      // Input uses old naming: startPageKey
      const input = {
        startPageKey: "page_number_1_index_0",
        fullPhrase: "test",
      };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("detects object with lineIds as citation format", () => {
      const input = { lineIds: [1, 2, 3], fullPhrase: "test" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("detects array with at least one citation-like object", () => {
      const input = [{ notACitation: true }, { fullPhrase: "this is a citation" }];
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("rejects array with no citation-like objects", () => {
      const input = [{ foo: "bar" }, { baz: 123 }];
      const result = getAllCitationsFromLlmOutput(input);
      expect(result).toEqual({});
    });
  });

  describe("snake_case JSON citation support (backward compat: start_page_key -> startPageId, anchor_text)", () => {
    // NOTE: These tests use old snake_case names (start_page_key, key_span) to verify backward compatibility.
    // The parser accepts old names but outputs the new names (anchorText, startPageId).

    it("detects object with full_phrase (snake_case) as citation format", () => {
      const input = { full_phrase: "test snake case" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].fullPhrase).toBe("test snake case");
    });

    it("detects object with start_page_key (snake_case) as citation format (backward compat)", () => {
      // Input uses old naming: start_page_key
      const input = {
        start_page_key: "page_number_3_index_0",
        full_phrase: "test",
      };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].pageNumber).toBe(3);
    });

    it("detects object with line_ids (snake_case) as citation format", () => {
      const input = { line_ids: [5, 2, 8], full_phrase: "test" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].lineIds).toEqual([2, 5, 8]);
    });

    it("detects object with attachment_id (snake_case)", () => {
      const input = { attachment_id: "my_file_123", full_phrase: "test" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].attachmentId).toBe("my_file_123");
    });

    it("parses full snake_case citation object (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: start_page_key, key_span is mapped to anchorText
      const input = {
        attachment_id: "doc123",
        full_phrase: "The quick brown fox",
        start_page_key: "page_number_7_index_2",
        line_ids: [10, 5, 15],
        anchorText: "$100.00",
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.attachmentId).toBe("doc123");
      expect(citation.fullPhrase).toBe("The quick brown fox");
      expect(citation.pageNumber).toBe(7);
      expect(citation.lineIds).toEqual([5, 10, 15]);
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("$100.00");
    });

    it("parses array of snake_case citations", () => {
      const input = [
        { full_phrase: "first citation", attachment_id: "f1" },
        { full_phrase: "second citation", attachment_id: "f2" },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(2);
      const phrases = Object.values(result).map(c => c.fullPhrase);
      expect(phrases).toContain("first citation");
      expect(phrases).toContain("second citation");
    });

    it("extracts snake_case citations from nested citations property", () => {
      const input = {
        response: "Some text",
        citations: [
          {
            full_phrase: "nested snake",
            attachment_id: "n1",
            line_ids: [1, 2],
          },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("nested snake");
      expect(citation.lineIds).toEqual([1, 2]);
    });

    it("handles mixed camelCase and snake_case in same object (backward compat: start_page_key)", () => {
      // Input uses old naming: start_page_key
      const input = {
        fullPhrase: "mixed case test",
        attachment_id: "mixed123",
        start_page_key: "page_number_2_index_0",
        lineIds: [3, 1, 2],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("mixed case test");
      expect(citation.attachmentId).toBe("mixed123");
      expect(citation.pageNumber).toBe(2);
      expect(citation.lineIds).toEqual([1, 2, 3]);
    });

    it("prefers camelCase over snake_case when both present", () => {
      const input = {
        fullPhrase: "camelCase wins",
        full_phrase: "snake_case loses",
        attachmentId: "camelId",
        attachment_id: "snakeId",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("camelCase wins");
      expect(citation.attachmentId).toBe("camelId");
    });
  });

  describe("anchorText JSON citation support (backward compat: keySpan, key_span)", () => {
    // NOTE: These tests use old names (keySpan, key_span) to verify backward compatibility.
    // The parser accepts old names but outputs the new name (anchorText).

    it("parses anchorText from camelCase JSON citation (backward compat: keySpan)", () => {
      // Input uses old naming: keySpan
      const input = {
        fullPhrase: "The quick brown fox jumps over the lazy dog",
        keySpan: "quick brown fox",
        attachmentId: "file123",
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The quick brown fox jumps over the lazy dog");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("quick brown fox");
    });

    it("parses anchor_text from snake_case JSON citation (backward compat: key_span)", () => {
      // Input uses old naming: key_span
      const input = {
        full_phrase: "The quick brown fox jumps over the lazy dog",
        key_span: "quick brown fox",
        attachment_id: "file123",
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The quick brown fox jumps over the lazy dog");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("quick brown fox");
    });

    it("prefers camelCase anchorText over snake_case anchor_text (backward compat: keySpan, key_span)", () => {
      // Input uses old naming: keySpan, key_span
      const input = {
        fullPhrase: "test phrase",
        keySpan: "camelCase span",
        key_span: "snake_case span",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citation = Object.values(result)[0];
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("camelCase span");
    });

    it("detects object with anchorText as citation format (backward compat: keySpan)", () => {
      // Input uses old naming: keySpan
      const input = {
        keySpan: "key words",
        fullPhrase: "full sentence with key words",
      };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      // Output uses new naming: anchorText
      expect(Object.values(result)[0].anchorText).toBe("key words");
    });

    it("detects object with anchor_text as citation format (backward compat: key_span)", () => {
      // Input uses old naming: key_span
      const input = {
        key_span: "key words",
        full_phrase: "full sentence with key words",
      };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      // Output uses new naming: anchorText
      expect(Object.values(result)[0].anchorText).toBe("key words");
    });

    it("parses full citation with anchorText from nested citations property (backward compat: keySpan, startPageKey)", () => {
      // Input uses old naming: keySpan, startPageKey
      const input = {
        response: "Some response",
        citations: [
          {
            fullPhrase: "The total amount is $500.00",
            keySpan: "$500.00",
            attachmentId: "doc1",
            startPageKey: "page_number_5_index_0",
            lineIds: [10, 11, 12],
          },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The total amount is $500.00");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("$500.00");
      expect(citation.pageNumber).toBe(5);
      expect(citation.lineIds).toEqual([10, 11, 12]);
    });
  });

  describe("citation numbering in JSON extraction", () => {
    it("assigns sequential citation numbers", () => {
      const input: Citation[] = [
        { fullPhrase: "first", attachmentId: "f1" },
        { fullPhrase: "second", attachmentId: "f2" },
        { fullPhrase: "third", attachmentId: "f3" },
      ];
      const result = getAllCitationsFromLlmOutput(input);
      const citations = Object.values(result);

      const numbers = citations.map(c => c.citationNumber).sort((a, b) => (a || 0) - (b || 0));
      expect(numbers).toEqual([1, 2, 3]);
    });
  });

  describe("backwards compatibility with fileId/file_id", () => {
    it("parses JSON citation with fileId property (backward compat: startPageKey -> startPageId)", () => {
      // Input uses old naming: startPageKey
      const input: Citation = {
        fullPhrase: "test phrase",
        fileId: "file123456789012345",
        startPageKey: "page_number_3_index_0",
        lineIds: [1, 2, 3],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("test phrase");
      expect(citation.attachmentId).toBe("file123456789012345");
      expect(citation.pageNumber).toBe(3);
    });

    it("parses JSON citation with file_id property (snake_case, backward compat: start_page_key)", () => {
      // Input uses old naming: start_page_key
      const input = {
        full_phrase: "snake case test",
        file_id: "file123456789012345",
        start_page_key: "page_number_5_index_0",
        line_ids: [1, 2],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("snake case test");
      expect(citation.attachmentId).toBe("file123456789012345");
      expect(citation.pageNumber).toBe(5);
    });
  });

  describe("CITATION_JSON_OUTPUT_FORMAT compatibility", () => {
    // Tests for JSON results matching CITATION_JSON_OUTPUT_FORMAT structure
    // from citationPrompts.ts - these test the extractJsonCitations and
    // findJsonCitationsInObject functions

    it("extracts citation matching CITATION_JSON_OUTPUT_FORMAT schema", () => {
      // Exact structure matching CITATION_JSON_OUTPUT_FORMAT
      // Input uses old naming (keySpan, startPageKey) for backward compatibility testing
      const input = {
        attachmentId: "file123456789012345",
        reasoning: "This citation directly supports the claim about revenue",
        fullPhrase: "Revenue increased 45% year-over-year to $2.3 billion",
        keySpan: "increased 45%",
        startPageKey: "page_number_2_index_1",
        lineIds: [12, 13, 14],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.attachmentId).toBe("file123456789012345");
      expect(citation.reasoning).toBe("This citation directly supports the claim about revenue");
      expect(citation.fullPhrase).toBe("Revenue increased 45% year-over-year to $2.3 billion");
      // Output uses new naming (anchorText)
      expect(citation.anchorText).toBe("increased 45%");
      expect(citation.pageNumber).toBe(2);
      expect(citation.lineIds).toEqual([12, 13, 14]);
    });

    it("extracts citation from object with single 'citation' property", () => {
      // Input uses old naming (keySpan, startPageKey) for backward compatibility testing
      const input = {
        response: "The company showed strong growth in Q4.",
        citation: {
          attachmentId: "doc123",
          reasoning: "Supports the growth claim",
          fullPhrase: "Q4 earnings exceeded expectations by 20%",
          keySpan: "exceeded expectations",
          startPageKey: "page_number_5_index_0",
          lineIds: [10, 11],
        },
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("Q4 earnings exceeded expectations by 20%");
      // Output uses new naming (anchorText)
      expect(citation.anchorText).toBe("exceeded expectations");
      expect(citation.reasoning).toBe("Supports the growth claim");
    });

    it("extracts citations from object with 'citations' array property", () => {
      // Input uses old naming (keySpan, startPageKey) for backward compatibility testing
      const input = {
        answer: "Multiple data points support this conclusion.",
        citations: [
          {
            attachmentId: "doc1",
            reasoning: "First supporting evidence",
            fullPhrase: "Market share increased to 35%",
            keySpan: "35%",
            startPageKey: "page_number_1_index_0",
            lineIds: [5],
          },
          {
            attachmentId: "doc2",
            reasoning: "Second supporting evidence",
            fullPhrase: "Customer retention improved by 15%",
            keySpan: "15%",
            startPageKey: "page_number_3_index_0",
            lineIds: [20, 21],
          },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(2);
      const citations = Object.values(result);
      // Output uses new naming (anchorText)
      expect(citations.map(c => c.anchorText)).toContain("35%");
      expect(citations.map(c => c.anchorText)).toContain("15%");
    });

    it("extracts single citation from 'citations' property (non-array)", () => {
      const input = {
        summary: "Key finding from the report",
        citations: {
          attachmentId: "report123",
          reasoning: "Direct quote from conclusion",
          fullPhrase: "The study conclusively demonstrates improvement",
          keySpan: "conclusively demonstrates",
          startPageKey: "page_number_10_index_0",
          lineIds: [1, 2, 3],
        },
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The study conclusively demonstrates improvement");
    });

    it("extracts citations from deeply nested structure with 'citation' property", () => {
      const input = {
        analysis: {
          findings: {
            primary: {
              citation: {
                attachmentId: "nested123",
                reasoning: "Deeply nested citation",
                fullPhrase: "Nested finding in complex structure",
                keySpan: "Nested finding",
                startPageKey: "page_number_7_index_2",
                lineIds: [15],
              },
            },
          },
        },
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("Nested finding in complex structure");
      expect(citation.pageNumber).toBe(7);
    });

    it("extracts citations from array of objects each with 'citation' property", () => {
      const input = {
        results: [
          {
            section: "Introduction",
            citation: {
              attachmentId: "intro1",
              fullPhrase: "First section citation",
              keySpan: "First",
              startPageKey: "page_number_1_index_0",
              lineIds: [1],
            },
          },
          {
            section: "Methodology",
            citation: {
              attachmentId: "method1",
              fullPhrase: "Second section citation",
              keySpan: "Second",
              startPageKey: "page_number_2_index_0",
              lineIds: [10],
            },
          },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(2);
      const phrases = Object.values(result).map(c => c.fullPhrase);
      expect(phrases).toContain("First section citation");
      expect(phrases).toContain("Second section citation");
    });

    it("extracts citations from mixed 'citation' and 'citations' properties", () => {
      const input = {
        mainClaim: {
          citation: {
            attachmentId: "main1",
            fullPhrase: "Main citation phrase",
            keySpan: "Main",
            startPageKey: "page_number_1_index_0",
            lineIds: [1],
          },
        },
        supportingEvidence: {
          citations: [
            {
              attachmentId: "support1",
              fullPhrase: "Supporting citation one",
              keySpan: "one",
              startPageKey: "page_number_2_index_0",
              lineIds: [5],
            },
            {
              attachmentId: "support2",
              fullPhrase: "Supporting citation two",
              keySpan: "two",
              startPageKey: "page_number_3_index_0",
              lineIds: [10],
            },
          ],
        },
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(3);
      const phrases = Object.values(result).map(c => c.fullPhrase);
      expect(phrases).toContain("Main citation phrase");
      expect(phrases).toContain("Supporting citation one");
      expect(phrases).toContain("Supporting citation two");
    });

    it("extracts citations with snake_case format matching CITATION_JSON_OUTPUT_FORMAT", () => {
      // Input uses old naming (key_span, start_page_key) for backward compatibility testing
      const input = {
        citation: {
          attachment_id: "snake123",
          reasoning: "Using snake_case properties",
          full_phrase: "Snake case formatted citation",
          key_span: "Snake case",
          start_page_key: "page_number_4_index_0",
          line_ids: [8, 9],
        },
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.attachmentId).toBe("snake123");
      expect(citation.fullPhrase).toBe("Snake case formatted citation");
      // Output uses new naming (anchorText)
      expect(citation.anchorText).toBe("Snake case");
      expect(citation.pageNumber).toBe(4);
      expect(citation.lineIds).toEqual([8, 9]);
    });

    it("handles LLM response with structured output containing citations", () => {
      // Simulates a structured output response from GPT/Claude with JSON mode
      // Input uses old naming (keySpan, startPageKey) for backward compatibility testing
      const input = {
        type: "analysis",
        content: "Based on the document analysis...",
        citations: [
          {
            attachmentId: "gpt-response-1",
            reasoning: "This directly answers the user question",
            fullPhrase: "The quarterly revenue was $5.2 million",
            keySpan: "$5.2 million",
            startPageKey: "page_number_1_index_0",
            lineIds: [25, 26, 27],
          },
        ],
        confidence: 0.95,
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      // Output uses new naming (anchorText)
      expect(citation.anchorText).toBe("$5.2 million");
      expect(citation.lineIds).toEqual([25, 26, 27]);
    });

    it("ignores properties named 'citation' or 'citations' that don't match format", () => {
      const input = {
        citation: "Just a string, not a citation object",
        citations: [1, 2, 3], // Array of numbers, not citation objects
        actualCitation: {
          fullPhrase: "Real citation here",
          attachmentId: "real123",
        },
      };
      const result = getAllCitationsFromLlmOutput(input);

      // Should only find the root-level citation since actualCitation is not
      // a recognized property name (only 'citation' and 'citations' are searched)
      expect(Object.keys(result)).toHaveLength(0);
    });

    it("handles empty citations array gracefully", () => {
      const input = {
        response: "No citations for this response",
        citations: [],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it("handles null citation property gracefully", () => {
      const input = {
        response: "Citation not available",
        citation: null,
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it("handles undefined citations property gracefully", () => {
      const input = {
        response: "No citations defined",
        citations: undefined,
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it("extracts citations from array at root level with nested citations property", () => {
      const input = [
        {
          question: "Q1",
          citations: [
            {
              fullPhrase: "Answer to Q1",
              attachmentId: "q1-doc",
              keySpan: "Q1",
              lineIds: [1],
            },
          ],
        },
        {
          question: "Q2",
          citations: [
            {
              fullPhrase: "Answer to Q2",
              attachmentId: "q2-doc",
              keySpan: "Q2",
              lineIds: [5],
            },
          ],
        },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(2);
      const phrases = Object.values(result).map(c => c.fullPhrase);
      expect(phrases).toContain("Answer to Q1");
      expect(phrases).toContain("Answer to Q2");
    });

    it("correctly assigns citation numbers sequentially for nested citations", () => {
      const input = {
        level1: {
          citation: {
            fullPhrase: "First nested",
            attachmentId: "f1",
          },
        },
        level2: {
          citations: [
            { fullPhrase: "Second nested", attachmentId: "f2" },
            { fullPhrase: "Third nested", attachmentId: "f3" },
          ],
        },
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citations = Object.values(result);

      // All citations should have sequential numbers
      const numbers = citations.map(c => c.citationNumber).sort((a, b) => (a || 0) - (b || 0));
      expect(numbers).toEqual([1, 2, 3]);
    });
  });

  describe("deferred JSON <<<CITATION_DATA>>> format", () => {
    it("extracts citations from exact user failing scenario with 14 citations", () => {
      // This is the EXACT failing scenario from the user
      const input = `Here's a summary of the medical document for John Doe:

Patient Profile:
- Name: John Doe [1]
- Age: 50 years old [1]
- Gender: Male [1]
- Allergies: NKDA (No Known Drug Allergies) [1]

Medical History:
- Chronic conditions include:
  - Hypertension (HTN)
  - Coronary Artery Disease (CAD)
  - Heart Failure with Preserved Ejection Fraction (HFEF)
  - Hypothyroidism
  - High Lipid Disorder (HLD)
  - Chronic back pain [2]

Hospital Course:
- 5/15: Worsening shortness of breath (SOB) at home [3]
- 5/17: Admitted to outside hospital, cardiac catheterization performed [4]
- 5/18: Transferred to Cardiovascular Intensive Care Unit (CVICU)
  - Intra-Aortic Balloon Pump (IABP) placed
  - Added to transplant list [5]
- 5/19: Dobutamine treatment started [6]

Current Status:
- Vital Signs: Afebrile, Alert and Oriented [7]
- Cardiovascular:
  - Normal Sinus Rhythm (NSR)
  - Pulses present with 1+ edema [8]
- Respiratory: On 2L nasal cannula [9]
- Mobility: Ambulates with 2+ assistance, short of breath with exertion [10]

Medications/Treatments:
- Ongoing IV medications:
  - Heparin (12 units/hour)
  - Bumex (5 mg/hour)
  - Dobutamine (2.5 mcg/kg)
  - Milrinone (0.25 mg/kg)
  - Nicardipine (2.5 mg/hour) [11]

Devices:
- Right-sided PICC line
- Intra-Aortic Balloon Pump (IABP)
- Radial arterial line
- Multiple IV access points [12]

Consults Requested:
- Critical Care
- Palliative Care
- Psychiatry
- Infectious Disease [13]

Family:
- Wife (July)
- Son (Chris) [14]

<<<CITATION_DATA>>>
{
  "LOcZ46PdCNO1P62p0p9M": [
    {"id": 1, "reasoning": "Patient identification details", "full_phrase": "John Doe 50/M Full NKDA", "anchor_text": "John Doe 50/M", "page_id": "1_0", "line_ids": [1, 5]},
    {"id": 2, "reasoning": "Lists patient's medical history", "full_phrase": "HTN, CAD, HFEF, Hypothyroid, HLD, (R) Sided PICC on home milrinone, chronic back pain", "anchor_text": "medical history", "page_id": "1_0", "line_ids": [20, 25]},
    {"id": 3, "reasoning": "Initial symptom onset", "full_phrase": "5/15-worsening soB at home", "anchor_text": "worsening soB", "page_id": "1_0", "line_ids": [10]},
    {"id": 4, "reasoning": "Hospital admission details", "full_phrase": "5/17-admitted at outside hospital; cardiac cath Showing 1 pulm HTN, low Cl, low SVO2", "anchor_text": "admitted at outside hospital", "page_id": "1_0", "line_ids": [11, 12]},
    {"id": 5, "reasoning": "Transfer and treatment details", "full_phrase": "5/18-transferred to CVICU IABP placed and placed on transplant list", "anchor_text": "transferred to CVICU", "page_id": "1_0", "line_ids": [15, 16]},
    {"id": 6, "reasoning": "New treatment initiated", "full_phrase": "5/19-dobutamine started", "anchor_text": "dobutamine started", "page_id": "1_0", "line_ids": [17]},
    {"id": 7, "reasoning": "Patient's current condition", "full_phrase": "AxOx4 afebrile", "anchor_text": "AxOx4 afebrile", "page_id": "1_0", "line_ids": [30, 35]},
    {"id": 8, "reasoning": "Cardiovascular assessment", "full_phrase": "NSR w PVCS Pulses 2+ Edema 1+", "anchor_text": "Pulses 2+ Edema 1+", "page_id": "1_0", "line_ids": [40, 45, 50]},
    {"id": 9, "reasoning": "Respiratory support", "full_phrase": "Fi0z 2L NC", "anchor_text": "2L NC", "page_id": "1_0", "line_ids": [80, 81]},
    {"id": 10, "reasoning": "Patient mobility", "full_phrase": "ambulates 2+ assist SOB w/ exertion", "anchor_text": "ambulates 2+ assist", "page_id": "1_0", "line_ids": [110, 115]},
    {"id": 11, "reasoning": "IV medication details", "full_phrase": "Gtts: Heparin 12 uhr, Bumex 5mg/hr, Dobutamine 2.5mcg/kg, Milrinone 0.25mg/kg, Nicardipine 2.5mg/hr", "anchor_text": "IV medications", "page_id": "1_0", "line_ids": [25, 30, 35]},
    {"id": 12, "reasoning": "Medical devices and access points", "full_phrase": "(R) Sided PICC on home milrinone, IABP, radial art line, IT Mac w/swan 55, FA PIV, AC PIV, fem IABP, subclavian PICC", "anchor_text": "medical devices", "page_id": "1_0", "line_ids": [20, 75, 80]},
    {"id": 13, "reasoning": "Requested medical consultations", "full_phrase": "CONSULTS: *Critical Care *Palliative *Psych ID", "anchor_text": "CONSULTS", "page_id": "1_0", "line_ids": [60, 65]},
    {"id": 14, "reasoning": "Family information", "full_phrase": "FAMILY July-wife * Pon Chris-Son", "anchor_text": "FAMILY", "page_id": "1_0", "line_ids": [65, 70]}
  ]
}
<<<END_CITATION_DATA>>>`;

      const result = getAllCitationsFromLlmOutput(input);

      // Should have all 14 citations
      expect(Object.keys(result).length).toBe(14);

      const citations = Object.values(result);

      // All citations should have the same attachmentId
      expect(citations.every(c => c.attachmentId === "LOcZ46PdCNO1P62p0p9M")).toBe(true);

      // Check a few specific citations
      const citation1 = citations.find(c => c.citationNumber === 1);
      expect(citation1?.fullPhrase).toBe("John Doe 50/M Full NKDA");
      expect(citation1?.pageNumber).toBe(1);

      const citation14 = citations.find(c => c.citationNumber === 14);
      expect(citation14?.fullPhrase).toBe("FAMILY July-wife * Pon Chris-Son");
    });

    it("extracts citations from deferred JSON format (grouped by attachmentId)", () => {
      const input = `Here's a summary of the patient document:

Patient Profile:
- Name: John Doe [1]
- Age: 50 years old [2]
- Gender: Male [3]
- Allergies: NKDA (No Known Drug Allergies) [4]

<<<CITATION_DATA>>>
{
  "bm8JG5cIv5uhhj1ViHNm": [
    {"id": 1, "reasoning": "Patient name", "full_phrase": "John Doe", "anchor_text": "John Doe", "page_id": "1_0", "line_ids": [1]},
    {"id": 2, "reasoning": "Patient age", "full_phrase": "50/M", "anchor_text": "50", "page_id": "1_0", "line_ids": [1]},
    {"id": 3, "reasoning": "Patient gender", "full_phrase": "50/M", "anchor_text": "M", "page_id": "1_0", "line_ids": [1]},
    {"id": 4, "reasoning": "No known drug allergies", "full_phrase": "NKDA", "anchor_text": "NKDA", "page_id": "1_0", "line_ids": [5]}
  ]
}
<<<END_CITATION_DATA>>>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(4);
      const citations = Object.values(result);
      const phrases = citations.map(c => c.fullPhrase);
      expect(phrases).toContain("John Doe");
      expect(phrases).toContain("50/M");
      expect(phrases).toContain("NKDA");

      // Verify attachmentId is correctly injected from the group key
      const johndoeCitation = citations.find(c => c.fullPhrase === "John Doe");
      expect(johndoeCitation?.attachmentId).toBe("bm8JG5cIv5uhhj1ViHNm");
      expect(johndoeCitation?.pageNumber).toBe(1);
    });

    it("extracts citations from deferred JSON format (flat array)", () => {
      const input = `The company grew 45% [1].

<<<CITATION_DATA>>>
[
  {"id": 1, "attachment_id": "abc123", "reasoning": "growth metrics", "full_phrase": "The company achieved 45% year-over-year growth", "anchor_text": "45% growth", "page_id": "2_1", "line_ids": [12, 13]}
]
<<<END_CITATION_DATA>>>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The company achieved 45% year-over-year growth");
      expect(citation.attachmentId).toBe("abc123");
      expect(citation.anchorText).toBe("45% growth");
      expect(citation.pageNumber).toBe(2);
      expect(citation.lineIds).toEqual([12, 13]);
    });

    it("extracts citations from deferred JSON format with compact keys", () => {
      const input = `Test [1].

<<<CITATION_DATA>>>
[
  {"n": 1, "a": "doc123", "r": "reason", "f": "full phrase here", "k": "phrase", "p": "3_2", "l": [5, 6]}
]
<<<END_CITATION_DATA>>>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("full phrase here");
      expect(citation.attachmentId).toBe("doc123");
      expect(citation.anchorText).toBe("phrase");
      expect(citation.reasoning).toBe("reason");
      expect(citation.pageNumber).toBe(3);
      expect(citation.lineIds).toEqual([5, 6]);
    });

    it("extracts citations from deferred JSON format with camelCase keys", () => {
      const input = `Camel case [1].

<<<CITATION_DATA>>>
[
  {"id": 1, "attachmentId": "abc123", "reasoning": "growth metrics", "fullPhrase": "The company achieved 45% year-over-year growth", "anchorText": "45% growth", "pageId": "2_1", "lineIds": [12, 13]}
]
<<<END_CITATION_DATA>>>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The company achieved 45% year-over-year growth");
      expect(citation.attachmentId).toBe("abc123");
      expect(citation.anchorText).toBe("45% growth");
      expect(citation.pageNumber).toBe(2);
      expect(citation.lineIds).toEqual([12, 13]);
    });

    it("extracts citations from deferred JSON format with multiple attachments", () => {
      const input = `From doc1 [1] and doc2 [2].

<<<CITATION_DATA>>>
{
  "doc1AttachmentId": [
    {"id": 1, "full_phrase": "content from doc1", "anchor_text": "doc1", "page_id": "1_0", "line_ids": [1]}
  ],
  "doc2AttachmentId": [
    {"id": 2, "full_phrase": "content from doc2", "anchor_text": "doc2", "page_id": "2_0", "line_ids": [5]}
  ]
}
<<<END_CITATION_DATA>>>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
      const citations = Object.values(result);

      const doc1Citation = citations.find(c => c.fullPhrase === "content from doc1");
      expect(doc1Citation?.attachmentId).toBe("doc1AttachmentId");

      const doc2Citation = citations.find(c => c.fullPhrase === "content from doc2");
      expect(doc2Citation?.attachmentId).toBe("doc2AttachmentId");
    });

    it("handles deferred JSON format without end delimiter", () => {
      const input = `Test [1].

<<<CITATION_DATA>>>
[{"id": 1, "attachment_id": "abc", "full_phrase": "test phrase", "anchor_text": "test"}]`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("test phrase");
    });

    it("handles AV citations with timestamps in deferred JSON format", () => {
      const input = `The speaker said [1].

<<<CITATION_DATA>>>
{
  "video456": [
    {"id": 1, "full_phrase": "transcript text", "anchor_text": "text", "timestamps": {"start_time": "00:01:00.000", "end_time": "00:01:30.000"}}
  ]
}
<<<END_CITATION_DATA>>>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(1);
      const citation = Object.values(result)[0];
      expect(citation.type).toBe("audio");
      expect(citation.attachmentId).toBe("video456");
      if (citation.type === "audio" || citation.type === "video") {
        expect(citation.timestamps?.startTime).toBe("00:01:00.000");
        expect(citation.timestamps?.endTime).toBe("00:01:30.000");
      }
    });
  });
});

// =============================================================================
// URL CITATION PARSING TESTS
// =============================================================================

describe("parseJsonCitation — URL citations", () => {
  it("creates UrlCitation from JSON with url field", () => {
    const input = {
      url: "https://example.com/article",
      domain: "example.com",
      title: "Test Article",
      fullPhrase: "The data shows growth",
      anchorText: "growth",
    };
    const result = getAllCitationsFromLlmOutput(input);
    const citations = Object.values(result);

    expect(citations).toHaveLength(1);
    expect(citations[0].type).toBe("url");
    expect(citations[0]).toHaveProperty("url", "https://example.com/article");
    expect(citations[0]).toHaveProperty("domain", "example.com");
    expect(citations[0]).toHaveProperty("title", "Test Article");
  });

  it("creates DocumentCitation from JSON with attachmentId and url", () => {
    const input = {
      attachmentId: "abc123",
      url: "https://example.com",
      fullPhrase: "Some phrase",
      pageNumber: 1,
    };
    const result = getAllCitationsFromLlmOutput(input);
    const citations = Object.values(result);

    expect(citations).toHaveLength(1);
    expect(citations[0].type).not.toBe("url");
    expect(citations[0]).toHaveProperty("attachmentId", "abc123");
  });

  it("creates UrlCitation from JSON when only url (no attachmentId) is present", () => {
    const input = { fullPhrase: "URL citation text", url: "https://example.com", domain: "example.com" };
    const result = getAllCitationsFromLlmOutput(input);
    const citation = Object.values(result)[0];

    expect(citation.type).toBe("url");
    expect(citation.fullPhrase).toBe("URL citation text");
  });

  it("creates DocumentCitation from JSON when attachmentId is present (no url)", () => {
    const input = { fullPhrase: "Doc citation text", attachmentId: "file1", pageNumber: 1 };
    const result = getAllCitationsFromLlmOutput(input);
    const citation = Object.values(result)[0];

    expect(citation.type).not.toBe("url");
    expect(citation.fullPhrase).toBe("Doc citation text");
  });

  it("extracts siteName and faviconUrl from JSON URL citations", () => {
    const input = {
      url: "https://example.com",
      siteName: "Example",
      faviconUrl: "https://example.com/favicon.ico",
      fullPhrase: "test phrase",
    };
    const result = getAllCitationsFromLlmOutput(input);
    const citation = Object.values(result)[0];

    expect(citation.type).toBe("url");
    expect(citation).toHaveProperty("siteName", "Example");
    expect(citation).toHaveProperty("faviconUrl", "https://example.com/favicon.ico");
  });
});

// =============================================================================
// normalizeCitationType TESTS
// =============================================================================

describe("normalizeCitationType", () => {
  it("passes through URL citations with type already set", () => {
    const raw = { type: "url", url: "https://example.com", fullPhrase: "test" };
    const result = normalizeCitationType(raw);
    expect(result.type).toBe("url");
  });

  it("adds type: 'url' when url field is present but type is missing", () => {
    const raw = { url: "https://example.com", fullPhrase: "test" };
    const result = normalizeCitationType(raw);
    expect(result.type).toBe("url");
  });

  it("throws when type is 'url' but url field is missing", () => {
    const raw = { type: "url", fullPhrase: "test" };
    expect(() => normalizeCitationType(raw)).toThrow("URL citation missing required 'url' field");
  });

  it("throws when type is 'url' but url field is empty string", () => {
    const raw = { type: "url", url: "", fullPhrase: "test" };
    expect(() => normalizeCitationType(raw)).toThrow("URL citation missing required 'url' field");
  });

  it("returns DocumentCitation when no url field is present", () => {
    const raw = { attachmentId: "abc", pageNumber: 1, fullPhrase: "test" };
    const result = normalizeCitationType(raw);
    expect(result.type).toBe("document");
  });

  it("returns DocumentCitation when url is not a string", () => {
    const raw = { url: 123, fullPhrase: "test" };
    const result = normalizeCitationType(raw);
    expect(result.type).toBe("document");
  });

  it("coerces to UrlCitation when url field is present even if type is 'document'", () => {
    const raw = { type: "document", url: "https://example.com", fullPhrase: "test" };
    const result = normalizeCitationType(raw);
    expect(result.type).toBe("url");
  });
});

// =============================================================================
// isDocumentCitation / isUrlCitation TYPE GUARDS
// =============================================================================

describe("type guards", () => {
  it("isUrlCitation returns true for URL citations", () => {
    const citation: Citation = { type: "url", url: "https://example.com", fullPhrase: "test" };
    expect(isUrlCitation(citation)).toBe(true);
    expect(isDocumentCitation(citation)).toBe(false);
  });

  it("isDocumentCitation returns true for document citations", () => {
    const citation: Citation = { type: "document", attachmentId: "abc", fullPhrase: "test" };
    expect(isDocumentCitation(citation)).toBe(true);
    expect(isUrlCitation(citation)).toBe(false);
  });
});

// =============================================================================
// groupCitationsByAttachmentId WITH URL CITATIONS
// =============================================================================

describe("groupCitationsByAttachmentId — mixed citation types", () => {
  it("groups URL citations under empty string key", () => {
    const citations: Citation[] = [
      { type: "url", url: "https://example.com", fullPhrase: "url phrase" },
      { type: "document", attachmentId: "file1", fullPhrase: "doc phrase", pageNumber: 1 },
    ];
    const grouped = groupCitationsByAttachmentId(citations);

    expect(grouped.has("")).toBe(true);
    expect(grouped.has("file1")).toBe(true);

    const urlGroup = grouped.get("");
    const docGroup = grouped.get("file1");
    expect(urlGroup).toBeDefined();
    expect(docGroup).toBeDefined();
    if (!urlGroup || !docGroup) return;

    expect(Object.values(urlGroup)).toHaveLength(1);
    expect(Object.values(urlGroup)[0].type).toBe("url");
    expect(Object.values(docGroup)).toHaveLength(1);
    expect(Object.values(docGroup)[0]).toHaveProperty("attachmentId", "file1");
  });
});
