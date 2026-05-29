import { describe, expect, it } from "bun:test";
import { fuzzyAnchorRange } from "../utils/fuzzyAnchor";
describe("fuzzyAnchorRange", () => {
    // ==========================================================================
    // BASIC MATCHING
    // ==========================================================================
    describe("basic matching", () => {
        it("finds anchor at start of phrase", () => {
            const result = fuzzyAnchorRange("brown fox jumps over the lazy dog", "brown fox");
            expect(result).toEqual({ start: 0, end: 9 });
        });
        it("finds anchor in the middle of a phrase", () => {
            const result = fuzzyAnchorRange("The quick brown fox jumps over the lazy dog", "brown fox");
            expect(result).toEqual({ start: 10, end: 19 });
        });
        it("finds anchor at end of phrase", () => {
            const result = fuzzyAnchorRange("The quick brown fox", "brown fox");
            expect(result).toEqual({ start: 10, end: 19 });
        });
        it("is case-insensitive", () => {
            const result = fuzzyAnchorRange("Includes Business Associate Agreement and more", "business associate agreement");
            expect(result).not.toBeNull();
            expect(result?.start).toBe(9); // "Business" starts at 9
        });
    });
    // ==========================================================================
    // INLINE CITATION INSERTIONS
    // Handles PDF text that has inserted inline references breaking exact match.
    // e.g. anchor="retrieval failure and generation bottleneck" in
    //      text="retrieval failure (§6.1) and generation bottleneck (§6.2)"
    // ==========================================================================
    describe("inline citation insertions", () => {
        it("finds anchor across inserted inline citations like (§6.1)", () => {
            const result = fuzzyAnchorRange("retrieval failure (§6.1) and generation bottleneck (§6.2)", "retrieval failure and generation bottleneck");
            expect(result).not.toBeNull();
            expect(result?.start).toBe(0);
            expect(result?.end).toBeGreaterThan(40);
        });
    });
    // ==========================================================================
    // OCR WORD-SPLIT ARTIFACTS
    // PDF OCR can split a word into fragments: "Business Asso ciate Agreement"
    // (the word "Associate" becomes "Asso ciate" with an extra space).
    //
    // fuzzyAnchorRange works word-by-word via indexOf. If an anchor word is
    // OCR-split ("associate" → "asso ciate"), it is NOT found as a substring.
    // The function falls back on the 60% threshold: if enough OTHER words in the
    // anchor are found, it still returns the spanning range.
    // ==========================================================================
    describe("OCR word-split artifacts (DPA / landing demo fixture)", () => {
        // Source: deepcitation.com/legal/dpa OCR extraction.
        // The word "Associate" is rendered as "Asso ciate" in the OCR output.
        const OCR_SNIPPET = "Includes Business Asso ciate Agreement BAA) and Information Manager Agreement IMA";
        it("finds 3-word anchor when 1 word is OCR-split — 2/3 ≥ 60% threshold", () => {
            // "business" ✓, "associate" ✗ (text has "asso ciate"), "agreement" ✓ → 2/3 = 66.7%
            const result = fuzzyAnchorRange(OCR_SNIPPET, "Business Associate Agreement");
            expect(result).not.toBeNull();
            // Range should start at "Business" (position 9) and end at "Agreement" end (position 38)
            expect(result?.start).toBe(9);
            expect(result?.end).toBe(38);
        });
        it("highlighted slice from 3-word anchor spans the OCR-garbled form", () => {
            const result = fuzzyAnchorRange(OCR_SNIPPET, "Business Associate Agreement");
            expect(result).not.toBeNull();
            const highlighted = OCR_SNIPPET.slice(result?.start, result?.end);
            // The garbled form "Business Asso ciate Agreement" is the expected highlighted text
            expect(highlighted).toBe("Business Asso ciate Agreement");
        });
        it("2-word anchor where the only split word fails — 1/2 = 50% < 60% threshold → null", () => {
            // "associate" ✗ (text has "asso ciate"), "agreement" ✓ → 1/2 = 50% → null
            // This documents a known limitation: a 2-word anchor fails when one word is OCR-split.
            const result = fuzzyAnchorRange(OCR_SNIPPET, "Associate Agreement");
            expect(result).toBeNull();
        });
        it("returns null when no anchor words are found at all", () => {
            const result = fuzzyAnchorRange("completely unrelated text here", "Business Associate");
            expect(result).toBeNull();
        });
    });
    // ==========================================================================
    // SHORT / EDGE CASES
    // ==========================================================================
    describe("edge cases", () => {
        it("returns null for empty anchor", () => {
            expect(fuzzyAnchorRange("some text", "")).toBeNull();
        });
        it("returns null when anchor words are all single characters (filtered out)", () => {
            // Words < 2 chars are excluded from matching
            expect(fuzzyAnchorRange("a b c", "a b")).toBeNull();
        });
        it("returns null when fewer than 60% of anchor words are found", () => {
            // Only "quick" found in "red blue green sky" → 1/3 = 33% < 60%
            expect(fuzzyAnchorRange("a red sky today", "quick brown fox")).toBeNull();
        });
    });
});
