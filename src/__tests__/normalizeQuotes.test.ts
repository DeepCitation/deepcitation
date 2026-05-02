import { describe, expect, it } from "bun:test";
import { normalizeQuotes } from "../utils/normalizeQuotes.js";

describe("normalizeQuotes", () => {
  describe("smart double quotes → straight double quote", () => {
    it("replaces left double quotation mark (U+201C)", () => {
      expect(normalizeQuotes("\u201Chello\u201D")).toBe('"hello"');
    });

    it("replaces right double quotation mark (U+201D)", () => {
      expect(normalizeQuotes("\u201D")).toBe('"');
    });

    it("replaces double low-9 quotation mark (U+201E)", () => {
      expect(normalizeQuotes("\u201E")).toBe('"');
    });

    it("replaces double high-reversed-9 quotation mark (U+201F)", () => {
      expect(normalizeQuotes("\u201F")).toBe('"');
    });

    it("replaces double prime (U+2033)", () => {
      expect(normalizeQuotes("\u2033")).toBe('"');
    });
  });

  describe("smart single quotes and apostrophes → straight single quote", () => {
    it("replaces left single quotation mark (U+2018)", () => {
      expect(normalizeQuotes("\u2018")).toBe("'");
    });

    it("replaces right single quotation mark / apostrophe (U+2019)", () => {
      expect(normalizeQuotes("\u2019")).toBe("'");
    });

    it("replaces single low-9 quotation mark (U+201A)", () => {
      expect(normalizeQuotes("\u201A")).toBe("'");
    });

    it("replaces single high-reversed-9 quotation mark (U+201B)", () => {
      expect(normalizeQuotes("\u201B")).toBe("'");
    });

    it("replaces modifier letter apostrophe (U+02BC)", () => {
      expect(normalizeQuotes("\u02BC")).toBe("'");
    });

    it("replaces grave accent / backtick", () => {
      expect(normalizeQuotes("`")).toBe("'");
    });
  });

  describe("dashes → hyphen", () => {
    it("replaces en dash (U+2013)", () => {
      expect(normalizeQuotes("\u2013")).toBe("-");
    });

    it("replaces em dash (U+2014)", () => {
      expect(normalizeQuotes("\u2014")).toBe("-");
    });

    it("replaces horizontal bar (U+2015)", () => {
      expect(normalizeQuotes("\u2015")).toBe("-");
    });

    it("replaces minus sign (U+2212)", () => {
      expect(normalizeQuotes("\u2212")).toBe("-");
    });
  });

  describe("non-breaking space → regular space", () => {
    it("replaces non-breaking space (U+00A0)", () => {
      expect(normalizeQuotes("\u00A0")).toBe(" ");
    });

    it("replaces en quad (U+2000)", () => {
      expect(normalizeQuotes("\u2000")).toBe(" ");
    });

    it("replaces narrow no-break space (U+202F)", () => {
      expect(normalizeQuotes("\u202F")).toBe(" ");
    });

    it("replaces ideographic space (U+3000)", () => {
      expect(normalizeQuotes("\u3000")).toBe(" ");
    });
  });

  describe("ellipsis character behavior", () => {
    // The implementation maps U+2026 → "." (one dot), NOT "..." (three dots).
    // This is a 1:1 replacement — length IS preserved (1 char → 1 char).
    it("replaces ellipsis (U+2026) with a single dot, not three dots", () => {
      expect(normalizeQuotes("\u2026")).toBe(".");
    });

    it("is length-preserving for ellipsis: 1 char in, 1 char out", () => {
      const input = "\u2026";
      const output = normalizeQuotes(input);
      expect(output.length).toBe(input.length);
    });

    it("does NOT expand ellipsis to three dots", () => {
      expect(normalizeQuotes("\u2026")).not.toBe("...");
    });
  });

  describe("mixed strings", () => {
    it("normalizes a sentence with multiple quote types", () => {
      // \u201Csmart double\u201D and \u2018smart single\u2019 and en dash\u2013here
      const input = "\u201Csmart double\u201D and \u2018smart single\u2019 and en dash\u2013here";
      const expected = "\"smart double\" and 'smart single' and en dash-here";
      expect(normalizeQuotes(input)).toBe(expected);
    });

    it("normalizes a string with NBSP and em dash together", () => {
      const input = "word\u00A0word\u2014word";
      expect(normalizeQuotes(input)).toBe("word word-word");
    });

    it("normalizes all categories in one string", () => {
      const input = "\u201Cdouble\u201D \u2018single\u2019 \u2013dash \u00A0space \u2026ellipsis";
      const expected = "\"double\" 'single' -dash  space .ellipsis";
      expect(normalizeQuotes(input)).toBe(expected);
    });
  });

  describe("round-trip: already-normalized text is unchanged", () => {
    it("leaves plain ASCII text unchanged", () => {
      const text = 'He said "hello" and it\'s fine - no changes needed.';
      expect(normalizeQuotes(text)).toBe(text);
    });

    it("leaves regular spaces unchanged", () => {
      expect(normalizeQuotes("a b c")).toBe("a b c");
    });

    it("leaves regular hyphens unchanged", () => {
      expect(normalizeQuotes("well-known")).toBe("well-known");
    });

    it("is idempotent: applying twice gives the same result as once", () => {
      const input = "\u201Chello\u201D \u2018world\u2019 \u2013 test\u2026";
      expect(normalizeQuotes(normalizeQuotes(input))).toBe(normalizeQuotes(input));
    });
  });
});
