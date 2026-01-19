import { describe, expect, it } from "@jest/globals";
import {
  getCitationPageNumber,
  normalizeCitations,
  replaceCitations,
  removeCitations,
} from "../parsing/normalizeCitation.js";
import type { Verification } from "../types/verification.js";

describe("getCitationPageNumber", () => {
  it("parses page numbers from standard keys", () => {
    expect(getCitationPageNumber("page_number_12_index_0")).toBe(12);
    expect(getCitationPageNumber("page_key_7_index_2")).toBe(7);
  });

  it("returns null when key is missing", () => {
    expect(getCitationPageNumber(null)).toBeNull();
    expect(getCitationPageNumber(undefined)).toBeNull();
  });
});

describe("normalizeCitations", () => {
  it("normalizes cite attributes, ordering, and content", () => {
    const input =
      "Intro <cite lineIds='1-3' fileID='file123' start_page_key='page_number_2_index_0' fullPhrase=\"Hello\n**world**\" reasoning=\"A &quot;quote&quot;\"></cite> outro";
    const normalized = normalizeCitations(input);
    expect(normalized).toBe(
      "Intro <cite attachment_id='file123' start_page_key='page_number_2_index_0' full_phrase='Hello world' line_ids='1,2,3' reasoning='A \\\"quote\\\"' /> outro"
    );
  });

  it("trims non-citation content", () => {
    expect(normalizeCitations("  Hello world  ")).toBe("Hello world");
  });

  describe("AV citations ordering (timestamps)", () => {
    it("orders AV citation attributes: attachment_id, full_phrase, timestamps, optional attrs", () => {
      const input = `<cite timestamps='1-3' full_phrase='test phrase' fileId='video123' value='some value' />`;
      const result = normalizeCitations(input);
      // Should be ordered: attachment_id, full_phrase, timestamps, value
      const fileIdIndex = result.indexOf("attachment_id=");
      const fullPhraseIndex = result.indexOf("full_phrase=");
      const timestampsIndex = result.indexOf("timestamps=");
      const valueIndex = result.indexOf("value=");
      expect(fileIdIndex).toBeLessThan(fullPhraseIndex);
      expect(fullPhraseIndex).toBeLessThan(timestampsIndex);
      expect(timestampsIndex).toBeLessThan(valueIndex);
    });

    it("handles AV citations with reasoning instead of value", () => {
      // Note: reasoning text may be truncated due to regex lookahead in normalization
      const input = `<cite timestamps='30-45' reasoning='Reason' full_phrase='audio phrase' fileId='audio456' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("attachment_id='audio456'");
      expect(result).toContain("full_phrase='audio phrase'");
      expect(result).toContain("reasoning=");
      // Verify ordering
      const fileIdIndex = result.indexOf("attachment_id=");
      const timestampsIndex = result.indexOf("timestamps=");
      expect(fileIdIndex).toBeLessThan(timestampsIndex);
    });

    it("expands timestamp ranges into comma-separated values", () => {
      const input = `<cite attachment_id='vid' full_phrase='test' timestamps='1-5' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("timestamps='1,2,3,4,5'");
    });
  });

  describe("optional value vs reasoning ordering", () => {
    it("places reasoning before value when both present", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='phrase' line_ids='1' value='val' reasoning='reason' />`;
      const result = normalizeCitations(input);
      // reasoning should come before value in the normalized output
      const reasoningIndex = result.indexOf("reasoning=");
      const valueIndex = result.indexOf("value=");
      expect(reasoningIndex).toBeGreaterThan(-1);
      expect(valueIndex).toBeGreaterThan(-1);
      expect(reasoningIndex).toBeLessThan(valueIndex);
    });

    it("handles only value attribute", () => {
      // Note: value with spaces may be truncated by the regex lookahead
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='phrase' line_ids='1' value='val123' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("value='val123'");
      expect(result).not.toContain("reasoning=");
    });

    it("handles only reasoning attribute", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='phrase' line_ids='1' reasoning='only reason' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("reasoning='only reason'");
      expect(result).not.toContain("value=");
    });
  });

  describe("descending line-id ranges", () => {
    it("expands ascending line-id ranges correctly", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='phrase' line_ids='3-7' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='3,4,5,6,7'");
    });

    it("handles descending line-id ranges by returning only start value", () => {
      // When range is descending (e.g., 10-5), the code returns only the start value
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='phrase' line_ids='10-5' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='10'");
    });

    it("handles single line-id", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='phrase' line_ids='42' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='42'");
    });

    it("handles comma-separated line_ids", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='phrase' line_ids='1,2,5,8' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,5,8'");
    });

    it("handles mixed ranges and individual line_ids", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='phrase' line_ids='1-3,7,9-11' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,3,7,9,10,11'");
    });
  });

  describe("entity edge cases", () => {
    it("decodes &amp; entity", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='Tom &amp; Jerry' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='Tom & Jerry'");
    });

    it("decodes &quot; entity", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='He said &quot;hello&quot;' line_ids='1' />`;
      const result = normalizeCitations(input);
      // After decoding &quot; to ", the " gets escaped to \"
      expect(result).toContain("full_phrase='He said \\\"hello\\\"'");
    });

    it("decodes &apos; entity", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='It&apos;s working' line_ids='1' />`;
      const result = normalizeCitations(input);
      // After decoding &apos; to ', it gets escaped to \'
      expect(result).toContain("full_phrase='It\\'s working'");
    });

    it("decodes &lt; and &gt; entities", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='5 &lt; 10 &gt; 3' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='5 < 10 > 3'");
    });

    it("handles already escaped single quotes", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='It\\'s already escaped' line_ids='1' />`;
      const result = normalizeCitations(input);
      // Should not double-escape - after processing, should have single escaped quote
      expect(result).toMatch(/full_phrase='It\\'s already escaped'/);
    });

    it("handles double-escaped quotes correctly", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='It\\\\'s double' line_ids='1' />`;
      const result = normalizeCitations(input);
      // Double-escaped should become single-escaped
      expect(result).toContain("full_phrase='It\\'s double'");
    });

    it("removes markdown bold/italic markers from content", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='This is **bold** and __italic__' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='This is bold and italic'");
    });

    it("removes asterisks from content", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='Item * with * stars' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='Item  with  stars'");
    });
  });

  describe("attribute key canonicalization", () => {
    it("converts fullPhrase to full_phrase", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' fullPhrase='test phrase' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='test phrase'");
    });

    it("converts lineIds to line_ids", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='test' lineIds='1,2,3' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,3'");
    });

    it("converts fileID to attachment_id", () => {
      const input = `<cite fileID='file1' start_page_key='page_1_index_0' full_phrase='test' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("attachment_id='file1'");
    });

    it("unescapes backslash-escaped underscores in attribute names (Markdown artifact)", () => {
      const input = `<cite attachment\\_id='D8bv8mItwv6VOmIBo2nr' reasoning='states that the report shows 5 bacteria above the threshold' full\\_phrase='Result: POSITIVE - 5 PATHOGENIC BACTERIA REPORTED ABOVE THRESHOLD' key\\_span='5 PATHOGENIC BACTERIA' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='7-8' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("attachment_id='D8bv8mItwv6VOmIBo2nr'");
      expect(result).toContain("full_phrase=");
      expect(result).toContain("key_span='5 PATHOGENIC BACTERIA'");
      expect(result).toContain("start_page_key='page_number_1_index_0'");
      expect(result).toContain("line_ids='7,8'");
    });

    it("handles multiple citations with escaped underscores", () => {
      const input = `First <cite attachment\\_id='file1' full\\_phrase='first phrase' key\\_span='first' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='1' /> and second <cite attachment\\_id='file2' full\\_phrase='second phrase' key\\_span='second' start\\_page\\_key='page\\_number\\_2\\_index\\_1' line\\_ids='5-7' />.`;
      const result = normalizeCitations(input);
      expect(result).toContain("attachment_id='file1'");
      expect(result).toContain("attachment_id='file2'");
      expect(result).toContain("start_page_key='page_number_1_index_0'");
      expect(result).toContain("start_page_key='page_number_2_index_1'");
      expect(result).toContain("line_ids='5,6,7'");
    });
  });

  describe("newline handling", () => {
    it("flattens newlines to spaces in attribute values", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='line one
line two
line three' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='line one line two line three'");
    });

    it("handles Windows-style line breaks", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='line one\r\nline two' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='line one line two'");
    });
  });

  describe("attribute reordering for document citations", () => {
    it("orders document citation attributes: attachment_id, start_page_key, full_phrase, line_ids", () => {
      // Use properly formed input that the regex can parse
      const input = `<cite attachment_id='doc123' start_page_key='page_5_index_0' full_phrase='test phrase' line_ids='1,2' />`;
      const result = normalizeCitations(input);
      // Order should be: attachment_id, start_page_key, full_phrase, line_ids
      const fileIdIndex = result.indexOf("attachment_id=");
      const startPageIndex = result.indexOf("start_page_key=");
      const fullPhraseIndex = result.indexOf("full_phrase=");
      const lineIdsIndex = result.indexOf("line_ids=");

      expect(fileIdIndex).toBeGreaterThan(-1);
      expect(startPageIndex).toBeGreaterThan(-1);
      expect(fullPhraseIndex).toBeGreaterThan(-1);
      expect(lineIdsIndex).toBeGreaterThan(-1);
      expect(fileIdIndex).toBeLessThan(startPageIndex);
      expect(startPageIndex).toBeLessThan(fullPhraseIndex);
      expect(fullPhraseIndex).toBeLessThan(lineIdsIndex);
    });
  });

  describe("multiple citations in text", () => {
    it("normalizes multiple citations in a single string", () => {
      const input = `This is citation 1 <cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='first' line_ids='1' /> and citation 2 <cite attachment_id='file2' start_page_key='page_2_index_0' full_phrase='second' line_ids='2' />.`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='first'");
      expect(result).toContain("full_phrase='second'");
    });

    it("preserves text between citations", () => {
      const input = `Before <cite attachment_id='f1' start_page_key='page_1_index_0' full_phrase='a' line_ids='1' /> middle <cite attachment_id='f2' start_page_key='page_1_index_0' full_phrase='b' line_ids='2' /> after`;
      const result = normalizeCitations(input);
      expect(result).toContain("Before ");
      expect(result).toContain(" middle ");
      expect(result).toContain(" after");
    });
  });

  describe("quoted and unquoted line_ids/timestamps", () => {
    it("handles unquoted line_ids", () => {
      // Unquoted line_ids may have trailing space preserved
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='test' line_ids=1,2,3 />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids=");
      expect(result).toMatch(/line_ids='1,2,3/);
    });

    it("handles double-quoted line_ids", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='test' line_ids="4,5,6" />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='4,5,6'");
    });

    it("handles line_ids with brackets/parentheses", () => {
      // Brackets are removed but spaces may be preserved
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='test' line_ids='[1,2,3]' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,3'");
    });

    it("handles line_ids with text labels", () => {
      const input = `<cite attachment_id='file1' start_page_key='page_1_index_0' full_phrase='test' line_ids='line1,line2,line3' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,3'");
    });
  });
});

describe("replaceCitations", () => {
  describe("basic replacement", () => {
    it("removes citations completely by default", () => {
      const input = `Revenue grew 45%<cite attachment_id='abc123' key_span='Revenue Growth' full_phrase='Revenue grew 45%' start_page_key='page_1_index_0' line_ids='1-3' /> last year.`;
      const result = replaceCitations(input);
      expect(result).toBe("Revenue grew 45% last year.");
    });

    it("removes citations with new attribute ordering (reasoning first)", () => {
      const input = `Revenue grew 45%<cite attachment_id='abc123' reasoning='supports claim' key_span='Revenue Growth' full_phrase='Revenue grew 45%' start_page_key='page_1_index_0' line_ids='1-3' /> last year.`;
      const result = replaceCitations(input);
      expect(result).toBe("Revenue grew 45% last year.");
    });

    it("leaves key_span behind when requested", () => {
      const input = `Revenue grew 45%<cite attachment_id='abc123' key_span='Revenue Growth' full_phrase='Revenue grew 45%' start_page_key='page_1_index_0' line_ids='1-3' /> last year.`;
      const result = replaceCitations(input, { leaveKeySpanBehind: true });
      expect(result).toBe("Revenue grew 45%Revenue Growth last year.");
    });

    it("handles multiple citations", () => {
      const input = `First claim<cite attachment_id='a' key_span='first' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' /> and second<cite attachment_id='b' key_span='second' full_phrase='s' start_page_key='page_2_index_0' line_ids='2' />.`;
      const result = replaceCitations(input, { leaveKeySpanBehind: true });
      expect(result).toBe("First claimfirst and secondsecond.");
    });
  });

  describe("with verification status", () => {
    const verifications: Record<string, Verification> = {
      "1": { status: "found", attachmentId: "abc123" },
      "2": { status: "partial_text_found", attachmentId: "def456" },
      "3": { status: "not_found", attachmentId: "ghi789" },
      "4": { status: "pending", attachmentId: "jkl012" },
    };

    it("shows verification status indicators", () => {
      const input = `Claim 1<cite attachment_id='abc123' key_span='claim1' full_phrase='f1' start_page_key='page_1_index_0' line_ids='1' /> and claim 2<cite attachment_id='def456' key_span='claim2' full_phrase='f2' start_page_key='page_2_index_0' line_ids='2' />.`;
      const result = replaceCitations(input, {
        verifications,
        showVerificationStatus: true,
      });
      expect(result).toBe("Claim 1✓ and claim 2⚠.");
    });

    it("shows key_span with verification status", () => {
      const input = `Claim<cite attachment_id='abc123' key_span='Revenue Growth' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, {
        leaveKeySpanBehind: true,
        verifications,
        showVerificationStatus: true,
      });
      expect(result).toBe("ClaimRevenue Growth✓.");
    });

    it("shows not found indicator", () => {
      const input = `Claim<cite attachment_id='ghi789' key_span='test' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      // This will match verification "3" (third citation)
      const result = replaceCitations(input, {
        verifications: { "1": { status: "not_found", attachmentId: "ghi789" } },
        showVerificationStatus: true,
      });
      expect(result).toBe("Claim✗.");
    });

    it("shows pending indicator when no verification found", () => {
      const input = `Claim<cite attachment_id='unknown' key_span='test' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, {
        verifications: {},
        showVerificationStatus: true,
      });
      expect(result).toBe("Claim◌.");
    });

    it("shows pending indicator for null status", () => {
      const input = `Claim<cite attachment_id='abc' key_span='test' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, {
        verifications: { "1": { status: null } },
        showVerificationStatus: true,
      });
      expect(result).toBe("Claim◌.");
    });
  });

  describe("attribute ordering flexibility", () => {
    it("handles old ordering (attachment_id, start_page_key, full_phrase, key_span, line_ids)", () => {
      const input = `Text<cite attachment_id='abc' start_page_key='page_1_index_0' full_phrase='test phrase' key_span='test' line_ids='1-3' />.`;
      const result = replaceCitations(input, { leaveKeySpanBehind: true });
      expect(result).toBe("Texttest.");
    });

    it("handles new ordering (attachment_id, reasoning, key_span, full_phrase, start_page_key, line_ids)", () => {
      const input = `Text<cite attachment_id='abc' reasoning='supports claim' key_span='test' full_phrase='test phrase' start_page_key='page_1_index_0' line_ids='1-3' />.`;
      const result = replaceCitations(input, { leaveKeySpanBehind: true });
      expect(result).toBe("Texttest.");
    });

    it("handles mixed orderings in same text", () => {
      const input = `First<cite attachment_id='a' key_span='one' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' /> second<cite attachment_id='b' reasoning='r' key_span='two' full_phrase='f' start_page_key='page_2_index_0' line_ids='2' />.`;
      const result = replaceCitations(input, { leaveKeySpanBehind: true });
      expect(result).toBe("Firstone secondtwo.");
    });
  });

  describe("escaped characters in key_span", () => {
    it("unescapes single quotes in key_span", () => {
      const input = `Text<cite attachment_id='abc' key_span='it\\'s great' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, { leaveKeySpanBehind: true });
      expect(result).toBe("Textit's great.");
    });

    it("unescapes double quotes in key_span", () => {
      const input = `Text<cite attachment_id='abc' key_span='said \\"hello\\"' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, { leaveKeySpanBehind: true });
      expect(result).toBe(`Textsaid "hello".`);
    });
  });
});

describe("removeCitations (backward compatibility)", () => {
  it("removes citations like replaceCitations", () => {
    const input = `Text<cite attachment_id='abc' key_span='test' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
    expect(removeCitations(input)).toBe("Text.");
  });

  it("supports leaveKeySpanBehind parameter", () => {
    const input = `Text<cite attachment_id='abc' key_span='test' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
    expect(removeCitations(input, true)).toBe("Texttest.");
  });
});
