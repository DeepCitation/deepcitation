import { describe, expect, it, jest } from "@jest/globals";
import {
  generateCitationKey,
  generateCitationInstanceId,
  getCitationDisplayText,
  getCitationKeySpanText,
  classNames,
  CITATION_X_PADDING,
  CITATION_Y_PADDING,
} from "../react/utils.js";
import type { Citation } from "../types/citation.js";

describe("react utils", () => {
  const citation: Citation = {
    attachmentId: "file-1",
    pageNumber: 4,
    fullPhrase: "Hello",
    keySpan: "$10",
    citationNumber: 2,
    lineIds: [1, 2],
  };

  it("generates deterministic keys", () => {
    const key = generateCitationKey(citation);
    expect(key).toHaveLength(16);
    expect(generateCitationKey({ ...citation, keySpan: "$11" })).not.toBe(key);
  });

  it("creates unique instance ids with a random suffix", () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.123456789);
    const key = "key-123";
    const expectedSuffix = (0.123456789).toString(36).substr(2, 9);
    expect(generateCitationInstanceId(key)).toBe(`${key}-${expectedSuffix}`);
    randomSpy.mockRestore();
  });

  it("returns display and value text based on merge option", () => {
    expect(getCitationDisplayText(citation)).toBe("$10");
    expect(getCitationDisplayText(citation, { hideKeySpan: true })).toBe(
      "2"
    );
    expect(
      getCitationDisplayText(
        { ...citation, keySpan: null },
        { hideKeySpan: false }
      )
    ).toBe("2");
    expect(getCitationKeySpanText(citation)).toBe("");
    expect(getCitationKeySpanText(citation, { hideKeySpan: true })).toBe("$10");
  });

  it("joins class names safely", () => {
    expect(classNames("a", false, null, "b")).toBe("a b");
  });

  it("exposes default padding constants", () => {
    expect(CITATION_X_PADDING).toBe(4);
    expect(CITATION_Y_PADDING).toBe(1);
  });
});
