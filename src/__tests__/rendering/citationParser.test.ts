import { describe, expect, it } from "@jest/globals";
import { buildCitationFromAttrs, parseCiteAttributes } from "../../rendering/citationParser.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const basicCiteTag = `<cite attachment_id="abc123" page_number="3" full_phrase="Revenue grew 45%." anchor_text="grew 45%" line_ids="12,13" />`;

const camelCaseCiteTag = `<cite attachmentId="xyz789" pageNumber="5" fullPhrase="Market share increased." anchorText="increased" lineIds="20,21,22" />`;

const mixedQuotesCiteTag = `<cite attachment_id='file123' page_number='2' full_phrase='Sales doubled in Q4.' anchor_text="doubled" />`;

const escapedQuotesCiteTag = `<cite attachment_id="doc456" full_phrase="He said \\"Hello\\"." anchor_text='Said \\'Hello\\'' />`;

const legacyPageIdCiteTag = `<cite attachment_id="legacy123" start_page_id="page_number_3_index_0" full_phrase="Legacy citation." />`;

const compactPageIdCiteTag = `<cite attachment_id="compact456" start_page_id="2_1" full_phrase="Compact format." />`;

const minimalCiteTag = `<cite attachment_id="min789" />`;

const noLineIdsCiteTag = `<cite attachment_id="test123" page_number="1" full_phrase="No line IDs." />`;

const invalidLineIdsCiteTag = `<cite attachment_id="test456" page_number="1" line_ids="12,abc,13,xyz" full_phrase="Invalid line IDs." />`;

// =============================================================================
// TESTS: parseCiteAttributes
// =============================================================================

describe("parseCiteAttributes", () => {
  it("parses basic cite tag attributes", () => {
    const attrs = parseCiteAttributes(basicCiteTag);
    expect(attrs.attachment_id).toBe("abc123");
    expect(attrs.page_number).toBe("3");
    expect(attrs.full_phrase).toBe("Revenue grew 45%.");
    expect(attrs.anchor_text).toBe("grew 45%");
    expect(attrs.line_ids).toBe("12,13");
  });

  it("converts camelCase attributes to snake_case", () => {
    const attrs = parseCiteAttributes(camelCaseCiteTag);
    expect(attrs.attachment_id).toBe("xyz789");
    expect(attrs.page_number).toBe("5");
    expect(attrs.full_phrase).toBe("Market share increased.");
    expect(attrs.anchor_text).toBe("increased");
    expect(attrs.line_ids).toBe("20,21,22");
  });

  it("handles mixed single and double quotes", () => {
    const attrs = parseCiteAttributes(mixedQuotesCiteTag);
    expect(attrs.attachment_id).toBe("file123");
    expect(attrs.page_number).toBe("2");
    expect(attrs.full_phrase).toBe("Sales doubled in Q4.");
    expect(attrs.anchor_text).toBe("doubled");
  });

  it("handles escaped quotes in attribute values", () => {
    const attrs = parseCiteAttributes(escapedQuotesCiteTag);
    expect(attrs.attachment_id).toBe("doc456");
    expect(attrs.full_phrase).toBe('He said \\"Hello\\".');
    expect(attrs.anchor_text).toBe("Said \\'Hello\\'");
  });

  it("handles legacy start_page_id format", () => {
    const attrs = parseCiteAttributes(legacyPageIdCiteTag);
    expect(attrs.attachment_id).toBe("legacy123");
    expect(attrs.start_page_id).toBe("page_number_3_index_0");
    expect(attrs.full_phrase).toBe("Legacy citation.");
  });

  it("handles compact start_page_id format", () => {
    const attrs = parseCiteAttributes(compactPageIdCiteTag);
    expect(attrs.attachment_id).toBe("compact456");
    expect(attrs.start_page_id).toBe("2_1");
    expect(attrs.full_phrase).toBe("Compact format.");
  });

  it("handles minimal cite tag with only attachment_id", () => {
    const attrs = parseCiteAttributes(minimalCiteTag);
    expect(attrs.attachment_id).toBe("min789");
    expect(attrs.page_number).toBeUndefined();
    expect(attrs.full_phrase).toBeUndefined();
  });

  it("returns empty object for invalid cite tag", () => {
    const attrs = parseCiteAttributes("<cite />");
    expect(Object.keys(attrs).length).toBe(0);
  });

  it("handles attributes with underscores", () => {
    const tag = `<cite attachment_id="test" start_page_id="1_0" line_ids="1,2,3" />`;
    const attrs = parseCiteAttributes(tag);
    expect(attrs.attachment_id).toBe("test");
    expect(attrs.start_page_id).toBe("1_0");
    expect(attrs.line_ids).toBe("1,2,3");
  });
});

