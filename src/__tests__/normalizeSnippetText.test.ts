import { describe, expect, it } from "@jest/globals";
import { normalizeSnippetText } from "../react/utils.js";

describe("normalizeSnippetText", () => {
  describe("with reference text (sourceContext-guided)", () => {
    it("fixes the full garbled Brown v. Board snippet", () => {
      const garbled = 'doctrineof"separatebutequal" hasnoplace.Separateeducationalfacilitiesareinherentlyunequal.';
      const ref =
        'the doctrine of "separate but equal" has no place. Separate educational facilities are inherently unequal.';
      const result = normalizeSnippetText(garbled, ref);
      expect(result).toBe(
        'doctrine of "separate but equal" has no place. Separate educational facilities are inherently unequal.',
      );
    });

    it("fixes punctuation-capital joins with reference", () => {
      expect(normalizeSnippetText("overruled.We return", "overruled. We return")).toBe("overruled. We return");
    });

    it("fixes quote boundaries with reference", () => {
      expect(normalizeSnippetText('"equal"has', '"equal" has')).toBe('"equal" has');
    });

    it("does not modify clean text even with reference", () => {
      const clean = "Revenue grew 45%";
      expect(normalizeSnippetText(clean, "Revenue grew 45% year-over-year")).toBe(clean);
    });

    it("falls through to regex when reference doesn't overlap", () => {
      // No overlap → regex phase handles the period+uppercase
      expect(normalizeSnippetText("hasnoplace.Separate", "completely different")).toBe("hasnoplace. Separate");
    });
  });

  describe("without reference (regex heuristics only)", () => {
    it("inserts space between lowercase-uppercase joins", () => {
      expect(normalizeSnippetText("educationalFacilities")).toBe("educational Facilities");
      expect(normalizeSnippetText("separateButEqual")).toBe("separate But Equal");
    });

    it("inserts space after punctuation followed by uppercase", () => {
      expect(normalizeSnippetText("overruled.We return")).toBe("overruled. We return");
      expect(normalizeSnippetText("hasnoplace.Separate")).toBe("hasnoplace. Separate");
    });

    it("inserts space between letter+quote+letter", () => {
      expect(normalizeSnippetText('equal"has')).toBe('equal" has');
      // Both quote boundaries get spaced: e"w → e" w and d"n → d" n
      expect(normalizeSnippetText('the"word"next')).toBe('the" word" next');
    });

    it("does not modify clean text", () => {
      expect(normalizeSnippetText("Revenue grew 45% year-over-year to $2.3B")).toBe(
        "Revenue grew 45% year-over-year to $2.3B",
      );
    });

    it("does not modify normal sentences with proper spacing", () => {
      expect(normalizeSnippetText("The court held that Section 4(b) was unconstitutional.")).toBe(
        "The court held that Section 4(b) was unconstitutional.",
      );
    });

    it("handles empty string", () => {
      expect(normalizeSnippetText("")).toBe("");
    });
  });

  describe("real-world garbled snippets from Round 3 QA", () => {
    it("fixes Citizens United 'found' snippet when stripped text matches reference", () => {
      // When the garbled snippet (without spaces) is a substring of the reference (without spaces),
      // reference-guided normalization kicks in. If not, regex heuristics apply.
      const garbled = "overruled.Wereturntotheprinciple";
      const ref = "overruled. We return to the principle established in Buckley";
      const result = normalizeSnippetText(garbled, ref);
      expect(result).toBe("overruled. We return to the principle");
    });

    it("applies regex heuristics when reference doesn't match", () => {
      // Truncated word means stripped forms differ → falls through to regex
      const garbled = "tolimitcorporateindependentexpendi overruled.Wereturn";
      const ref = "to limit corporate independent expenditures overruled. We return";
      const result = normalizeSnippetText(garbled, ref);
      // Regex catches period+uppercase
      expect(result).toContain(". Wereturn");
    });
  });
});
