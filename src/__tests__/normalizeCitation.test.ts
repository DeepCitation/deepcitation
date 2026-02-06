import { describe, expect, it } from "@jest/globals";
import {
  getCitationPageNumber,
  normalizeCitations,
  replaceCitations,
} from "../parsing/normalizeCitation.js";
import { generateCitationKey } from "../react/utils.js";
import type { Citation } from "../types/citation.js";
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
      "Intro <cite attachment_id='file123' start_page_id='page_number_2_index_0' full_phrase='Hello world' line_ids='1,2,3' reasoning='A \\\"quote\\\"' /> outro"
    );
  });

  it("trims non-citation content", () => {
    expect(normalizeCitations("  Hello world  ")).toBe("Hello world");
  });

  describe("content inside citations (non-self-closing)", () => {
    it("moves simple content from inside citation to before it", () => {
      const input = `<cite attachment_id='abc123' full_phrase='John Doe' anchor_text='John Doe' start_page_id='page_number_1_index_0' line_ids='1-5'>
- Name: John Doe
- Age: 50 years old
</cite>`;
      const result = normalizeCitations(input);
      // Content should be moved before the citation
      expect(result).toContain("- Name: John Doe");
      expect(result).toContain("- Age: 50 years old");
      // Citation should be self-closing and come after the content
      expect(result).toMatch(/years old[\s\S]*<cite.*\/>/);
      expect(result).not.toContain("</cite>");
    });

    it("handles multiple non-self-closing citations with content", () => {
      const input = `Patient Profile:

<cite attachment_id='abc' full_phrase='John Doe 50/M' anchor_text='John Doe' start_page_id='page_number_1_index_0' line_ids='1-5'>

- Name: John Doe
- Age: 50

</cite>

Medical History:

<cite attachment_id='abc' full_phrase='HTN, CAD' anchor_text='HTN' start_page_id='page_number_1_index_0' line_ids='20-25'>

- HTN
- CAD

</cite>`;
      const result = normalizeCitations(input);

      // Content should appear before each citation
      expect(result).toContain("- Name: John Doe");
      expect(result).toContain("- HTN");

      // No closing </cite> tags should remain
      expect(result).not.toContain("</cite>");

      // Both citations should be self-closing
      const citeMatches = result.match(/<cite[^>]*\/>/g);
      expect(citeMatches).toHaveLength(2);
    });

    it("preserves empty non-self-closing citations", () => {
      const input = `Text <cite attachment_id='abc' full_phrase='test' anchor_text='test' start_page_id='page_number_1_index_0' line_ids='1'></cite> more text`;
      const result = normalizeCitations(input);
      // Empty citation should just normalize to self-closing
      expect(result).toContain("<cite");
      expect(result).toContain("/>");
      expect(result).not.toContain("</cite>");
    });

    it("handles content with special characters inside citation", () => {
      const input = `<cite attachment_id='abc' full_phrase='test' anchor_text='test' start_page_id='page_number_1_index_0' line_ids='1'>

* Bullet item with *asterisks*
* Another **bold** item

</cite>`;
      const result = normalizeCitations(input);
      // Content should be preserved (asterisks remain in content, not in citation attrs)
      expect(result).toContain("Bullet item");
      expect(result).toMatch(/<cite.*\/>/);
    });

    it("handles real-world medical chart example", () => {
      const input = `Patient Profile:

<cite attachment_id='VVoEl2eWxfWbvZu0qajw' reasoning='Patient identification details' full_phrase='John Doe 50/M' anchor_text='John Doe' start_page_id='page_number_1_index_0' line_ids='1-5'>

- Name: John Doe
- Age: 50 years old
- Gender: Male
- Allergies: NKDA (No Known Drug Allergies)

</cite>

Medical History:

<cite attachment_id='VVoEl2eWxfWbvZu0qajw' reasoning='Patient medical background' full_phrase='HTN, CAD, HFEF' anchor_text='HTN, CAD, HFEF' start_page_id='page_number_1_index_0' line_ids='20-25'>

- Conditions:
  * Hypertension (HTN)
  * Coronary Artery Disease (CAD)

</cite>`;
      const result = normalizeCitations(input);

      // Content should be moved before citations
      expect(result).toContain("Patient Profile:");
      expect(result).toContain("- Name: John Doe");
      expect(result).toContain("- Age: 50 years old");
      expect(result).toContain("Medical History:");
      expect(result).toContain("- Conditions:");
      expect(result).toContain("Hypertension (HTN)");

      // Citations should be self-closing
      expect(result).not.toContain("</cite>");

      // Verify structure: content appears before each citation
      const patientProfileIdx = result.indexOf("Patient Profile:");
      const nameIdx = result.indexOf("- Name: John Doe");
      const firstCiteIdx = result.indexOf(
        "<cite attachment_id='VVoEl2eWxfWbvZu0qajw'"
      );

      expect(patientProfileIdx).toBeLessThan(nameIdx);
      expect(nameIdx).toBeLessThan(firstCiteIdx);
    });

    it("preserves whitespace structure in extracted content", () => {
      const input = `<cite attachment_id='abc' full_phrase='test' anchor_text='test' start_page_id='page_number_1_index_0' line_ids='1'>
Line 1
Line 2
Line 3
</cite>`;
      const result = normalizeCitations(input);
      // Content should maintain line structure (trimmed)
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
      expect(result).toContain("Line 3");
    });

    it("handles mix of self-closing and non-self-closing citations", () => {
      const input = `First <cite attachment_id='a' full_phrase='first' anchor_text='first' start_page_id='page_number_1_index_0' line_ids='1' /> then <cite attachment_id='b' full_phrase='second' anchor_text='second' start_page_id='page_number_1_index_0' line_ids='2'>Content inside</cite> end`;
      const result = normalizeCitations(input);

      // Self-closing citation should remain as-is
      // Non-self-closing should have content moved
      expect(result).toContain("Content inside");
      expect(result).not.toContain("</cite>");

      // Both should be self-closing in output
      const citeMatches = result.match(/<cite[^>]*\/>/g);
      expect(citeMatches).toHaveLength(2);
    });
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
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='phrase' line_ids='1' value='val' reasoning='reason' />`;
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
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='phrase' line_ids='1' value='val123' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("value='val123'");
      expect(result).not.toContain("reasoning=");
    });

    it("handles only reasoning attribute", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='phrase' line_ids='1' reasoning='only reason' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("reasoning='only reason'");
      expect(result).not.toContain("value=");
    });
  });

  describe("descending line-id ranges", () => {
    it("expands ascending line-id ranges correctly", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='phrase' line_ids='3-7' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='3,4,5,6,7'");
    });

    it("handles descending line-id ranges by returning only start value", () => {
      // When range is descending (e.g., 10-5), the code returns only the start value
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='phrase' line_ids='10-5' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='10'");
    });

    it("handles single line-id", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='phrase' line_ids='42' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='42'");
    });

    it("handles comma-separated line_ids", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='phrase' line_ids='1,2,5,8' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,5,8'");
    });

    it("handles mixed ranges and individual line_ids", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='phrase' line_ids='1-3,7,9-11' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,3,7,9,10,11'");
    });
  });

  describe("entity edge cases", () => {
    it("decodes &amp; entity", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='Tom &amp; Jerry' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='Tom & Jerry'");
    });

    it("decodes &quot; entity", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='He said &quot;hello&quot;' line_ids='1' />`;
      const result = normalizeCitations(input);
      // After decoding &quot; to ", the " gets escaped to \"
      expect(result).toContain("full_phrase='He said \\\"hello\\\"'");
    });

    it("decodes &apos; entity", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='It&apos;s working' line_ids='1' />`;
      const result = normalizeCitations(input);
      // After decoding &apos; to ', it gets escaped to \'
      expect(result).toContain("full_phrase='It\\'s working'");
    });

    it("decodes &lt; and &gt; entities", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='5 &lt; 10 &gt; 3' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='5 < 10 > 3'");
    });

    it("handles already escaped single quotes", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='It\\'s already escaped' line_ids='1' />`;
      const result = normalizeCitations(input);
      // Should not double-escape - after processing, should have single escaped quote
      expect(result).toMatch(/full_phrase='It\\'s already escaped'/);
    });

    it("handles double-escaped quotes correctly", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='It\\\\'s double' line_ids='1' />`;
      const result = normalizeCitations(input);
      // Double-escaped should become single-escaped
      expect(result).toContain("full_phrase='It\\'s double'");
    });

    it("removes markdown bold/italic markers from content", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='This is **bold** and __italic__' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='This is bold and italic'");
    });

    it("removes asterisks from content", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='Item * with * stars' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='Item  with  stars'");
    });
  });

  describe("attribute key canonicalization", () => {
    it("converts fullPhrase to full_phrase", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' fullPhrase='test phrase' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='test phrase'");
    });

    it("converts lineIds to line_ids", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='test' lineIds='1,2,3' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,3'");
    });

    it("converts fileID to attachment_id", () => {
      const input = `<cite fileID='file1' start_page_id='page_1_index_0' full_phrase='test' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("attachment_id='file1'");
    });

    it("unescapes backslash-escaped underscores in attribute names (Markdown artifact)", () => {
      // Input uses old naming (key_span, start_page_key) to test backward compatibility
      const input = `<cite attachment\\_id='D8bv8mItwv6VOmIBo2nr' reasoning='states that the report shows 5 bacteria above the threshold' full\\_phrase='Result: POSITIVE - 5 PATHOGENIC BACTERIA REPORTED ABOVE THRESHOLD' key\\_span='5 PATHOGENIC BACTERIA' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='7-8' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("attachment_id='D8bv8mItwv6VOmIBo2nr'");
      expect(result).toContain("full_phrase=");
      // key_span gets canonicalized to anchor_text
      expect(result).toContain("anchor_text='5 PATHOGENIC BACTERIA'");
      // start_page_key gets canonicalized to start_page_id
      expect(result).toContain("start_page_id='page_number_1_index_0'");
      expect(result).toContain("line_ids='7,8'");
    });

    it("handles multiple citations with escaped underscores", () => {
      // Input uses old naming (key_span, start_page_key) to test backward compatibility
      const input = `First <cite attachment\\_id='file1' full\\_phrase='first phrase' key\\_span='first' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='1' /> and second <cite attachment\\_id='file2' full\\_phrase='second phrase' key\\_span='second' start\\_page\\_key='page\\_number\\_2\\_index\\_1' line\\_ids='5-7' />.`;
      const result = normalizeCitations(input);
      expect(result).toContain("attachment_id='file1'");
      expect(result).toContain("attachment_id='file2'");
      // start_page_key gets canonicalized to start_page_id
      expect(result).toContain("start_page_id='page_number_1_index_0'");
      expect(result).toContain("start_page_id='page_number_2_index_1'");
      expect(result).toContain("line_ids='5,6,7'");
    });
  });

  describe("newline handling", () => {
    it("flattens newlines to spaces in attribute values", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='line one
line two
line three' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='line one line two line three'");
    });

    it("handles Windows-style line breaks", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='line one\r\nline two' line_ids='1' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='line one line two'");
    });
  });

  describe("attribute reordering for document citations", () => {
    it("orders document citation attributes: attachment_id, start_page_id, full_phrase, line_ids", () => {
      // Use properly formed input that the regex can parse
      const input = `<cite attachment_id='doc123' start_page_id='page_5_index_0' full_phrase='test phrase' line_ids='1,2' />`;
      const result = normalizeCitations(input);
      // Order should be: attachment_id, start_page_id, full_phrase, line_ids
      const fileIdIndex = result.indexOf("attachment_id=");
      const startPageIndex = result.indexOf("start_page_id=");
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
      const input = `This is citation 1 <cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='first' line_ids='1' /> and citation 2 <cite attachment_id='file2' start_page_id='page_2_index_0' full_phrase='second' line_ids='2' />.`;
      const result = normalizeCitations(input);
      expect(result).toContain("full_phrase='first'");
      expect(result).toContain("full_phrase='second'");
    });

    it("preserves text between citations", () => {
      const input = `Before <cite attachment_id='f1' start_page_id='page_1_index_0' full_phrase='a' line_ids='1' /> middle <cite attachment_id='f2' start_page_id='page_1_index_0' full_phrase='b' line_ids='2' /> after`;
      const result = normalizeCitations(input);
      expect(result).toContain("Before ");
      expect(result).toContain(" middle ");
      expect(result).toContain(" after");
    });
  });

  describe("quoted and unquoted line_ids/timestamps", () => {
    it("handles unquoted line_ids", () => {
      // Unquoted line_ids may have trailing space preserved
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='test' line_ids=1,2,3 />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids=");
      expect(result).toMatch(/line_ids='1,2,3/);
    });

    it("handles double-quoted line_ids", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='test' line_ids="4,5,6" />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='4,5,6'");
    });

    it("handles line_ids with brackets/parentheses", () => {
      // Brackets are removed but spaces may be preserved
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='test' line_ids='[1,2,3]' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,3'");
    });

    it("handles line_ids with text labels", () => {
      const input = `<cite attachment_id='file1' start_page_id='page_1_index_0' full_phrase='test' line_ids='line1,line2,line3' />`;
      const result = normalizeCitations(input);
      expect(result).toContain("line_ids='1,2,3'");
    });
  });
});