// =============================================================================
// TESTS: buildCitationFromAttrs
// =============================================================================

describe("buildCitationFromAttrs", () => {
  it("builds citation from basic attributes", () => {
    const attrs = {
      attachment_id: "abc123",
      page_number: "3",
      full_phrase: "Revenue grew 45%.",
      anchor_text: "grew 45%",
      line_ids: "12,13",
    };
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.attachmentId).toBe("abc123");
    expect(citation.pageNumber).toBe(3);
    expect(citation.fullPhrase).toBe("Revenue grew 45%.");
    expect(citation.anchorText).toBe("grew 45%");
    expect(citation.lineIds).toEqual([12, 13]);
    expect(citation.citationNumber).toBe(1);
  });

  it("parses page number from start_page_id (legacy format)", () => {
    const attrs = {
      attachment_id: "legacy123",
      start_page_id: "page_number_5_index_2",
      full_phrase: "Legacy citation.",
    };
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.pageNumber).toBe(5);
  });

  it("parses page number from start_page_id (compact format)", () => {
    const attrs = {
      attachment_id: "compact456",
      start_page_id: "7_1",
      full_phrase: "Compact citation.",
    };
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.pageNumber).toBe(7);
  });

  it("prefers page_number over start_page_id", () => {
    const attrs = {
      attachment_id: "test",
      page_number: "3",
      start_page_id: "5_0",
      full_phrase: "Test.",
    };
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.pageNumber).toBe(3);
  });

  it("unescapes single quotes in text", () => {
    const attrs = {
      attachment_id: "test",
      full_phrase: "He said \\'Hello\\'.",
      anchor_text: "\\'Hello\\'",
    };
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.fullPhrase).toBe("He said 'Hello'.");
    expect(citation.anchorText).toBe("'Hello'");
  });

  it("unescapes double quotes in text", () => {
    const attrs = {
      attachment_id: "test",
      full_phrase: 'She said \\"Hi\\".',
      anchor_text: '\\"Hi\\"',
    };
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.fullPhrase).toBe('She said "Hi".');
    expect(citation.anchorText).toBe('"Hi"');
  });

  it("parses line IDs correctly", () => {
    const attrs = {
      attachment_id: "test",
      line_ids: "5, 10, 15, 20",
      full_phrase: "Test.",
    };
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.lineIds).toEqual([5, 10, 15, 20]);
  });

  it("filters out invalid line IDs", () => {
    const attrs = parseCiteAttributes(invalidLineIdsCiteTag);
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.lineIds).toEqual([12, 13]);
  });

  it("returns undefined for empty line_ids", () => {
    const attrs = {
      attachment_id: "test",
      line_ids: "",
      full_phrase: "Test.",
    };
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.lineIds).toBeUndefined();
  });

  it("returns undefined for line_ids with only invalid values", () => {
    const attrs = {
      attachment_id: "test",
      line_ids: "abc, xyz, foo",
      full_phrase: "Test.",
    };
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.lineIds).toBeUndefined();
  });

  it("handles missing optional fields", () => {
    const attrs = {
      attachment_id: "test",
    };
    const citation = buildCitationFromAttrs(attrs, 5);

    expect(citation.attachmentId).toBe("test");
    expect(citation.pageNumber).toBeUndefined();
    expect(citation.fullPhrase).toBeUndefined();
    expect(citation.anchorText).toBeUndefined();
    expect(citation.lineIds).toBeUndefined();
    expect(citation.citationNumber).toBe(5);
  });

  it("assigns citation number correctly", () => {
    const attrs = {
      attachment_id: "test",
      full_phrase: "Test.",
    };

    const citation1 = buildCitationFromAttrs(attrs, 1);
    expect(citation1.citationNumber).toBe(1);

    const citation2 = buildCitationFromAttrs(attrs, 42);
    expect(citation2.citationNumber).toBe(42);
  });
});

