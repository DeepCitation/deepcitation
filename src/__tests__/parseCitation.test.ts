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
        anchorText: "term",
        fullPhrase: "term",
        attachmentId: "file",
      },
      verifiedPageNumber: 2,
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
      verifiedPageNumber: NOT_FOUND_VERIFICATION_INDEX,
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
    it("treats found_on_other_page as partial match but not verified", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
          pageNumber: 4,
        },
        verifiedPageNumber: 5,
        status: "found_on_other_page",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(false);
      expect(status.isMiss).toBe(false);
      expect(status.isPending).toBe(false);
    });

    it("treats found_on_other_line as partial match but not verified", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
          pageNumber: 3,
          lineIds: [1, 2, 3],
        },
        verifiedPageNumber: 3,
        status: "found_on_other_line",
        verifiedLineIds: [2, 3],
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(false);
    });

    it("treats first_word_found as partial match but not verified", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
          pageNumber: 1,
        },
        verifiedPageNumber: 1,
        status: "first_word_found",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(false);
    });

    it("treats partial_text_found as partial match but not verified", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
        },
        verifiedPageNumber: 2,
        status: "partial_text_found",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isPartialMatch).toBe(true);
      expect(status.isVerified).toBe(false);
    });

    it("treats found_anchor_text_only as verified but not partial", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
        },
        verifiedPageNumber: 2,
        status: "found_anchor_text_only",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isVerified).toBe(true);
      expect(status.isPartialMatch).toBe(false);
    });

    it("treats found_phrase_missed_value as verified but not partial", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
        },
        verifiedPageNumber: 2,
        status: "found_phrase_missed_value",
        verifiedMatchSnippet: "snippet",
      };
      const status = getCitationStatus(verification);
      expect(status.isVerified).toBe(true);
      expect(status.isPartialMatch).toBe(false);
    });

    it("treats loading status as pending", () => {
      const verification: Verification = {
        citation: {
          anchorText: "term",
          fullPhrase: "term",
          attachmentId: "file",
        },
        verifiedPageNumber: 2,
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
        verifiedPageNumber: 2,
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
        verifiedPageNumber: NOT_FOUND_VERIFICATION_INDEX,
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
        verifiedPageNumber: 2,
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

describe("parseCitation", () => {
  // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.
  // The parser accepts both old and new names but outputs the new names (anchorText, startPageId).

  it("parses document citations with optional values (backward compat: key_span -> anchorText)", () => {
    // Input uses old naming: key_span, start_page_key
    const fragment =
      "Before <cite attachment_id='short' start_page_key='page_number_5_index_0' full_phrase='Hello\\'s world' key_span='world' line_ids='3,1' value='USD 12' /> after";
    const parsed = parseCitation(fragment, "override-attachment");
    const { citation } = parsed;

    expect(parsed.beforeCite).toBe("Before ");
    expect(parsed.afterCite).toBe(" after");
    expect(citation.pageNumber).toBe(5);
    expect(citation.attachmentId).toBe("override-attachment");
    expect(citation.fullPhrase).toBe("Hello's world");
    // Output uses new naming: anchorText
    expect(citation.anchorText).toBe("world");
    expect(citation.lineIds).toEqual([1, 3]);
  });

  it("parses anchor_text attribute correctly (backward compat: key_span)", () => {
    // Input uses old naming: key_span
    const fragment =
      "<cite attachment_id='file123456789012345' start_page_key='page_number_2_index_0' full_phrase='The quick brown fox jumps over the lazy dog' key_span='quick brown fox' line_ids='1,2' />";
    const parsed = parseCitation(fragment);
    const { citation } = parsed;

    expect(citation.fullPhrase).toBe(
      "The quick brown fox jumps over the lazy dog"
    );
    // Output uses new naming: anchorText
    expect(citation.anchorText).toBe("quick brown fox");
  });

  it("parses anchor_text with special characters (backward compat: key_span)", () => {
    // Input uses old naming: key_span
    const fragment =
      "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='The total is $500 USD' key_span='$500 USD' line_ids='1' />";
    const parsed = parseCitation(fragment);
    const { citation } = parsed;

    expect(citation.fullPhrase).toBe("The total is $500 USD");
    // Output uses new naming: anchorText
    expect(citation.anchorText).toBe("$500 USD");
  });

  it("parses AV citations with timestamps", () => {
    const fragment =
      "<cite attachment_id='av123' full_phrase='Audio clip' timestamps='00:00:01.000-00:00:03.000' reasoning='Because' />";
    const parsed = parseCitation(fragment);
    const { citation } = parsed;

    expect(citation.attachmentId).toBe("av123");
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
    it("uses attachmentId when it is exactly 20 characters", () => {
      // 20-char attachmentId should be used as attachmentId
      const twentyCharId = "12345678901234567890";
      const fragment = `<cite attachment_id='${twentyCharId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment, "fallback-attachment");
      expect(parsed.citation.attachmentId).toBe(twentyCharId);
    });

    it("uses mdAttachmentId when attachmentId is shorter than 20 characters", () => {
      const shortId = "short123";
      const fragment = `<cite attachment_id='${shortId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment, "fallback-attachment");
      expect(parsed.citation.attachmentId).toBe("fallback-attachment");
    });

    it("uses mdAttachmentId when attachmentId is longer than 20 characters", () => {
      const longId = "this_is_a_very_long_attachment_id_over_20_chars";
      const fragment = `<cite attachment_id='${longId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment, "fallback-attachment");
      expect(parsed.citation.attachmentId).toBe("fallback-attachment");
    });

    it("falls back to original fileId when no mdAttachmentId provided and attachmentId is not 20 chars", () => {
      const shortId = "short123";
      const fragment = `<cite attachment_id='${shortId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment);
      expect(parsed.citation.attachmentId).toBe(shortId);
    });

    it("uses null mdAttachmentId correctly", () => {
      const shortId = "short123";
      const fragment = `<cite attachment_id='${shortId}' start_page_key='page_number_1_index_0' full_phrase='test' key_span='test' line_ids='1' />`;
      const parsed = parseCitation(fragment, null);
      expect(parsed.citation.attachmentId).toBe(shortId);
    });
  });

  describe("AV citation attachment id fallback", () => {
    it("uses 20-char attachmentId for AV citations", () => {
      const twentyCharId = "12345678901234567890";
      const fragment = `<cite attachment_id='${twentyCharId}' full_phrase='audio' timestamps='00:00:01-00:00:05' />`;
      const parsed = parseCitation(fragment, "fallback");
      expect(parsed.citation.attachmentId).toBe(twentyCharId);
    });

    it("uses mdAttachmentId for AV citations with short attachmentId", () => {
      const fragment = `<cite attachment_id='short' full_phrase='audio' timestamps='00:00:01-00:00:05' />`;
      const parsed = parseCitation(fragment, "av-fallback");
      expect(parsed.citation.attachmentId).toBe("av-fallback");
    });
  });

  describe("value vs reasoning precedence", () => {
    it("parses value attribute when present (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1' value='$100' />";
      const parsed = parseCitation(fragment);
      // Output uses new naming: anchorText
      expect(parsed.citation.anchorText).toBe("phrase");
      expect(parsed.citation.reasoning).toBeUndefined();
    });

    it("parses reasoning attribute when present (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1' reasoning='This is because...' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.reasoning).toBe("This is because...");
      // Output uses new naming: anchorText
      expect(parsed.citation.anchorText).toBe("phrase");
    });

    it("parses AV citation with value attribute", () => {
      const fragment =
        "<cite attachment_id='av12345678901234567' full_phrase='audio' timestamps='00:01-00:02' value='transcript' />";
      const parsed = parseCitation(fragment);
      // Output uses new naming: anchorText
      expect(parsed.citation.anchorText).toBe("transcript");
      expect(parsed.citation.reasoning).toBeUndefined();
    });

    it("parses AV citation with reasoning attribute", () => {
      const fragment =
        "<cite attachment_id='av12345678901234567' full_phrase='audio' timestamps='00:01-00:02' reasoning='Speaker said this' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.reasoning).toBe("Speaker said this");
      expect(parsed.citation.anchorText).toBeUndefined();
    });
  });

  describe("citation counter reference", () => {
    it("increments citation counter when provided", () => {
      const counterRef = { current: 1 };
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1' />";

      const parsed1 = parseCitation(fragment, null, counterRef);
      expect(parsed1.citation.citationNumber).toBe(1);
      expect(counterRef.current).toBe(2);

      const parsed2 = parseCitation(fragment, null, counterRef);
      expect(parsed2.citation.citationNumber).toBe(2);
      expect(counterRef.current).toBe(3);
    });

    it("returns undefined citationNumber when no counter provided", () => {
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.citationNumber).toBeUndefined();
    });
  });

  describe("line_ids parsing edge cases", () => {
    it("sorts line_ids in ascending order", () => {
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='5,2,8,1,3' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toEqual([1, 2, 3, 5, 8]);
    });

    it("handles line_ids with invalid values by filtering them", () => {
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1,abc,3,def,5' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toEqual([1, 3, 5]);
    });

    it("returns undefined lineIds when empty", () => {
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toBeUndefined();
    });

    it("handles single line range format like '20-20'", () => {
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='20-20' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toEqual([20]);
    });

    it("handles multi-line range format like '5-10'", () => {
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='5-10' />";
      const parsed = parseCitation(fragment);
      expect(parsed.citation.lineIds).toEqual([5, 6, 7, 8, 9, 10]);
    });

    it("handles mixed comma and range format like '1,5-7,10'", () => {
      const fragment =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='phrase' key_span='phrase' line_ids='1,5-7,10' />";
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
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.
    // The parser accepts both old and new names but outputs the new names (anchorText, startPageId).

    it("extracts single XML citation from string (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input =
        "Here is text <cite attachment_id='file123456789012345' start_page_key='page_number_2_index_0' full_phrase='important text' key_span='important' line_ids='1,2' /> more text";
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("important text");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("important");
      expect(citation.pageNumber).toBe(2);
      expect(citation.lineIds).toEqual([1, 2]);
    });

    it("extracts multiple XML citations from string (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `
        First citation <cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='first phrase' key_span='first' line_ids='1' />
        Second citation <cite attachment_id='file123456789012345' start_page_key='page_number_3_index_0' full_phrase='second phrase' key_span='second' line_ids='5' />
        Third citation <cite attachment_id='file123456789012345' start_page_key='page_number_5_index_0' full_phrase='third phrase' key_span='third' line_ids='10' />
      `;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBeGreaterThanOrEqual(3);
      const citations = Object.values(result);
      const phrases = citations.map((c) => c.fullPhrase);
      expect(phrases).toContain("first phrase");
      expect(phrases).toContain("second phrase");
      expect(phrases).toContain("third phrase");
    });

    it("extracts XML citation with value attribute (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span
      const input =
        "<cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='price line' key_span='price' line_ids='1' value='$100.00' />";
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("price line");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("price");
    });

    it("extracts AV citation with timestamps", () => {
      const input =
        "<cite attachment_id='av12345678901234567' full_phrase='audio transcript' timestamps='00:01:30-00:02:45' />";
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
      const phrases = Object.values(result).map((c) => c.fullPhrase);
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
      const phrases = Object.values(result).map((c) => c.fullPhrase);
      expect(phrases).toContain("citation one");
      expect(phrases).toContain("citation two");
    });

    it("extracts deeply nested citations", () => {
      const input = {
        level1: {
          level2: {
            level3: {
              citations: [
                { fullPhrase: "deep citation", attachmentId: "deep1" },
              ],
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

  describe("mixed XML and JSON extraction from objects", () => {
    it("extracts both XML embedded in strings and JSON citations", () => {
      const input = {
        markdown:
          "Text with <cite attachment_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='xml phrase' key_span='xml' line_ids='1' />",
        citations: [{ fullPhrase: "json phrase", attachmentId: "json1" }],
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
          "Response with <cite attachment_id='f12345678901234567890' start_page_key='page_number_2_index_0' full_phrase='embedded' key_span='embedded' line_ids='1' />",
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
      const phrases = Object.values(result).map((c) => c.fullPhrase);
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
      expect(citation.fullPhrase).toBe(
        "The quick brown fox jumps over the lazy dog"
      );
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
      expect(citation.fullPhrase).toBe(
        "The quick brown fox jumps over the lazy dog"
      );
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

      const numbers = citations
        .map((c) => c.citationNumber)
        .sort((a, b) => (a || 0) - (b || 0));
      expect(numbers).toEqual([1, 2, 3]);
    });
  });

  describe("escaped underscores in attribute names (Markdown artifact) - backward compat: key_span -> anchorText", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.
    // The parser accepts old names but outputs new names (anchorText, startPageId).

    it("extracts citations with backslash-escaped underscores from Markdown output (backward compat)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `The key findings in this report are:
* **Positive for 5 Pathogenic Bacteria**: The report indicates the presence<cite attachment\\_id='D8bv8mItwv6VOmIBo2nr' reasoning='states that the report shows 5 bacteria' full\\_phrase='Result: POSITIVE - 5 PATHOGENIC BACTERIA REPORTED ABOVE THRESHOLD' key\\_span='5 PATHOGENIC BACTERIA' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='7-8' />.`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.attachmentId).toBe("D8bv8mItwv6VOmIBo2nr");
      expect(citation.fullPhrase).toBe(
        "Result: POSITIVE - 5 PATHOGENIC BACTERIA REPORTED ABOVE THRESHOLD"
      );
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("5 PATHOGENIC BACTERIA");
      expect(citation.pageNumber).toBe(1);
      expect(citation.lineIds).toEqual([7, 8]);
    });

    it("extracts multiple citations with escaped underscores (backward compat)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `First finding<cite attachment\\_id='file1' full\\_phrase='first phrase' key\\_span='first' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='1-2' /> and second<cite attachment\\_id='file2' full\\_phrase='second phrase' key\\_span='second' start\\_page\\_key='page\\_number\\_2\\_index\\_0' line\\_ids='5' />.`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBeGreaterThanOrEqual(2);
      const citations = Object.values(result);
      const phrases = citations.map((c) => c.fullPhrase);
      expect(phrases).toContain("first phrase");
      expect(phrases).toContain("second phrase");
    });
  });

  describe("backwards compatibility with fileId/file_id", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("extracts XML citation with fileId attribute (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input =
        "Here is text <cite fileId='file123456789012345' start_page_key='page_number_2_index_0' full_phrase='important text' key_span='important' line_ids='1,2' /> more text";
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("important text");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("important");
      expect(citation.pageNumber).toBe(2);
    });

    it("extracts XML citation with file_id attribute (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input =
        "<cite file_id='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='test phrase' key_span='test' line_ids='5' />";
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("test phrase");
      expect(citation.pageNumber).toBe(1);
    });

    it("extracts AV citation with fileId attribute", () => {
      const input =
        "<cite fileId='av12345678901234567' full_phrase='audio transcript' timestamps='00:01:30-00:02:45' />";
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("audio transcript");
      expect(citation.timestamps).toEqual({
        startTime: "00:01:30",
        endTime: "00:02:45",
      });
    });

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

    it("handles mixed fileId and attachmentId in same response (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `
        <cite fileId='file123456789012345' start_page_key='page_number_1_index_0' full_phrase='first phrase' key_span='first' line_ids='1' />
        <cite attachment_id='att1234567890123456' start_page_key='page_number_2_index_0' full_phrase='second phrase' key_span='second' line_ids='2' />
      `;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
      const phrases = Object.values(result).map((c) => c.fullPhrase);
      expect(phrases).toContain("first phrase");
      expect(phrases).toContain("second phrase");
    });
  });

  describe("complex legal document citations with escaped quotes and newlines (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.
    // The parser accepts old names but outputs new names (anchorText, startPageId).

    it("parses citation with escaped double quotes inside double-quoted attributes", () => {
      // Real-world example: legal document with quoted terms
      // Input uses old naming: key_span, start_page_key
      const input = String.raw`<cite attachment_id="kYtgMlok4yauewjI730z" reasoning="The document states it is made by 'The Exchange Inc. (the \"Declarant\")'" full_phrase="THIS DECLARATION (the \"Declaration\") is made BY: The Exchange Inc. (the \"Declarant\")" key_span="The Exchange Inc." start_page_key="page_number_2_index_1" line_ids="5, 43-47" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.attachmentId).toBe("kYtgMlok4yauewjI730z");
      // Escaped quotes should be unescaped in the final output
      expect(citation.fullPhrase).toBe(
        'THIS DECLARATION (the "Declaration") is made BY: The Exchange Inc. (the "Declarant")'
      );
      expect(citation.reasoning).toBe(
        "The document states it is made by 'The Exchange Inc. (the \"Declarant\")'"
      );
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("The Exchange Inc.");
      expect(citation.pageNumber).toBe(2);
      expect(citation.lineIds).toEqual([5, 43, 44, 45, 46, 47]);
    });

    it("parses citation with literal newlines (\\n) in full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = String.raw`<cite attachment_id="abc123" full_phrase="Line 1\nLine 2\nLine 3" key_span="Line 2" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      // Newlines should be normalized to spaces
      expect(citation.fullPhrase).toBe("Line 1 Line 2 Line 3");
    });

    it("parses citation with real newlines in full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="abc123" full_phrase="Line 1
Line 2
Line 3" key_span="Line 2" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      // Real newlines should be normalized to spaces
      expect(citation.fullPhrase).toBe("Line 1 Line 2 Line 3");
    });

    it("parses the full complex legal document example from user (backward compat: key_span -> anchorText)", () => {
      // This is the exact problematic citation from the user
      // Input uses old naming: key_span, start_page_key
      const input = String.raw`This document is between The Exchange Inc. (the "Declarant") and the future owners, tenants, and residents of the units. <cite attachment\_id="kYtgMlok4yauewjI730z" reasoning="The document explicitly states it is made by 'The Exchange Inc. (the \"Declarant\")' and that 'All present and future owners, tenants, and residents of units... shall be subject to and shall comply with the provisions of this Declaration'." full\_phrase="THIS DECLARATION (the \"Declaration\") is made and executed pursuant to the\nprovisions of the Condominium Act, 1998 and applicable Regulations (the \"Act\"), BY:\nThe Exchange Inc.\n(the \"Declarant\")\n... All present and future owners, tenants, and residents of units, their families,\nguests, invitees, agents, employees and licensees shall be subject to and shall\ncomply with the provisions of this Declaration, the By-laws and Rules of the\nCorporation." key\_span="The Exchange Inc." start\_page\_key="page\_number\_2\_index\_1" line\_ids="5, 43-47" />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.attachmentId).toBe("kYtgMlok4yauewjI730z");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("The Exchange Inc.");
      expect(citation.pageNumber).toBe(2);
      expect(citation.lineIds).toEqual([5, 43, 44, 45, 46, 47]);
      // The fullPhrase should have quotes unescaped and newlines normalized
      expect(citation.fullPhrase).toContain("THIS DECLARATION");
      expect(citation.fullPhrase).toContain('"Declaration"');
      expect(citation.fullPhrase).not.toContain('\\"');
      expect(citation.fullPhrase).not.toContain("\\n");
    });

    it("parses citation with mixed single and double quotes in reasoning (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" reasoning="The user said 'hello' and then \\"goodbye\\"" full_phrase="Some phrase here" key_span="phrase" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.reasoning).toContain("hello");
      expect(citation.reasoning).toContain("goodbye");
      // Both types of quotes should be properly unescaped
      expect(citation.reasoning).not.toContain('\\"');
    });

    it("handles unescaped double quotes inside double-quoted attribute gracefully (backward compat: key_span)", () => {
      // LLMs sometimes output malformed XML - we should handle it gracefully
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="abc123" full_phrase="He said "hello" to me" key_span="hello" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("hello");
    });

    it("handles unescaped single quotes inside single-quoted attribute gracefully (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id='abc123' full_phrase='He said 'hello' to me' key_span='hello' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("hello");
    });

    it("handles nested quotes with proper escaping (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="abc123" full_phrase="The 'quoted' text" key_span="quoted" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The 'quoted' text");
    });
  });

  describe("HTML entity handling in citations (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("decodes HTML entities in full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="Price is &lt;$100 &amp; &gt;$50" key_span="$100" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("Price is <$100 & >$50");
    });

    it("decodes &quot; and &apos; entities (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="He said &quot;hello&quot; and &apos;goodbye&apos;" key_span="hello" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("He said \"hello\" and 'goodbye'");
    });
  });

  describe("markdown formatting artifacts in citations (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("removes markdown bold markers from full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="This is **bold** and __also bold__" key_span="bold" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).not.toContain("**");
      expect(citation.fullPhrase).not.toContain("__");
    });

    it("removes markdown italic markers from full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="This is *italic* text" key_span="italic" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).not.toContain("*");
    });
  });

  describe("attribute order independence (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("parses citation with attributes in non-standard order (backward compat: key_span -> anchorText)", () => {
      // Put attributes in unexpected order
      // Input uses old naming: key_span, start_page_key
      const input = `<cite line_ids="1,2,3" key_span="test" full_phrase="test phrase" start_page_key="page_number_5_index_0" attachment_id="file123456789012345" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("test phrase");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("test");
      expect(citation.pageNumber).toBe(5);
      expect(citation.lineIds).toEqual([1, 2, 3]);
      expect(citation.attachmentId).toBe("file123456789012345");
    });

    it("parses citation with reasoning attribute before full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="file123" reasoning="This is the reason" full_phrase="The actual phrase" key_span="phrase" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.reasoning).toBe("This is the reason");
      expect(citation.fullPhrase).toBe("The actual phrase");
    });
  });

  describe("edge cases with special characters (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("handles dollar signs in full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="The total is $1,234.56 USD" key_span="$1,234.56" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The total is $1,234.56 USD");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("$1,234.56");
    });

    it("handles percentage signs in full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="Growth was 15.5% YoY" key_span="15.5%" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("Growth was 15.5% YoY");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("15.5%");
    });

    it("handles parentheses in full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="The company (NYSE: ABC) reported earnings" key_span="(NYSE: ABC)" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("The company (NYSE: ABC) reported earnings");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("(NYSE: ABC)");
    });

    it("handles colons in full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="Section 4.2: Definitions and Terms" key_span="Section 4.2" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("Section 4.2: Definitions and Terms");
    });

    it("handles brackets in full_phrase (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="See [Appendix A] for details" key_span="[Appendix A]" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("See [Appendix A] for details");
    });
  });

  describe("whitespace handling (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("preserves meaningful whitespace in full_phrase (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="First sentence.  Second sentence." key_span="Second" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      // At minimum, the content should be preserved
      expect(citation.fullPhrase).toContain("First sentence");
      expect(citation.fullPhrase).toContain("Second sentence");
    });

    it("handles leading/trailing whitespace in attribute values (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="  trimmed phrase  " key_span="trimmed" start_page_key="page_number_1_index_0" line_ids="1" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("trimmed phrase");
    });
  });

  describe("line_ids with spaces after commas (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("parses line_ids with spaces after commas (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="test" key_span="test" start_page_key="page_number_1_index_0" line_ids="5, 43-47" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toEqual([5, 43, 44, 45, 46, 47]);
    });

    it("parses line_ids with inconsistent spacing (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="test" key_span="test" start_page_key="page_number_1_index_0" line_ids="1,  2, 3  , 4" />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toEqual([1, 2, 3, 4]);
    });
  });

  describe("malformed LLM output handling (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("handles missing < before cite tag (backward compat: key_span -> anchorText)", () => {
      // LLMs sometimes output 'cite' without the leading '<'
      // Input uses old naming: key_span, start_page_key
      const input = `- H&H: 7.5 / 25cite attachment_id='GTIkofJX4mpSVSwXzvTr' reasoning='shows values' full_phrase='H&H 7.5 25' key_span='7.5 25' start_page_key='page_number_1_index_0' line_ids='110-115' />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.attachmentId).toBe("GTIkofJX4mpSVSwXzvTr");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("7.5 25");
      expect(citation.lineIds).toEqual([110, 111, 112, 113, 114, 115]);
    });

    it("handles multiple citations with some missing < characters (backward compat: key_span)", () => {
      // Real-world scenario: some citations have <, some don't
      // Note: cite must be preceded by non-letter to avoid matching words like "excite"
      // Input uses old naming: key_span, start_page_key
      const input = `- Sodium: 138<cite attachment_id='test1' full_phrase='Na+ 138' key_span='138' start_page_key='page_number_1_index_0' line_ids='95' />
- H&H: 7.5 / 25cite attachment_id='test2' full_phrase='H&H 7.5' key_span='7.5' start_page_key='page_number_1_index_0' line_ids='110' />
- Device: IABP (in place)cite attachment_id='test3' full_phrase='IABP' key_span='IABP' start_page_key='page_number_1_index_0' line_ids='90' />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(3);
      const citations = Object.values(result);
      const attachmentIds = citations.map((c) => c.attachmentId);
      expect(attachmentIds).toContain("test1");
      expect(attachmentIds).toContain("test2");
      expect(attachmentIds).toContain("test3");
    });

    it("handles cite tag with missing < but has space before it (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `Some text cite attachment_id='test' full_phrase='phrase' key_span='span' start_page_key='page_number_1_index_0' line_ids='1' />`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
    });

    it("does not match 'cite' as part of other words", () => {
      // Words like "excite", "recite" should not be converted to citations
      const input = `I was excited to recite the poem. No citations here.`;
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe("non-self-closing citation tags with content (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("extracts citations from non-self-closing tags with content inside (backward compat: key_span -> anchorText)", () => {
      // This is the exact format from the user's failing scenario
      // The LLM outputs <cite ...>content</cite> instead of self-closing <cite ... />
      // Input uses old naming: key_span, start_page_key
      const input = `Patient Information:

<cite attachment\\_id='r7OKl2cBoeJVi2ttZ5pn' reasoning='Patient demographics at top of document' full\\_phrase='John Doe 50/M' key\\_span='John Doe' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='1-5'>

- Name: John Doe
- Age: 50 years old
- Gender: Male
- Allergies: NKDA (No Known Drug Allergies)</cite>

Medical History:

<cite attachment\\_id='r7OKl2cBoeJVi2ttZ5pn' reasoning='Lists patient\\'s medical conditions' full\\_phrase='HTN, CAD, HFEF, Hypothyroid, HLD, (R) Sided PICC on home milrinone, chronic back pain' key\\_span='HTN, CAD, HFEF' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='20-25'>

- Hypertension (HTN)
- Coronary Artery Disease (CAD)
- Heart Failure with Reduced Ejection Fraction (HFEF)
- Hypothyroidism
- High Lipid Disorder (HLD)
- Chronic back pain
- On home milrinone therapy
- Right-sided PICC line</cite>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBeGreaterThanOrEqual(2);
      const citations = Object.values(result);
      // Output uses new naming: anchorText
      const anchorTexts = citations.map((c) => c.anchorText);
      expect(anchorTexts).toContain("John Doe");
      expect(anchorTexts).toContain("HTN, CAD, HFEF");
    });

    it("extracts all 6 citations from medical document summary", () => {
      // Full example from user's failing scenario
      const input = `I'll provide a summary of the key information from this medical document:

Patient Information:

<cite attachment\\_id='r7OKl2cBoeJVi2ttZ5pn' reasoning='Patient demographics at top of document' full\\_phrase='John Doe 50/M' key\\_span='John Doe' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='1-5'>

- Name: John Doe
- Age: 50 years old
- Gender: Male
- Allergies: NKDA (No Known Drug Allergies)</cite>

Medical History:

<cite attachment\\_id='r7OKl2cBoeJVi2ttZ5pn' reasoning='Lists patient\\'s medical conditions' full\\_phrase='HTN, CAD, HFEF, Hypothyroid, HLD, (R) Sided PICC on home milrinone, chronic back pain' key\\_span='HTN, CAD, HFEF' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='20-25'>

- Hypertension (HTN)
- Coronary Artery Disease (CAD)
- Heart Failure with Reduced Ejection Fraction (HFEF)
- Hypothyroidism
- High Lipid Disorder (HLD)
- Chronic back pain
- On home milrinone therapy
- Right-sided PICC line</cite>

Hospital Course:

<cite attachment\\_id='r7OKl2cBoeJVi2ttZ5pn' reasoning='Tracks patient\\'s admission and transfer' full\\_phrase='5/15-worsening soB at home

5/17-admitted at outside hospital; cardiac cath Showing 1 pulm HTN, low Cl, low SVO2

5/18-transferred to CVICU IABP placed and placed on transplant list

5/19-dobutamine started' key\\_span='worsening soB admitted transferred' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='10-19'>

- 5/15: Worsening shortness of breath at home
- 5/17: Admitted to outside hospital
- Cardiac catheterization showed:
- Pulmonary Hypertension
- Low Cardiac Index
- Low Mixed Venous Oxygen Saturation
- 5/18: Transferred to Cardiovascular Intensive Care Unit (CVICU)
- Intra-Aortic Balloon Pump (IABP) placed
- Added to transplant list
- 5/19: Dobutamine therapy initiated</cite>

Current Status:

<cite attachment\\_id='r7OKl2cBoeJVi2ttZ5pn' reasoning='Summary of patient\\'s current condition' full\\_phrase='AxOx4 afebrile' key\\_span='AxOx4 afebrile' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='30-40'>

- Alert and Oriented × 4
- Afebrile
- Pain managed with Tylenol PRN</cite>

Medications:

<cite attachment\\_id='r7OKl2cBoeJVi2ttZ5pn' reasoning='Lists current IV medication infusions' full\\_phrase='Gtts: Heparin 12 uhr, Bumex 5mg/hr, Dobutamine 2.5mcg/kg, Milrinone 0.25mg/kg, Nicardipine 2.5mg/hr' key\\_span='Heparin Bumex Dobutamine' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='25-40'>

- Heparin
- Bumex
- Dobutamine
- Milrinone
- Nicardipine</cite>

Family:

<cite attachment\\_id='r7OKl2cBoeJVi2ttZ5pn' reasoning='Patient\\'s family information' full\\_phrase='July-wife Pon Chris-Son' key\\_span='July-wife Chris-Son' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='65-70'>

-`;

      const result = getAllCitationsFromLlmOutput(input);

      // Should extract all 6 citations
      expect(Object.keys(result).length).toBe(6);
      const citations = Object.values(result);
      // Output uses new naming: anchorText
      const anchorTexts = citations.map((c) => c.anchorText);
      expect(anchorTexts).toContain("John Doe");
      expect(anchorTexts).toContain("HTN, CAD, HFEF");
      expect(anchorTexts).toContain("worsening soB admitted transferred");
      expect(anchorTexts).toContain("AxOx4 afebrile");
      expect(anchorTexts).toContain("Heparin Bumex Dobutamine");
      expect(anchorTexts).toContain("July-wife Chris-Son");
    });

    it("handles non-self-closing citation without closing tag (backward compat: key_span -> anchorText)", () => {
      // Sometimes LLMs output <cite ...> without any closing, just followed by content
      // Input uses old naming: key_span, start_page_key
      const input = `Some text <cite attachment_id='test123' full_phrase='test phrase' key_span='test' start_page_key='page_number_1_index_0' line_ids='1'>

- Some list content
- More content`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("test phrase");
      // Output uses new naming: anchorText
      expect(citation.anchorText).toBe("test");
    });

    it("handles citation with > ending instead of /> (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `Text <cite attachment_id='test123' full_phrase='phrase' key_span='span' start_page_key='page_number_1_index_0' line_ids='1'>Content</cite> more text`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("phrase");
    });

    it("handles multiple consecutive non-self-closing citations (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id='file1' full_phrase='first' key_span='first' start_page_key='page_number_1_index_0' line_ids='1'>A</cite><cite attachment_id='file2' full_phrase='second' key_span='second' start_page_key='page_number_2_index_0' line_ids='2'>B</cite>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
      // Output uses new naming: anchorText
      const anchorTexts = Object.values(result).map((c) => c.anchorText);
      expect(anchorTexts).toContain("first");
      expect(anchorTexts).toContain("second");
    });

    it("handles nested markdown inside citation content (backward compat: key_span -> anchorText)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id='test123' full_phrase='important fact' key_span='fact' start_page_key='page_number_1_index_0' line_ids='1'>

**Bold text** and *italic* and \`code\`

- List item 1
- List item 2
</cite>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("important fact");
    });
  });

  describe("escaped quotes in attributes (backward compat: key_span -> anchorText)", () => {
    // NOTE: These tests use old attribute names (key_span, start_page_key) to verify backward compatibility.

    it("handles escaped single quotes in reasoning attribute (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id='test123' reasoning='The patient\\'s condition improved' full_phrase='condition improved' key_span='improved' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.reasoning).toContain("patient");
      expect(citation.reasoning).toContain("condition improved");
    });

    it("handles escaped double quotes in full_phrase (backward compat: key_span)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `<cite attachment_id="test123" full_phrase="He said \\"hello\\" to everyone" key_span="hello" start_page_key="page_number_1_index_0" line_ids="1" />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("hello");
    });

    it("handles multiple escaped quotes in same attribute", () => {
      const input = `<cite attachment_id='test123' reasoning='The \\'first\\' and \\'second\\' items' full_phrase='first and second' key_span='first' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
    });

    it("handles mixed escaped and unescaped quotes across attributes", () => {
      const input = `<cite attachment_id='test123' reasoning='Patient\\'s notes' full_phrase="The \"quoted\" text" key_span='quoted' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
    });
  });

  describe("multiline full_phrase handling", () => {
    it("handles full_phrase with literal newlines", () => {
      const input = `<cite attachment_id='test123' full_phrase='Line one
Line two
Line three' key_span='Line two' start_page_key='page_number_1_index_0' line_ids='1-3' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      // Newlines should be normalized to spaces
      expect(citation.fullPhrase).toContain("Line one");
      expect(citation.fullPhrase).toContain("Line two");
    });

    it("handles full_phrase with escaped newlines (\\n)", () => {
      const input = `<cite attachment_id='test123' full_phrase='Line one\\nLine two\\nLine three' key_span='Line two' start_page_key='page_number_1_index_0' line_ids='1-3' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).not.toContain("\\n");
    });

    it("handles full_phrase spanning multiple lines in non-self-closing tag", () => {
      const input = `<cite attachment_id='test123' full_phrase='First paragraph.

Second paragraph with more details.

Third paragraph concluding.' key_span='Second paragraph' start_page_key='page_number_1_index_0' line_ids='1-10'>Content here</cite>`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("First paragraph");
      expect(citation.fullPhrase).toContain("Second paragraph");
    });
  });

  describe("special characters in attributes", () => {
    it("handles angle brackets in full_phrase (HTML-like content)", () => {
      const input = `<cite attachment_id='test123' full_phrase='The value was &lt;100 and &gt;50' key_span='100' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("<100");
      expect(citation.fullPhrase).toContain(">50");
    });

    it("handles ampersands in full_phrase", () => {
      const input = `<cite attachment_id='test123' full_phrase='Smith &amp; Jones LLC' key_span='Smith' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("&");
    });

    it("handles unicode characters in full_phrase", () => {
      const input = `<cite attachment_id='test123' full_phrase='Temperature: 98.6°F • Heart rate: 72 bpm' key_span='98.6°F' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("°");
      expect(citation.fullPhrase).toContain("•");
    });

    it("handles forward slashes in attribute values", () => {
      const input = `<cite attachment_id='test123' full_phrase='Date: 01/15/2024' key_span='01/15/2024' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("Date: 01/15/2024");
    });

    it("handles equals signs in attribute values", () => {
      const input = `<cite attachment_id='test123' full_phrase='Formula: E=mc²' key_span='E=mc²' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("E=mc");
    });
  });

  describe("mixed citation formats in same response", () => {
    it("handles mix of self-closing and non-self-closing citations", () => {
      const input = `First: <cite attachment_id='file1' full_phrase='phrase one' key_span='one' start_page_key='page_number_1_index_0' line_ids='1' />
Second: <cite attachment_id='file2' full_phrase='phrase two' key_span='two' start_page_key='page_number_2_index_0' line_ids='2'>content</cite>
Third: <cite attachment_id='file3' full_phrase='phrase three' key_span='three' start_page_key='page_number_3_index_0' line_ids='3' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(3);
      // Output uses new naming (anchorText)
      const anchorTexts = Object.values(result).map((c) => c.anchorText);
      expect(anchorTexts).toContain("one");
      expect(anchorTexts).toContain("two");
      expect(anchorTexts).toContain("three");
    });

    it("handles citations with and without escaped underscores", () => {
      const input = `First: <cite attachment\\_id='file1' full\\_phrase='phrase one' key\\_span='one' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='1' />
Second: <cite attachment_id='file2' full_phrase='phrase two' key_span='two' start_page_key='page_number_2_index_0' line_ids='2' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(2);
    });

    it("handles citations interspersed with markdown", () => {
      const input = `# Summary

The report shows **important findings**<cite attachment_id='file1' full_phrase='important findings in Q4' key_span='important findings' start_page_key='page_number_1_index_0' line_ids='1' />.

## Details

- Revenue increased by 15%<cite attachment_id='file2' full_phrase='revenue growth of 15 percent' key_span='15%' start_page_key='page_number_2_index_0' line_ids='5' />
- Costs decreased<cite attachment_id='file3' full_phrase='operational costs down' key_span='costs' start_page_key='page_number_3_index_0' line_ids='10' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBe(3);
    });
  });

  describe("edge cases with incomplete/malformed citations", () => {
    it("handles citation with empty key_span", () => {
      const input = `<cite attachment_id='test123' full_phrase='some phrase' key_span='' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toBe("some phrase");
    });

    it("handles citation with very long full_phrase", () => {
      const longPhrase = "A".repeat(500) + " important " + "B".repeat(500);
      const input = `<cite attachment_id='test123' full_phrase='${longPhrase}' key_span='important' start_page_key='page_number_1_index_0' line_ids='1-50' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.fullPhrase).toContain("important");
    });

    it("handles citation at very end of string without trailing content", () => {
      const input = `Some text <cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
    });

    it("handles citation at very beginning of string", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1' /> followed by text`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
    });

    it("handles citation that is the entire string", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
    });
  });

  describe("line_ids edge cases", () => {
    it("handles line_ids with large range", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1-100' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toHaveLength(100);
      expect(citation.lineIds?.[0]).toBe(1);
      expect(citation.lineIds?.[99]).toBe(100);
    });

    it("handles line_ids with multiple ranges", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1-3, 10-12, 20' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toContain(1);
      expect(citation.lineIds).toContain(2);
      expect(citation.lineIds).toContain(3);
      expect(citation.lineIds).toContain(10);
      expect(citation.lineIds).toContain(11);
      expect(citation.lineIds).toContain(12);
      expect(citation.lineIds).toContain(20);
    });

    it("handles line_ids with descending values (should sort ascending)", () => {
      const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='50, 30, 10, 40, 20' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.lineIds).toEqual([10, 20, 30, 40, 50]);
    });
  });

  describe("reasoning attribute variations", () => {
    it("handles reasoning with complex explanation", () => {
      const input = `<cite attachment_id='test123' reasoning='This citation references the section where the author discusses: (1) methodology, (2) results, and (3) conclusions - all of which support the claim.' full_phrase='methodology results conclusions' key_span='methodology' start_page_key='page_number_1_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.reasoning).toContain("methodology");
      expect(citation.reasoning).toContain("conclusions");
    });

    it("handles reasoning with numbers and symbols", () => {
      const input = `<cite attachment_id='test123' reasoning='Page 42, Section 3.1.2 shows 95% confidence interval (p<0.05)' full_phrase='95% confidence' key_span='95%' start_page_key='page_number_42_index_0' line_ids='1' />`;

      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result)).toHaveLength(1);
      const citation = Object.values(result)[0];
      expect(citation.reasoning).toContain("95%");
      expect(citation.reasoning).toContain("p<0.05");
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
      expect(citation.reasoning).toBe(
        "This citation directly supports the claim about revenue"
      );
      expect(citation.fullPhrase).toBe(
        "Revenue increased 45% year-over-year to $2.3 billion"
      );
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
      expect(citations.map((c) => c.anchorText)).toContain("35%");
      expect(citations.map((c) => c.anchorText)).toContain("15%");
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
      expect(citation.fullPhrase).toBe(
        "The study conclusively demonstrates improvement"
      );
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
      const phrases = Object.values(result).map((c) => c.fullPhrase);
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
      const phrases = Object.values(result).map((c) => c.fullPhrase);
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

    it("extracts citation from response with both JSON citation and embedded XML", () => {
      const input = {
        markdown:
          "The report shows growth <cite attachment_id='xml123' full_phrase='XML embedded citation' key_span='XML' start_page_key='page_number_1_index_0' line_ids='1' />",
        citation: {
          attachmentId: "json456",
          fullPhrase: "JSON structured citation",
          keySpan: "JSON",
          startPageKey: "page_number_2_index_0",
          lineIds: [5],
        },
      };
      const result = getAllCitationsFromLlmOutput(input);

      expect(Object.keys(result).length).toBeGreaterThanOrEqual(2);
      const phrases = Object.values(result).map((c) => c.fullPhrase);
      expect(phrases).toContain("XML embedded citation");
      expect(phrases).toContain("JSON structured citation");
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
      const phrases = Object.values(result).map((c) => c.fullPhrase);
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
      const numbers = citations
        .map((c) => c.citationNumber)
        .sort((a, b) => (a || 0) - (b || 0));
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
      expect(citations.every((c) => c.attachmentId === "LOcZ46PdCNO1P62p0p9M")).toBe(true);

      // Check a few specific citations
      const citation1 = citations.find((c) => c.citationNumber === 1);
      expect(citation1?.fullPhrase).toBe("John Doe 50/M Full NKDA");
      expect(citation1?.pageNumber).toBe(1);

      const citation14 = citations.find((c) => c.citationNumber === 14);
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
      const phrases = citations.map((c) => c.fullPhrase);
      expect(phrases).toContain("John Doe");
      expect(phrases).toContain("50/M");
      expect(phrases).toContain("NKDA");

      // Verify attachmentId is correctly injected from the group key
      const johndoeCitation = citations.find((c) => c.fullPhrase === "John Doe");
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

      const doc1Citation = citations.find((c) => c.fullPhrase === "content from doc1");
      expect(doc1Citation?.attachmentId).toBe("doc1AttachmentId");

      const doc2Citation = citations.find((c) => c.fullPhrase === "content from doc2");
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
      expect(citation.attachmentId).toBe("video456");
      expect(citation.timestamps?.startTime).toBe("00:01:00.000");
      expect(citation.timestamps?.endTime).toBe("00:01:30.000");
    });

    it("extracts both deferred JSON and XML citations when both present", () => {
      // This tests that both CITATION_DATA block AND embedded XML are extracted
      const input = `Test [1] with <cite attachment_id='xmlAttachmentId' full_phrase='xml phrase' anchor_text='xml' />.

<<<CITATION_DATA>>>
[{"id": 1, "attachment_id": "deferredAttachmentId", "full_phrase": "deferred phrase", "anchor_text": "deferred"}]
<<<END_CITATION_DATA>>>`;

      const result = getAllCitationsFromLlmOutput(input);
      const citations = Object.values(result);

      // Should have citations from both formats
      expect(citations.length).toBe(2);

      const deferredCitation = citations.find((c) => c.fullPhrase === "deferred phrase");
      expect(deferredCitation).toBeDefined();
      expect(deferredCitation?.attachmentId).toBe("deferredAttachmentId");

      const xmlCitation = citations.find((c) => c.fullPhrase === "xml phrase");
      expect(xmlCitation).toBeDefined();
      expect(xmlCitation?.attachmentId).toBe("xmlAttachmentId");
    });
  });
});