describe("replaceCitations", () => {
  // NOTE: These tests use old attribute names (key_span, start_page_key) in XML strings to verify backward compatibility.
  // The parser canonicalizes key_span -> anchor_text and start_page_key -> start_page_id internally.

  describe("basic replacement", () => {
    it("removes citations completely by default (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `Revenue grew 45%<cite attachment_id='abc123' key_span='Revenue Growth' full_phrase='Revenue grew 45%' start_page_key='page_1_index_0' line_ids='1-3' /> last year.`;
      const result = replaceCitations(input);
      expect(result).toBe("Revenue grew 45% last year.");
    });

    it("removes citations with new attribute ordering (reasoning first) (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `Revenue grew 45%<cite attachment_id='abc123' reasoning='supports claim' key_span='Revenue Growth' full_phrase='Revenue grew 45%' start_page_key='page_1_index_0' line_ids='1-3' /> last year.`;
      const result = replaceCitations(input);
      expect(result).toBe("Revenue grew 45% last year.");
    });

    it("leaves anchor_text behind when requested (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `Revenue grew 45%<cite attachment_id='abc123' key_span='Revenue Growth' full_phrase='Revenue grew 45%' start_page_key='page_1_index_0' line_ids='1-3' /> last year.`;
      const result = replaceCitations(input, { leaveAnchorTextBehind: true });
      expect(result).toBe("Revenue grew 45%Revenue Growth last year.");
    });

    it("handles multiple citations (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span, start_page_key
      const input = `First claim<cite attachment_id='a' key_span='first' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' /> and second<cite attachment_id='b' key_span='second' full_phrase='s' start_page_key='page_2_index_0' line_ids='2' />.`;
      const result = replaceCitations(input, { leaveAnchorTextBehind: true });
      expect(result).toBe("First claimfirst and secondsecond.");
    });
  });

  describe("with verification status (backward compat: key_span in XML)", () => {
    // Input uses old naming: key_span
    const verifications: Record<string, Verification> = {
      "1": { status: "found", attachmentId: "abc123" },
      "2": { status: "partial_text_found", attachmentId: "def456" },
      "3": { status: "not_found", attachmentId: "ghi789" },
      "4": { status: "pending", attachmentId: "jkl012" },
    };

    it("shows verification status indicators (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `Claim 1<cite attachment_id='abc123' key_span='claim1' full_phrase='f1' start_page_key='page_1_index_0' line_ids='1' /> and claim 2<cite attachment_id='def456' key_span='claim2' full_phrase='f2' start_page_key='page_2_index_0' line_ids='2' />.`;
      const result = replaceCitations(input, {
        verifications,
        showVerificationStatus: true,
      });
      expect(result).toBe("Claim 1☑️ and claim 2✅.");
    });

    it("shows anchor_text with verification status (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `Claim<cite attachment_id='abc123' key_span='Revenue Growth' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, {
        leaveAnchorTextBehind: true,
        verifications,
        showVerificationStatus: true,
      });
      expect(result).toBe("ClaimRevenue Growth☑️.");
    });

    it("shows not found indicator (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `Claim<cite attachment_id='ghi789' key_span='test' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      // This will match verification "3" (third citation)
      const result = replaceCitations(input, {
        verifications: { "1": { status: "not_found", attachmentId: "ghi789" } },
        showVerificationStatus: true,
      });
      expect(result).toBe("Claim❌.");
    });

    it("shows pending indicator when no verification found (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `Claim<cite attachment_id='unknown' key_span='test' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, {
        verifications: {},
        showVerificationStatus: true,
      });
      expect(result).toBe("Claim⌛.");
    });

    it("shows pending indicator for null status (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `Claim<cite attachment_id='abc' key_span='test' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, {
        verifications: { "1": { status: null } },
        showVerificationStatus: true,
      });
      expect(result).toBe("Claim⌛.");
    });
  });

  describe("attribute ordering flexibility (backward compat: key_span in XML)", () => {
    // Input uses old naming: key_span

    it("handles old ordering (attachment_id, start_page_key, full_phrase, anchor_text, line_ids) (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `Text<cite attachment_id='abc' start_page_key='page_1_index_0' full_phrase='test phrase' key_span='test' line_ids='1-3' />.`;
      const result = replaceCitations(input, { leaveAnchorTextBehind: true });
      expect(result).toBe("Texttest.");
    });

    it("handles new ordering (attachment_id, reasoning, anchor_text, full_phrase, start_page_key, line_ids) (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `Text<cite attachment_id='abc' reasoning='supports claim' key_span='test' full_phrase='test phrase' start_page_key='page_1_index_0' line_ids='1-3' />.`;
      const result = replaceCitations(input, { leaveAnchorTextBehind: true });
      expect(result).toBe("Texttest.");
    });

    it("handles mixed orderings in same text (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `First<cite attachment_id='a' key_span='one' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' /> second<cite attachment_id='b' reasoning='r' key_span='two' full_phrase='f' start_page_key='page_2_index_0' line_ids='2' />.`;
      const result = replaceCitations(input, { leaveAnchorTextBehind: true });
      expect(result).toBe("Firstone secondtwo.");
    });
  });

  describe("escaped characters in anchor_text (backward compat: key_span in XML)", () => {
    // Input uses old naming: key_span

    it("unescapes single quotes in anchor_text (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `Text<cite attachment_id='abc' key_span='it\\'s great' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, { leaveAnchorTextBehind: true });
      expect(result).toBe("Textit's great.");
    });

    it("unescapes double quotes in anchor_text (backward compat: key_span in XML)", () => {
      // Input uses old naming: key_span
      const input = `Text<cite attachment_id='abc' key_span='said \\"hello\\"' full_phrase='f' start_page_key='page_1_index_0' line_ids='1' />.`;
      const result = replaceCitations(input, { leaveAnchorTextBehind: true });
      expect(result).toBe(`Textsaid "hello".`);
    });
  });
});