// =============================================================================
// TESTS: Integration
// =============================================================================

describe("parseCiteAttributes + buildCitationFromAttrs integration", () => {
  it("parses and builds citation from cite tag", () => {
    const attrs = parseCiteAttributes(basicCiteTag);
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.attachmentId).toBe("abc123");
    expect(citation.pageNumber).toBe(3);
    expect(citation.fullPhrase).toBe("Revenue grew 45%.");
    expect(citation.anchorText).toBe("grew 45%");
    expect(citation.lineIds).toEqual([12, 13]);
    expect(citation.citationNumber).toBe(1);
  });

  it("handles camelCase attributes end-to-end", () => {
    const attrs = parseCiteAttributes(camelCaseCiteTag);
    const citation = buildCitationFromAttrs(attrs, 2);

    expect(citation.attachmentId).toBe("xyz789");
    expect(citation.pageNumber).toBe(5);
    expect(citation.fullPhrase).toBe("Market share increased.");
    expect(citation.anchorText).toBe("increased");
    expect(citation.lineIds).toEqual([20, 21, 22]);
    expect(citation.citationNumber).toBe(2);
  });

  it("handles escaped quotes end-to-end", () => {
    const attrs = parseCiteAttributes(escapedQuotesCiteTag);
    const citation = buildCitationFromAttrs(attrs, 3);

    expect(citation.fullPhrase).toBe('He said "Hello".');
    expect(citation.anchorText).toBe("Said 'Hello'");
  });

  it("includes type field set to document", () => {
    const attrs = parseCiteAttributes(basicCiteTag);
    const citation = buildCitationFromAttrs(attrs, 1);

    expect(citation.type).toBe("document");
  });
});

// =============================================================================
// TESTS: Malformed Input (Graceful Degradation)
// =============================================================================

describe("parseCiteAttributes - malformed input", () => {
  it("handles unclosed quotes gracefully", () => {
    const tag = `<cite attachment_id="unclosed full_phrase="test" />`;
    const attrs = parseCiteAttributes(tag);

    // Malformed quote structure causes unexpected parsing behavior
    // The regex matches up to the next quote, capturing malformed content
    expect(attrs.attachment_id).toBe('unclosed full_phrase=');
    expect(attrs.full_phrase).toBeUndefined();
  });

  it("handles missing attribute values", () => {
    const tag = `<cite attachment_id= full_phrase="test" />`;
    const attrs = parseCiteAttributes(tag);

    // Only well-formed attributes are parsed
    expect(attrs.full_phrase).toBe("test");
    expect(attrs.attachment_id).toBeUndefined();
  });

  it("handles attributes without quotes", () => {
    const tag = `<cite attachment_id=abc123 full_phrase="test" />`;
    const attrs = parseCiteAttributes(tag);

    // Unquoted values are not matched by the regex
    expect(attrs.attachment_id).toBeUndefined();
    expect(attrs.full_phrase).toBe("test");
  });

  it("handles completely empty cite tag", () => {
    const tag = `<cite />`;
    const attrs = parseCiteAttributes(tag);

    expect(Object.keys(attrs).length).toBe(0);
  });

  it("handles malformed HTML entities", () => {
    const tag = `<cite attachment_id="test&broken" full_phrase="test" />`;
    const attrs = parseCiteAttributes(tag);

    // Malformed entities are preserved as-is (not decoded)
    expect(attrs.attachment_id).toBe("test&broken");
  });
});
