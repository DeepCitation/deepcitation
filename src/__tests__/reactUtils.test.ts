import { describe, expect, it, spyOn } from "bun:test";
import {
  CITATION_X_PADDING,
  CITATION_Y_PADDING,
  classNames,
  generateCitationInstanceId,
  getCitationClaimText,
  getCitationNumber,
  getCitationSourceMatch,
  truncateMiddle,
} from "../react/utils.js";
import type { Citation } from "../types/citation.js";
import { isUrlCitation } from "../types/citation.js";
import { getCitationKey } from "../utils/citationKey.js";

describe("react utils", () => {
  const citation: Citation = {
    attachmentId: "file-1",
    pageNumber: 4,
    sourceContext: "Hello",
    sourceMatch: "$10",
    citationNumber: 2,
    lineIds: [1, 2],
  };

  it("generates deterministic keys", () => {
    const key = getCitationKey(citation);
    expect(key).toHaveLength(16);
    expect(getCitationKey({ ...citation, sourceMatch: "$11" })).not.toBe(key);
  });

  it("creates unique instance ids with a random suffix", () => {
    const randomSpy = spyOn(Math, "random").mockReturnValue(0.123456789);
    const key = "key-123";
    const expectedSuffix = (0.123456789).toString(36).substr(2, 9);
    expect(generateCitationInstanceId(key)).toBe(`${key}-${expectedSuffix}`);
    randomSpy.mockRestore();
  });

  it("returns display text (sourceMatch with fallback to number)", () => {
    // sourceMatch is preferred
    expect(getCitationClaimText(citation)).toBe("$10");
    // Falls back to citationNumber when no sourceMatch
    expect(getCitationClaimText({ ...citation, sourceMatch: null })).toBe("2");
    // Falls back to "1" when neither sourceMatch nor citationNumber
    expect(
      getCitationClaimText({
        ...citation,
        sourceMatch: null,
        citationNumber: undefined,
      }),
    ).toBe("1");
    // Can use custom fallback
    expect(
      getCitationClaimText({ ...citation, sourceMatch: null, citationNumber: undefined }, { fallbackText: "N/A" }),
    ).toBe("N/A");
  });

  it("returns citation number", () => {
    expect(getCitationNumber(citation)).toBe("2");
    // Falls back to "1" when no citationNumber
    expect(getCitationNumber({ ...citation, citationNumber: undefined })).toBe("1");
  });

  it("returns sourceMatch text", () => {
    expect(getCitationSourceMatch(citation)).toBe("$10");
    // Returns empty string when no sourceMatch
    expect(getCitationSourceMatch({ ...citation, sourceMatch: null })).toBe("");
  });

  it("joins class names safely", () => {
    expect(classNames("a", false, null, "b")).toBe("a b");
  });

  it("exposes default padding constants", () => {
    expect(CITATION_X_PADDING).toBe(4);
    expect(CITATION_Y_PADDING).toBe(1);
  });

  describe("isUrlCitation", () => {
    it("returns true when citation has a URL string", () => {
      const urlCitation: Citation = {
        type: "url",
        sourceContext: "Test",
        url: "https://example.com",
      };
      expect(isUrlCitation(urlCitation)).toBe(true);
    });

    it("returns false when citation has no URL", () => {
      const citation: Citation = {
        sourceContext: "Test",
        pageNumber: 1,
      };
      expect(isUrlCitation(citation)).toBe(false);
    });

    it("returns false when URL is undefined", () => {
      const citation = { sourceContext: "Test" } as Citation;
      expect(isUrlCitation(citation)).toBe(false);
    });
  });

  describe("getCitationKey with URL citation", () => {
    it("includes URL fields in key generation for URL citation", () => {
      const urlCitation: Citation = {
        type: "url",
        sourceContext: "Test phrase",
        url: "https://example.com/page",
        title: "Example Page",
        domain: "example.com",
      };

      const key = getCitationKey(urlCitation);
      expect(key).toHaveLength(16);

      // Different URL should produce different key
      const differentUrl: Citation = {
        ...urlCitation,
        url: "https://other.com/page",
      };
      expect(getCitationKey(differentUrl)).not.toBe(key);
    });

    it("generates same key for identical URL citation", () => {
      const urlCitation: Citation = {
        type: "url",
        sourceContext: "Revenue grew",
        url: "https://example.com/report",
        title: "Q4 Report",
      };

      expect(getCitationKey(urlCitation)).toBe(getCitationKey(urlCitation));
    });
  });

  describe("truncateMiddle", () => {
    it("returns the original string when within maxLength", () => {
      expect(truncateMiddle("abcde", 5)).toBe("abcde");
      expect(truncateMiddle("abcde", 10)).toBe("abcde");
    });

    it("truncates in the middle with ellipsis", () => {
      expect(truncateMiddle("abcdefgh", 5)).toBe("ab…gh");
      expect(truncateMiddle("abcdefgh", 4)).toBe("a…gh");
    });

    it("handles maxLength=2", () => {
      expect(truncateMiddle("abcde", 2)).toBe("…e");
    });

    it("handles maxLength=1", () => {
      expect(truncateMiddle("abcde", 1)).toBe("…");
    });

    it("handles maxLength=0", () => {
      expect(truncateMiddle("abcde", 0)).toBe("");
    });

    it("handles negative maxLength", () => {
      expect(truncateMiddle("abcde", -1)).toBe("");
    });

    it("handles empty string", () => {
      expect(truncateMiddle("", 5)).toBe("");
    });
  });
});
