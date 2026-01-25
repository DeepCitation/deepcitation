import { describe, expect, it } from "@jest/globals";
import {
  normalizeCitations,
  parseCitation,
  sha1Hash,
  CITATION_PROMPT,
  CITATION_DATA_START_DELIMITER,
  CITATION_DATA_END_DELIMITER,
  CITATION_X_PADDING,
  CITATION_Y_PADDING,
  wrapSystemCitationPrompt,
  wrapCitationPrompt,
  parseDeferredCitationResponse,
  getAllCitationsFromDeferredResponse,
} from "../index.js";

describe("index exports", () => {
  it("re-exports core helpers and constants", () => {
    expect(typeof normalizeCitations).toBe("function");
    expect(typeof parseCitation).toBe("function");
    expect(typeof sha1Hash).toBe("function");
    expect(typeof CITATION_PROMPT).toBe("string");
    expect(typeof CITATION_DATA_START_DELIMITER).toBe("string");
    expect(typeof CITATION_DATA_END_DELIMITER).toBe("string");
    expect(typeof CITATION_X_PADDING).toBe("number");
    expect(typeof CITATION_Y_PADDING).toBe("number");
  });

  it("re-exports citation prompt functions", () => {
    expect(typeof wrapSystemCitationPrompt).toBe("function");
    expect(typeof wrapCitationPrompt).toBe("function");
  });

  it("re-exports deferred citation parser functions", () => {
    expect(typeof parseDeferredCitationResponse).toBe("function");
    expect(typeof getAllCitationsFromDeferredResponse).toBe("function");
  });

  it("CITATION_PROMPT includes deferred JSON format markers", () => {
    expect(CITATION_PROMPT).toContain(CITATION_DATA_START_DELIMITER);
    expect(CITATION_PROMPT).toContain("attachment_id");
    expect(CITATION_PROMPT).toContain("full_phrase");
    expect(CITATION_PROMPT).toContain("anchor_text");
  });
});
