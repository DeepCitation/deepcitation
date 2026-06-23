import { describe, expect, it } from "bun:test";
import { isExactOrDashVariantMatch, isExactOrDashVariantPrefixMatch } from "../utils/textEquivalence.js";

// All Unicode dash codepoints covered by DASH_VARIANT_PATTERN in textEquivalence.ts:
// - hyphen-minus (the canonical ASCII dash, treated as baseline)
// ֊ Armenian hyphen
// ־ Hebrew punctuation maqaf
// ‐ HYPHEN
// ‑ NON-BREAKING HYPHEN
// ‒ FIGURE DASH
// – EN DASH
// — EM DASH
// ― HORIZONTAL BAR
// − MINUS SIGN
// ﹘ SMALL EM DASH
// ﹣ SMALL HYPHEN-MINUS
// － FULLWIDTH HYPHEN-MINUS

const DASH_VARIANTS: Array<{ name: string; char: string }> = [
  { name: "Armenian hyphen (U+058A)", char: "֊" },
  { name: "Hebrew maqaf (U+05BE)", char: "־" },
  { name: "HYPHEN (U+2010)", char: "‐" },
  { name: "NON-BREAKING HYPHEN (U+2011)", char: "‑" },
  { name: "FIGURE DASH (U+2012)", char: "‒" },
  { name: "EN DASH (U+2013)", char: "–" },
  { name: "EM DASH (U+2014)", char: "—" },
  { name: "HORIZONTAL BAR (U+2015)", char: "―" },
  { name: "MINUS SIGN (U+2212)", char: "−" },
  { name: "SMALL EM DASH (U+FE58)", char: "﹘" },
  { name: "SMALL HYPHEN-MINUS (U+FE63)", char: "﹣" },
  { name: "FULLWIDTH HYPHEN-MINUS (U+FF0D)", char: "－" },
];

describe("isExactOrDashVariantMatch", () => {
  it("returns true for identical strings", () => {
    expect(isExactOrDashVariantMatch("hello", "hello")).toBe(true);
  });

  it("returns true when strings differ only in leading/trailing whitespace", () => {
    expect(isExactOrDashVariantMatch("  hello  ", "hello")).toBe(true);
  });

  it("returns false for completely different strings", () => {
    expect(isExactOrDashVariantMatch("alpha", "beta")).toBe(false);
  });

  it("returns false when either argument is null", () => {
    expect(isExactOrDashVariantMatch(null, "hello")).toBe(false);
    expect(isExactOrDashVariantMatch("hello", null)).toBe(false);
  });

  it("returns false when either argument is undefined", () => {
    expect(isExactOrDashVariantMatch(undefined, "hello")).toBe(false);
    expect(isExactOrDashVariantMatch("hello", undefined)).toBe(false);
  });

  it("returns false when either argument is empty string", () => {
    expect(isExactOrDashVariantMatch("", "hello")).toBe(false);
    expect(isExactOrDashVariantMatch("hello", "")).toBe(false);
  });

  it("returns false when both arguments are empty", () => {
    expect(isExactOrDashVariantMatch("", "")).toBe(false);
  });

  // Each Unicode dash variant should match the canonical ASCII hyphen-minus form
  for (const { name, char } of DASH_VARIANTS) {
    it(`normalizes ${name} to ASCII hyphen-minus`, () => {
      expect(isExactOrDashVariantMatch(`word${char}end`, "word-end")).toBe(true);
    });

    it(`normalizes ${name} symmetrically`, () => {
      expect(isExactOrDashVariantMatch("word-end", `word${char}end`)).toBe(true);
    });
  }

  it("normalizes two different dash variants to match each other", () => {
    // EN DASH vs EM DASH — both normalize to hyphen-minus
    expect(isExactOrDashVariantMatch("word–end", "word—end")).toBe(true);
  });

  it("returns false for strings that differ beyond dash variants", () => {
    expect(isExactOrDashVariantMatch("alpha-foo", "alpha-bar")).toBe(false);
  });
});

describe("isExactOrDashVariantPrefixMatch", () => {
  it("returns true when prefix exactly equals value", () => {
    expect(isExactOrDashVariantPrefixMatch("hello", "hello")).toBe(true);
  });

  it("returns true when prefix is a word-boundary prefix of value", () => {
    expect(isExactOrDashVariantPrefixMatch("hello", "hello world")).toBe(true);
  });

  it("returns false when prefix is a mid-word prefix of value", () => {
    // "hell" is a prefix of "hello" but 'o' is alphanumeric — not a word boundary
    expect(isExactOrDashVariantPrefixMatch("hell", "hello")).toBe(false);
  });

  it("returns true when prefix matches after dash-variant normalization at word boundary", () => {
    // "word–end" normalizes to "word-end"; value is "word-end more"
    expect(isExactOrDashVariantPrefixMatch("word–end", "word-end more")).toBe(true);
  });

  it("returns false when normalized prefix runs into alphanumeric in value", () => {
    // prefix "word-en" normalized to "word-en"; "word-endX" — 'X' is alpha so not a boundary
    expect(isExactOrDashVariantPrefixMatch("word-en", "word-endX")).toBe(false);
  });

  it("returns true when prefix equals value after dash normalization", () => {
    expect(isExactOrDashVariantPrefixMatch("word—end", "word-end")).toBe(true);
  });

  it("returns false when prefix is null", () => {
    expect(isExactOrDashVariantPrefixMatch(null, "hello")).toBe(false);
  });

  it("returns false when value is null", () => {
    expect(isExactOrDashVariantPrefixMatch("hello", null)).toBe(false);
  });

  it("returns false when prefix is undefined", () => {
    expect(isExactOrDashVariantPrefixMatch(undefined, "hello")).toBe(false);
  });

  it("returns false when value is undefined", () => {
    expect(isExactOrDashVariantPrefixMatch("hello", undefined)).toBe(false);
  });

  it("returns false when prefix is empty string", () => {
    expect(isExactOrDashVariantPrefixMatch("", "hello")).toBe(false);
  });

  it("returns false when value is empty string", () => {
    expect(isExactOrDashVariantPrefixMatch("hello", "")).toBe(false);
  });

  it("returns false when prefix is longer than value after normalization", () => {
    expect(isExactOrDashVariantPrefixMatch("long prefix here", "short")).toBe(false);
  });

  it("returns true when prefix matches at end of value (no next char)", () => {
    // prefix == value exactly — the nextChar is undefined, which satisfies word-boundary
    expect(isExactOrDashVariantPrefixMatch("exact", "exact")).toBe(true);
  });

  for (const { name, char } of DASH_VARIANTS) {
    it(`prefix-normalizes ${name} correctly at word boundary`, () => {
      // prefix uses Unicode dash, value uses ASCII hyphen-minus + space continuation
      expect(isExactOrDashVariantPrefixMatch(`start${char}mid`, "start-mid rest")).toBe(true);
    });
  }
});
