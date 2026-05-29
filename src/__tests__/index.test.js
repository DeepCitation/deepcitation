import { describe, expect, it } from "bun:test";
import { CITATION_X_PADDING, CITATION_Y_PADDING, sha1Hash } from "../index.js";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER, CITATION_PROMPT, wrapCitationPrompt, wrapSystemCitationPrompt, } from "../prompts/citationPrompts.js";
describe("index exports", () => {
    it("re-exports core helpers and constants", () => {
        expect(typeof sha1Hash).toBe("function");
        expect(typeof CITATION_X_PADDING).toBe("number");
        expect(typeof CITATION_Y_PADDING).toBe("number");
    });
});
describe("prompts subpath exports", () => {
    it("exports citation prompt constants", () => {
        expect(typeof CITATION_PROMPT).toBe("string");
        expect(typeof CITATION_DATA_START_DELIMITER).toBe("string");
        expect(typeof CITATION_DATA_END_DELIMITER).toBe("string");
    });
    it("exports citation prompt functions", () => {
        expect(typeof wrapSystemCitationPrompt).toBe("function");
        expect(typeof wrapCitationPrompt).toBe("function");
    });
    it("CITATION_PROMPT includes numeric JSON format markers", () => {
        expect(CITATION_PROMPT).toContain(CITATION_DATA_START_DELIMITER);
        expect(CITATION_PROMPT).toContain("attachment_id");
        expect(CITATION_PROMPT).toContain("source_context");
        expect(CITATION_PROMPT).toContain("source_match");
    });
});
