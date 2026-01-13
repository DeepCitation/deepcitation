import { describe, expect, it } from "@jest/globals";
import {
  getCitationStatus,
  parseCitation,
  getAllCitationsFromLlmOutput,
} from "../parsing/parseCitation.js";
import { NOT_FOUND_VERIFICATION_INDEX } from "../types/verification.js";
import type { Verification } from "../types/verification.js";
import type { Citation } from "../types/citation.js";

describe("getCitationStatus", () => {
  it("marks verified citations", () => {
    const found: Verification = {
      citation: {
        keySpan: "term",
        fullPhrase: "term",
        fileId: "file",
      },
      pageNumber: 2,
      searchState: { status: "found" },
      matchSnippet: "snippet",
    };
    const status = getCitationStatus(found);
    expect(status.isVerified).toBe(true);
    expect(status.isPending).toBe(false);
  });

  it("marks misses and pending states", () => {
    const miss: Verification = {
      citation: {
        keySpan: "term",
        fullPhrase: "term",
        fileId: "file",
      },
      pageNumber: NOT_FOUND_VERIFICATION_INDEX,
      searchState: { status: "not_found" },
      matchSnippet: "snippet",
    };
    const status = getCitationStatus(miss);
    expect(status.isMiss).toBe(true);
    expect(status.isVerified).toBe(false);

    const pendingStatus = getCitationStatus(undefined);
    expect(pendingStatus.isPending).toBe(true);
  });

  describe("explicit status coverage", () => {
    it("treats found_on_other_page as partial match and verified", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
          pageNumber: 4,
        },
        pageNumber: 5,
        searchState: { status: "found_on_other_page" },
        matchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(true);
      expect(status.isMiss).toBe(false);
      expect(status.isPending).toBe(false);
    });

    it("treats found_on_other_line as partial match and verified", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
          pageNumber: 3,
          lineIds: [1, 2, 3],
        },
        pageNumber: 3,

        searchState: {
          status: "found_on_other_line",
          actualLineIds: [2, 3],
          expectedLineIds: [1, 2, 3],
        },
        matchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(true);
    });

    it("treats first_word_found as partial match and verified", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
          pageNumber: 1,
        },
        pageNumber: 1,
        searchState: { status: "first_word_found" },
        matchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(true);
    });

    it("treats partial_text_found as partial match and verified", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
        },
        pageNumber: 2,
        searchState: { status: "partial_text_found" },
        matchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(true);
    });

    it("treats found_key_span_only as verified but not partial", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
        },
        pageNumber: 2,
        searchState: { status: "found_key_span_only" },
        matchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isVerified).toBe(true);
      expect(status.isPartialMatch).toBe(false);
    });

    it("treats found_phrase_missed_value as verified but not partial", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
        },
        pageNumber: 2,
        searchState: { status: "found_phrase_missed_value" },
        matchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isVerified).toBe(true);
      expect(status.isPartialMatch).toBe(false);
    });

    it("treats loading status as pending", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
        },
        pageNumber: 2,
        searchState: { status: "loading" },
        matchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPending).toBe(true);
      expect(status.isVerified).toBe(false);
    });

    it("treats pending status as pending", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
          pageNumber: 2,
        },
        pageNumber: 2,
        searchState: { status: "pending" },
        matchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPending).toBe(true);
      expect(status.isVerified).toBe(false);
    });

    it("treats not_found as miss but not verified", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
        },
        pageNumber: NOT_FOUND_VERIFICATION_INDEX,
        searchState: { status: "not_found" },
        matchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isMiss).toBe(true);
      expect(status.isVerified).toBe(false);
      expect(status.isPartialMatch).toBe(false);
    });

    it("treats null searchState as pending", () => {
      const verification: Verification = {
        citation: {
          keySpan: "term",
          fullPhrase: "term",
          fileId: "file",
          pageNumber: 2,
        },
        pageNumber: 2,
        searchState: null,
        matchSnippet: "snippet",
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

describe("parseCitation", () => {
  it("parses document citations with optional values", () => {
    const fragment =
      "Before <cite file_id='short' start_page_key='page_number_5_index_0' full_phrase='Hello\\'s world' key_span='world' line_ids='3,1' value='USD 12' /> after";
    const parsed = parseCitation(fragment, "override-attachment");
    const { citation } = parsed;

    expect(parsed.beforeCite).toBe("Before ");
    expect(parsed.afterCite).toBe(" after");
    expect(citation.pageNumber).toBe(5);
    expect(citation.fileId).toBe("override-attachment");
    expect(citation.fullPhrase).toBe("Hello's world");
    expect(citation.keySpan).toBe("world");
    expect(citation.lineIds).toEqual([1, 3]);
  });

  it("parses key_span attribute correctly", () => {
    const fragment =
      "<cite file_id='file123456789012345' start_page_key='page_number_2_index_0' full_phrase='The quick brown fox jumps over the lazy dog' key_span='quick brown fox' line_ids='1,2' />";
    const parsed = parseCitation(fragment);
    const { citation } = parsed;

    expect(citation.fullPhrase).toBe(
      "The quick brown fox jumps over the lazy dog"
    );
    expect(citation.keySpan).toBe("quick brown fox");
  });

  it("parses key_span with special characters", () => {
    const fragment =
      "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='The total is $500 USD' key_span='$500 USD' line_ids='1' />";
    const parsed = parseCitation(fragment);
    const { citation } = parsed;

    expect(citation.fullPhrase).toBe("The total is $500 USD");
    expect(citation.keySpan).toBe("$500 USD");
  });

  it("parses AV citations with timestamps", () => {
    const fragment =
      "<cite file_id='av123' full_phrase='Audio clip' timestamps='00:00:01.000-00:00:03.000' reasoning='Because' />";
    const parsed = parseCitation(fragment);
    const { citation } = parsed;

    expect(citation.fileId).toBe("av123");
    expect(citation.fullPhrase).toBe("Audio clip");
    expect(citation.timestamps).toEqual({
      startTime: "00:00:01.000",
      endTime: "00:00:03.000",
    });
    expect(citation.reasoning).toBe("Because");
  });

  describe("missing cite tag returns", () => {
    it("returns empty beforeCite/afterCite when no cite tag present", () => {
      const fragment = "Just plain text without any citations";
      const parsed = parseCitation(fragment);
      expect(parsed.beforeCite).toBe("");
      expect(parsed.afterCite).toBe("");
      expect(parsed.citation.fullPhrase).toBeUndefined();
    });

    it("handles empty string input", () => {
      const parsed = parseCitation("");
      expect(parsed.beforeCite).toBe("");
      expect(parsed.afterCite).toBe("");
    });

    it("handles malformed cite tag", () => {
      const fragment = "Text with <cite but no closing";
      const parsed = parseCitation(fragment);
    });

    it("handles cite tag without required attributes", () => {
      const fragment = "Text <cite /> more text";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.pageNumber).toBeUndefined();
    });
  });

  describe("attachment id fallback logic", () => {
    it("uses fileId when it is exactly 20 characters", () => {
      // 20-char fileId should be used as attachmentId
      const twentyCharId = "12345678901234567890";
      const fragment = `<cite file_id='${twentyCharId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment, "fallback-attachment");
      expect(parsed.citation.fileId).toBe(twentyCharId);
    });

    it("uses mdAttachmentId when fileId is shorter than 20 characters", () => {
      const shortId = "short123";
      const fragment = `<cite file_id='${shortId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment, "fallback-attachment");
      expect(parsed.citation.fileId).toBe("fallback-attachment");
    });

    it("uses mdAttachmentId when fileId is longer than 20 characters", () => {
      const longId = "this_is_a_very_long_file_id_over_20_chars";
      const fragment = `<cite file_id='${longId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment, "fallback-attachment");
      expect(parsed.citation.fileId).toBe("fallback-attachment");
    });

    it("falls back to original fileId when no mdAttachmentId provided and fileId is not 20 chars", () => {
      const shortId = "short123";
      const fragment = `<cite file_id='${shortId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment);
      expect(parsed.citation.fileId).toBe(shortId);
    });

    it("uses null mdAttachmentId correctly", () => {
      const shortId = "short123";
      const fragment = `<cite file_id='${shortId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment, null);
      expect(parsed.citation.fileId).toBe(shortId);
    });
  });

  describe("AV citation attachment id fallback", () => {
    it("uses 20-char fileId for AV citations", () => {
      const twentyCharId = "12345678901234567890";
      const fragment = `<cite file_id='${twentyCharId}' full_phrase='audio' timestamps='00:00:01-00:00:05' />`;
      const parsed = parseCitation(fragment, "fallback");
      expect(parsed.citation.fileId).toBe(twentyCharId);
    });

    it("uses mdAttachmentId for AV citations with short fileId", () => {
      const fragment = `<cite file_id='short' full_phrase='audio' timestamps='00:00:01-00:00:05' />`;
      const parsed = parseCitation(fragment, "av-fallback");
      expect(parsed.citation.fileId).toBe("av-fallback");
    });
  });

  describe("value vs reasoning precedence", () => {
    it("parses value attribute when present", () => {
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1' value='$100' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.keySpan).toBe("phrase");
      expect(parsed.citation.reasoning).toBeUndefined();
    });

    it("parses reasoning attribute when present", () => {
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1' reasoning='This is because...' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.reasoning).toBe("This is because...");
      expect(parsed.citation.keySpan).toBe("phrase");
    });

    it("parses AV citation with value attribute", () => {
      const fragment =
        "<cite file_id='av12345678901234567' full_phrase='audio' timestamps='00:01-00:02' value='transcript' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.keySpan).toBe("transcript");
      expect(parsed.citation.reasoning).toBeUndefined();
    });

    it("parses AV citation with reasoning attribute", () => {
      const fragment =
        "<cite file_id='av12345678901234567' full_phrase='audio' timestamps='00:01-00:02' reasoning='Speaker said this' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.reasoning).toBe("Speaker said this");
      expect(parsed.citation.keySpan).toBeUndefined();
    });
  });

  describe("citation counter reference", () => {
    it("increments citation counter when provided", () => {
      const counterRef = { current: 1 };
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1' />";

      const parsed1 = parseCitation(fragment, null, counterRef);
      expect(parsed1.citation.citationNumber).toBe(1);
      expect(counterRef.current).toBe(2);

      const parsed2 = parseCitation(fragment, null, counterRef);
      expect(parsed2.citation.citationNumber).toBe(2);
      expect(counterRef.current).toBe(3);
    });

    it("returns undefined citationNumber when no counter provided", () => {
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.citationNumber).toBeUndefined();
    });
  });

  describe("line_ids parsing edge cases", () => {
    it("sorts line_ids in ascending order", () => {
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='5,2,8,1,3' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toEqual([1, 2, 3, 5, 8]);
    });

    it("handles line_ids with invalid values by filtering them", () => {
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1,abc,3,def,5' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toEqual([1, 3, 5]);
    });

    it("returns undefined lineIds when empty", () => {
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toBeUndefined();
    });

    it("handles single line range format like '20-20'", () => {
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='20-20' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toEqual([20]);
    });

    it("handles multi-line range format like '5-10'", () => {
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='5-10' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toEqual([5, 6, 7, 8, 9, 10]);
    });

    it("handles mixed comma and range format like '1,5-7,10'", () => {
      const fragment =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1,5-7,10' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toEqual([1, 5, 6, 7, 10]);
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
      const result = getAllCitationsFromLlmOutput(
        "Just some plain text without any citations"
      );
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

  describe("XML citation extraction from strings", () => {
    it("extracts single XML citation from string", () => {
      const input =
        "Here is text <cite file_id='file123456789012345' start_page_key='page_number_2_index_0' full_phrase='important text' key_span='important' line_ids='1,2' /> more text";
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("important text");
      expect(citation.keySpan).toBe("important");
      expect(citation.pageNumber).toBe(2);
      expect(citation.lineIds).toEqual([1, 2]);
    });

    it("extracts multiple XML citations from string", () => {
      const input = `
        First citation <cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='first phrase' key_span='first' line_ids='1' />
        Second citation <cite file_id='file123456789012345' start_page_key='page_number_3_index_0' full_phrase='second phrase' key_span='second' line_ids='5' />
        Third citation <cite file_id='file123456789012345' start_page_key='page_number_5_index_0' full_phrase='third phrase' key_span='third' line_ids='10' />
      `;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBeGreaterThanOrEqual(3);
      const citations = Object.values(result);
      const phrases = citations.map((c) => c.fullPhrase);
      expect(phrases).toContain("first phrase");
      expect(phrases).toContain("second phrase");
      expect(phrases).toContain("third phrase");
    });

    it("extracts XML citation with value attribute", () => {
      const input =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='price line' key_span='price' line_ids='1' value='$100.00' />";
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("price line");
      expect(citation.keySpan).toBe("price");
    });

    it("extracts AV citation with timestamps", () => {
      const input =
        "<cite file_id='av12345678901234567' full_phrase='audio transcript' timestamps='00:01:30-00:02:45' />";
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("audio transcript");
      expect(citation.timestamps).toEqual({
        startTime: "00:01:30",
        endTime: "00:02:45",
      });
    });
  });

  describe("JSON citation extraction", () => {
    it("extracts citation from single JSON object with fullPhrase", () => {
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
      expect(citation.pageNumber).toBe(3);
      expect(citation.lineIds).toEqual([1, 2, 3]);
    });

    it("extracts citations from array of JSON objects", () => {
      const input: Citation[] = [
        { fullPhrase: "first phrase", fileId: "file1" },
        { fullPhrase: "second phrase", fileId: "file2" },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
      const phrases = Object.values(result).map((c) => c.fullPhrase);
      expect(phrases).toContain("first phrase");
      expect(phrases).toContain("second phrase");
    });

    it("extracts citations from nested citation property", () => {
      const input = {
        response: "Some response",
        citation: {
          fullPhrase: "nested citation",
          fileId: "file123",
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
          { fullPhrase: "citation one", fileId: "f1" },
          { fullPhrase: "citation two", fileId: "f2" },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
      const phrases = Object.values(result).map((c) => c.fullPhrase);
      expect(phrases).toContain("citation one");
      expect(phrases).toContain("citation two");
    });

    it("extracts deeply nested citations", () => {
      const input = {
        level1: {
          level2: {
            level3: {
              citations: [{ fullPhrase: "deep citation", fileId: "deep1" }],
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
        { citation: { fullPhrase: "array item 1", fileId: "f1" } },
        { citation: { fullPhrase: "array item 2", fileId: "f2" } },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
    });
  });

  describe("JSON citation with startPageKey parsing", () => {
    it("parses page number from page_number_X_index_Y format", () => {
      const input: Citation = {
        fullPhrase: "test",
        startPageKey: "page_number_5_index_2",
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.pageNumber).toBe(5);
    });

    it("parses page number from pageKey_X_index_Y format", () => {
      const input: Citation = {
        fullPhrase: "test",
        startPageKey: "pageKey_10_index_0",
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.pageNumber).toBe(10);
    });

    it("handles missing startPageKey gracefully", () => {
      const input: Citation = {
        fullPhrase: "test without page",
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];
      expect(citation.pageNumber).toBeUndefined();
    });

    it("parses page number from n_m format (e.g., '5_4' for page 5, index 4)", () => {
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

  describe("mixed XML and JSON extraction from objects", () => {
    it("extracts both XML embedded in strings and JSON citations", () => {
      const input = {
        markdown:
          "Text with <cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='xml phrase' key_span='xml' line_ids='1' />",
        citations: [{ fullPhrase: "json phrase", fileId: "json1" }],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBeGreaterThanOrEqual(2);
      const phrases = Object.values(result).map((c) => c.fullPhrase);
      expect(phrases).toContain("xml phrase");
      expect(phrases).toContain("json phrase");
    });

    it("handles object with stringified JSON containing XML citations", () => {
      const input = {
        content:
          "Response with <cite file_id='f12345678901234567890' start_page_key='page_number_2_index_0' full_phrase='embedded' key_span='embedded' line_ids='1' />",
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBeGreaterThanOrEqual(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("embedded");
    });
  });

  describe("citation filtering and validation", () => {
    it("skips JSON citations without fullPhrase", () => {
      const input: Citation[] = [
        { fullPhrase: "valid citation", fileId: "f1" },
        { fileId: "f2", lineIds: [1, 2] } as Citation, // missing fullPhrase
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].fullPhrase).toBe("valid citation");
    });

    it("skips null items in citation array", () => {
      const input = [
        { fullPhrase: "valid", fileId: "f1" },
        null,
        { fullPhrase: "also valid", fileId: "f2" },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe("citation key generation", () => {
    it("generates unique keys for different citations", () => {
      const input: Citation[] = [
        { fullPhrase: "phrase one", fileId: "f1", pageNumber: 1 },
        { fullPhrase: "phrase two", fileId: "f2", pageNumber: 2 },
      ];
      const result = getAllCitationsFromLlmOutput(input);
      const keys = Object.keys(result);

      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toBe(keys[1]);
    });

    it("generates same key for identical citations", () => {
      const citation1: Citation = { fullPhrase: "same phrase", fileId: "same" };
      const citation2: Citation = { fullPhrase: "same phrase", fileId: "same" };

      const result1 = getAllCitationsFromLlmOutput(citation1);
      const result2 = getAllCitationsFromLlmOutput(citation2);

      const key1 = Object.keys(result1)[0];
      const key2 = Object.keys(result2)[0];

      expect(key1).toBe(key2);
    });

    it("generates 16-character citation keys", () => {
      const input: Citation = { fullPhrase: "test", fileId: "f1" };
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
        fileId: "f1",
        keySpan: "$500",
        reasoning: "This is the reasoning",
      };
      const result = getAllCitationsFromLlmOutput(input);
      const citation = Object.values(result)[0];

      expect(citation.keySpan).toBe("$500");
      expect(citation.reasoning).toBe("This is the reasoning");
    });

    it("handles malformed XML in stringified objects", () => {
      const input = {
        content: "Text with <cite but no closing tag and incomplete",
      };
      const result = getAllCitationsFromLlmOutput(input);
      // Should not throw and return empty or partial result
      expect(result).toBeDefined();
    });
  });

  describe("isJsonCitationFormat detection", () => {
    it("detects object with fullPhrase as citation format", () => {
      const input = { fullPhrase: "test" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("detects object with startPageKey as citation format", () => {
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
      const input = [
        { notACitation: true },
        { fullPhrase: "this is a citation" },
      ];
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it("rejects array with no citation-like objects", () => {
      const input = [{ foo: "bar" }, { baz: 123 }];
      const result = getAllCitationsFromLlmOutput(input);
      expect(result).toEqual({});
    });
  });

  describe("snake_case JSON citation support", () => {
    it("detects object with full_phrase (snake_case) as citation format", () => {
      const input = { full_phrase: "test snake case" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].fullPhrase).toBe("test snake case");
    });

    it("detects object with start_page_key (snake_case) as citation format", () => {
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

    it("detects object with file_id (snake_case)", () => {
      const input = { file_id: "my_file_123", full_phrase: "test" };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].fileId).toBe("my_file_123");
    });

    it("parses full snake_case citation object", () => {
      const input = {
        file_id: "doc123",
        full_phrase: "The quick brown fox",
        start_page_key: "page_number_7_index_2",
        line_ids: [10, 5, 15],
        keySpan: "$100.00",
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fileId).toBe("doc123");
      expect(citation.fullPhrase).toBe("The quick brown fox");
      expect(citation.pageNumber).toBe(7);
      expect(citation.lineIds).toEqual([5, 10, 15]);
      expect(citation.keySpan).toBe("$100.00");
    });

    it("parses array of snake_case citations", () => {
      const input = [
        { full_phrase: "first citation", file_id: "f1" },
        { full_phrase: "second citation", file_id: "f2" },
      ];
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(2);
      const phrases = Object.values(result).map((c) => c.fullPhrase);
      expect(phrases).toContain("first citation");
      expect(phrases).toContain("second citation");
    });

    it("extracts snake_case citations from nested citations property", () => {
      const input = {
        response: "Some text",
        citations: [
          { full_phrase: "nested snake", file_id: "n1", line_ids: [1, 2] },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("nested snake");
      expect(citation.lineIds).toEqual([1, 2]);
    });

    it("handles mixed camelCase and snake_case in same object", () => {
      const input = {
        fullPhrase: "mixed case test",
        file_id: "mixed123",
        start_page_key: "page_number_2_index_0",
        lineIds: [3, 1, 2],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("mixed case test");
      expect(citation.fileId).toBe("mixed123");
      expect(citation.pageNumber).toBe(2);
      expect(citation.lineIds).toEqual([1, 2, 3]);
    });

    it("prefers camelCase over snake_case when both present", () => {
      const input = {
        fullPhrase: "camelCase wins",
        full_phrase: "snake_case loses",
        fileId: "camelId",
        file_id: "snakeId",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("camelCase wins");
      expect(citation.fileId).toBe("camelId");
    });
  });

  describe("keySpan JSON citation support", () => {
    it("parses keySpan from camelCase JSON citation", () => {
      const input = {
        fullPhrase: "The quick brown fox jumps over the lazy dog",
        keySpan: "quick brown fox",
        fileId: "file123",
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe(
        "The quick brown fox jumps over the lazy dog"
      );
      expect(citation.keySpan).toBe("quick brown fox");
    });

    it("parses key_span from snake_case JSON citation", () => {
      const input = {
        full_phrase: "The quick brown fox jumps over the lazy dog",
        key_span: "quick brown fox",
        file_id: "file123",
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe(
        "The quick brown fox jumps over the lazy dog"
      );
      expect(citation.keySpan).toBe("quick brown fox");
    });

    it("prefers camelCase keySpan over snake_case key_span", () => {
      const input = {
        fullPhrase: "test phrase",
        keySpan: "camelCase span",
        key_span: "snake_case span",
      };
      const result = getAllCitationsFromLlmOutput(input);

      const citation = Object.values(result)[0];
      expect(citation.keySpan).toBe("camelCase span");
    });

    it("detects object with keySpan as citation format", () => {
      const input = {
        keySpan: "key words",
        fullPhrase: "full sentence with key words",
      };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].keySpan).toBe("key words");
    });

    it("detects object with key_span as citation format", () => {
      const input = {
        key_span: "key words",
        full_phrase: "full sentence with key words",
      };
      const result = getAllCitationsFromLlmOutput(input);
      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0].keySpan).toBe("key words");
    });

    it("parses full citation with keySpan from nested citations property", () => {
      const input = {
        response: "Some response",
        citations: [
          {
            fullPhrase: "The total amount is $500.00",
            keySpan: "$500.00",
            fileId: "doc1",
            startPageKey: "page_number_5_index_0",
            lineIds: [10, 11, 12],
          },
        ],
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The total amount is $500.00");
      expect(citation.keySpan).toBe("$500.00");
      expect(citation.pageNumber).toBe(5);
      expect(citation.lineIds).toEqual([10, 11, 12]);
    });
  });

  describe("citation numbering in JSON extraction", () => {
    it("assigns sequential citation numbers", () => {
      const input: Citation[] = [
        { fullPhrase: "first", fileId: "f1" },
        { fullPhrase: "second", fileId: "f2" },
        { fullPhrase: "third", fileId: "f3" },
      ];
      const result = getAllCitationsFromLlmOutput(input);
      const citations = Object.values(result);

      const numbers = citations
        .map((c) => c.citationNumber)
        .sort((a, b) => (a || 0) - (b || 0));
      expect(numbers).toEqual([1, 2, 3]);
    });
  });
});