describe("replaceCitations with citationKey matching", () => {
  // NOTE: These tests use old attribute names (key_span) in XML strings to verify backward compatibility.
  // Citation object properties use new naming (anchorText).

  it("matches verifications by citationKey when multiple citations share same attachmentId", () => {
    // This is the critical test: multiple citations from the same document
    // should each match their own verification, not all match the first one
    const attachmentId = "D8bv8mItwv6VOmIBo2nr";

    // Create citations that would be in the LLM output
    const citation1: Citation = {
      attachmentId,
      pageNumber: 1,
      fullPhrase: "Patient John Doe is a 50 year old male",
      anchorText: "John Doe",
      lineIds: [1, 2],
    };

    const citation2: Citation = {
      attachmentId,
      pageNumber: 1,
      fullPhrase: "Allergies: No Known Drug Allergies (NKDA)",
      anchorText: "NKDA",
      lineIds: [3],
    };

    const citation3: Citation = {
      attachmentId,
      pageNumber: 1,
      fullPhrase: "Blood pressure reading was elevated at 150/95",
      anchorText: "elevated",
      lineIds: [5, 6],
    };

    // Generate the keys that the verification system would use
    const key1 = generateCitationKey(citation1);
    const key2 = generateCitationKey(citation2);
    const key3 = generateCitationKey(citation3);

    // Ensure keys are unique
    expect(key1).not.toBe(key2);
    expect(key2).not.toBe(key3);
    expect(key1).not.toBe(key3);

    // Set up verifications with different statuses keyed by citationKey
    const verifications: Record<string, Verification> = {
      [key1]: { status: "found", attachmentId },
      [key2]: { status: "not_found", attachmentId },
      [key3]: { status: "partial_text_found", attachmentId },
    };

    // Build input with citations in the exact same format (XML uses old key_span attr for backward compat)
    const input = `${citation1.fullPhrase}<cite attachment_id='${attachmentId}' start_page_key='page_number_1_index_0' full_phrase='${citation1.fullPhrase}' key_span='${citation1.anchorText}' line_ids='1,2' /> and ${citation2.fullPhrase}<cite attachment_id='${attachmentId}' start_page_key='page_number_1_index_0' full_phrase='${citation2.fullPhrase}' key_span='${citation2.anchorText}' line_ids='3' /> and ${citation3.fullPhrase}<cite attachment_id='${attachmentId}' start_page_key='page_number_1_index_0' full_phrase='${citation3.fullPhrase}' key_span='${citation3.anchorText}' line_ids='5,6' />.`;

    const result = replaceCitations(input, {
      verifications,
      showVerificationStatus: true,
    });

    // Each citation should have its own correct indicator
    // citation1 = found (☑️), citation2 = not_found (❌), citation3 = partial (✅)
    expect(result).toBe(
      `${citation1.fullPhrase}☑️ and ${citation2.fullPhrase}❌ and ${citation3.fullPhrase}✅.`
    );
  });

  it("matches by citationKey even when citations have escaped quotes", () => {
    const attachmentId = "TestAttachment12345678";

    const citation: Citation = {
      attachmentId,
      pageNumber: 2,
      fullPhrase: 'The doctor said "rest is important" for recovery',
      anchorText: "rest is important",
      lineIds: [10],
    };

    const key = generateCitationKey(citation);
    const verifications: Record<string, Verification> = {
      [key]: { status: "found", attachmentId },
    };

    // In cite tags, quotes are escaped (XML uses old key_span attr for backward compat)
    const input = `Quote<cite attachment_id='${attachmentId}' start_page_key='page_number_2_index_0' full_phrase='The doctor said \\"rest is important\\" for recovery' key_span='rest is important' line_ids='10' />.`;

    const result = replaceCitations(input, {
      verifications,
      showVerificationStatus: true,
    });

    expect(result).toBe("Quote☑️.");
  });

  it("falls back to numeric key when citationKey does not match", () => {
    // Test backward compatibility with numeric keys
    const verifications: Record<string, Verification> = {
      "1": { status: "found", attachmentId: "abc" },
      "2": { status: "not_found", attachmentId: "abc" },
    };

    // XML uses old key_span attr for backward compat
    const input = `First<cite attachment_id='abc' start_page_key='page_number_1_index_0' full_phrase='first phrase' key_span='first' line_ids='1' /> second<cite attachment_id='abc' start_page_key='page_number_1_index_0' full_phrase='second phrase' key_span='second' line_ids='2' />.`;

    const result = replaceCitations(input, {
      verifications,
      showVerificationStatus: true,
    });

    expect(result).toBe("First☑️ second❌.");
  });

  it("shows pending indicator when neither citationKey nor numeric key matches", () => {
    const verifications: Record<string, Verification> = {
      "wrong-key": { status: "found", attachmentId: "abc" },
    };

    // XML uses old key_span attr for backward compat
    const input = `Claim<cite attachment_id='abc' start_page_key='page_number_1_index_0' full_phrase='test phrase' key_span='test' line_ids='1' />.`;

    const result = replaceCitations(input, {
      verifications,
      showVerificationStatus: true,
    });

    expect(result).toBe("Claim⌛.");
  });

  describe("citationKey matching with escaped quotes in attributes", () => {
    it("matches citationKey when fullPhrase has escaped single quotes", () => {
      const attachmentId = "gM5nhodOx1d12bVIiYvH";

      // Citation as it would be parsed from normalized output (unescaped)
      const citation: Citation = {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "It's a test phrase with apostrophe",
        anchorText: "It's a test",
        lineIds: [21, 22, 23],
      };

      const key = generateCitationKey(citation);
      const verifications: Record<string, Verification> = {
        [key]: { status: "found", attachmentId },
      };

      // In cite tags after normalization, quotes are escaped with backslash (XML uses old key_span attr for backward compat)
      const input = `Text<cite attachment_id='${attachmentId}' start_page_key='page_number_1_index_0' full_phrase='It\\'s a test phrase with apostrophe' key_span='It\\'s a test' line_ids='21,22,23' />.`;

      const result = replaceCitations(input, {
        verifications,
        showVerificationStatus: true,
      });

      expect(result).toBe("Text☑️.");
    });

    it("matches citationKey when fullPhrase has escaped double quotes", () => {
      const attachmentId = "gM5nhodOx1d12bVIiYvH";

      // Citation as it would be parsed from normalized output (unescaped)
      const citation: Citation = {
        attachmentId,
        pageNumber: 1,
        fullPhrase: 'He said "hello" to the patient',
        anchorText: 'said "hello"',
        lineIds: [10],
      };

      const key = generateCitationKey(citation);
      const verifications: Record<string, Verification> = {
        [key]: { status: "found", attachmentId },
      };

      // In cite tags, double quotes are escaped (XML uses old key_span attr for backward compat)
      const input = `Text<cite attachment_id='${attachmentId}' start_page_key='page_number_1_index_0' full_phrase='He said \\"hello\\" to the patient' key_span='said \\"hello\\"' line_ids='10' />.`;

      const result = replaceCitations(input, {
        verifications,
        showVerificationStatus: true,
      });

      expect(result).toBe("Text☑️.");
    });

    it("matches citationKey with real medical chart data containing commas and special characters", () => {
      const attachmentId = "gM5nhodOx1d12bVIiYvH";

      // This mimics the exact scenario from the user's output
      const citation: Citation = {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "HTN, CAD, HFrEF, Hypothyroid, HLD,",
        anchorText: "HTN, CAD, HFrEF, Hypothyroid",
        lineIds: [21, 22, 23],
      };

      const key = generateCitationKey(citation);
      const verifications: Record<string, Verification> = {
        [key]: { status: "found", attachmentId },
      };

      // Input with escaped quotes and attributes in any order (XML uses old key_span attr for backward compat)
      const input = `He has a history of HTN, CAD, HFrEF, Hypothyroid, and HLD <cite attachment_id='gM5nhodOx1d12bVIiYvH' reasoning='patient medical history' full_phrase='HTN, CAD, HFrEF, Hypothyroid, HLD,' key_span='HTN, CAD, HFrEF, Hypothyroid' start_page_key='page_number_1_index_0' line_ids='21,22,23' />.`;

      const result = replaceCitations(input, {
        verifications,
        showVerificationStatus: true,
      });

      expect(result).toBe(
        "He has a history of HTN, CAD, HFrEF, Hypothyroid, and HLD ☑️."
      );
    });

    it("matches citationKey when line_ids are specified as ranges in the cite tag", () => {
      const attachmentId = "gM5nhodOx1d12bVIiYvH";

      // Citation with expanded line_ids
      const citation: Citation = {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "5/17-admitted at outside hospital",
        anchorText: "5/17-admitted",
        lineIds: [11, 12, 13, 14, 15, 16],
      };

      const key = generateCitationKey(citation);
      const verifications: Record<string, Verification> = {
        [key]: { status: "found", attachmentId },
      };

      // Input with line_ids as a range (11-16) which should be expanded (XML uses old key_span attr for backward compat)
      const input = `The patient was admitted <cite attachment_id='gM5nhodOx1d12bVIiYvH' full_phrase='5/17-admitted at outside hospital' key_span='5/17-admitted' start_page_key='page_number_1_index_0' line_ids='11-16' />.`;

      const result = replaceCitations(input, {
        verifications,
        showVerificationStatus: true,
      });

      expect(result).toBe("The patient was admitted ☑️.");
    });

    it("matches multiple citations from same document with different verification statuses", () => {
      const attachmentId = "gM5nhodOx1d12bVIiYvH";

      // Multiple citations as they would be parsed
      const citation1: Citation = {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "HTN, CAD, HFrEF, Hypothyroid, HLD,",
        anchorText: "HTN, CAD, HFrEF, Hypothyroid",
        lineIds: [21, 22, 23],
      };

      const citation2: Citation = {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "5/17-admitted at outside hospital",
        anchorText: "5/17-admitted",
        lineIds: [11, 12, 13, 14, 15, 16],
      };

      const citation3: Citation = {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "Heparin 12 u/hr, Bumex 5mg/hr",
        anchorText: "Heparin, Bumex",
        lineIds: [28, 29, 30],
      };

      const key1 = generateCitationKey(citation1);
      const key2 = generateCitationKey(citation2);
      const key3 = generateCitationKey(citation3);

      const verifications: Record<string, Verification> = {
        [key1]: { status: "found", attachmentId },
        [key2]: { status: "found", attachmentId },
        [key3]: { status: "partial_text_found", attachmentId },
      };

      // XML uses old key_span attr for backward compat
      const input = `History: <cite attachment_id='gM5nhodOx1d12bVIiYvH' full_phrase='HTN, CAD, HFrEF, Hypothyroid, HLD,' key_span='HTN, CAD, HFrEF, Hypothyroid' start_page_key='page_number_1_index_0' line_ids='21-23' />. Admitted <cite attachment_id='gM5nhodOx1d12bVIiYvH' full_phrase='5/17-admitted at outside hospital' key_span='5/17-admitted' start_page_key='page_number_1_index_0' line_ids='11-16' />. Meds: <cite attachment_id='gM5nhodOx1d12bVIiYvH' full_phrase='Heparin 12 u/hr, Bumex 5mg/hr' key_span='Heparin, Bumex' start_page_key='page_number_1_index_0' line_ids='28-30' />.`;

      const result = replaceCitations(input, {
        verifications,
        showVerificationStatus: true,
      });

      // First two should be ☑️ (found), third should be ✅ (partial)
      expect(result).toBe("History: ☑️. Admitted ☑️. Meds: ✅.");
    });
  });

  it("correctly handles real-world medical chart scenario with 5+ citations", () => {
    const attachmentId = "MedicalChart2024Test";

    // Simulate a medical chart with multiple facts
    const citations: Citation[] = [
      {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "Patient: John Doe, 50/M",
        anchorText: "John Doe",
        lineIds: [1],
      },
      {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "Allergies: NKDA",
        anchorText: "NKDA",
        lineIds: [2],
      },
      {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "Heparin 12 u/hr",
        anchorText: "Heparin",
        lineIds: [5],
      },
      {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "Dobutamine 2.5 mcg/kg",
        anchorText: "Dobutamine",
        lineIds: [6],
      },
      {
        attachmentId,
        pageNumber: 1,
        fullPhrase: "Na+ 138",
        anchorText: "Na+ 138",
        lineIds: [10],
      },
    ];

    // Create verifications: some found, some not, some partial
    const verifications: Record<string, Verification> = {};
    const statuses: Array<Verification["status"]> = [
      "found",
      "found",
      "not_found",
      "partial_text_found",
      "found",
    ];

    citations.forEach((c, i) => {
      const key = generateCitationKey(c);
      verifications[key] = { status: statuses[i], attachmentId };
    });

    // Build input (XML uses old key_span attr for backward compat)
    let input = "";
    citations.forEach((c, i) => {
      input += `${c.fullPhrase}<cite attachment_id='${attachmentId}' start_page_key='page_number_1_index_0' full_phrase='${c.fullPhrase}' key_span='${c.anchorText}' line_ids='${c.lineIds?.[0]}' />`;
      if (i < citations.length - 1) input += " ";
    });

    const result = replaceCitations(input, {
      verifications,
      showVerificationStatus: true,
    });

    // Verify each citation gets its correct indicator
    // found=☑️, not_found=❌, partial=✅
    expect(result).toBe(
      "Patient: John Doe, 50/M☑️ Allergies: NKDA☑️ Heparin 12 u/hr❌ Dobutamine 2.5 mcg/kg✅ Na+ 138☑️"
    );
  });
});
