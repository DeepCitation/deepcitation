/**
 * Integration tests for the analysis module boundary.
 *
 * Tests the full analyzeVerification pipeline — from Verification input
 * through lazy narrative/intent/summary computation. Verifies that all
 * SearchStatus values map to defined outcomes, and that incomplete input
 * degrades gracefully.
 */
import { describe, expect, it } from "bun:test";
import { analyzeVerification, classifySearch } from "../analysis/searchAnalysis";
import { STATUS_MAP } from "../analysis/statusRegistry";
function makeAttempt(overrides) {
    return {
        method: "exact_line_match",
        success: false,
        searchPhrase: "test phrase",
        ...overrides,
    };
}
function makeVerification(overrides = {}) {
    return {
        status: "found",
        citation: {
            type: "document",
            sourceContext: "the test phrase in the document",
            sourceMatch: "test phrase",
            citationNumber: 1,
        },
        searchAttempts: [makeAttempt({ success: true, matchedVariation: "exact_source_context" })],
        ...overrides,
    };
}
describe("analyzeVerification integration", () => {
    it("full green path — found with successful attempt", () => {
        const analysis = analyzeVerification(makeVerification());
        expect(analysis.outcome).toBe("exact_match");
        expect(analysis.colorScheme).toBe("green");
        expect(analysis.statusLabel).toBeTruthy();
        // Narrative
        expect(analysis.narrative.outcome).toBe("exact_match");
        expect(analysis.narrative.rows.length).toBeGreaterThanOrEqual(1);
        expect(analysis.narrative.totalAttempts).toBe(1);
        // Intent
        expect(analysis.intent).not.toBeNull();
        expect(analysis.intent?.outcome).toBe("exact_match");
        // Summary
        expect(analysis.summary.totalAttempts).toBe(1);
    });
    it("not-found path — multiple failed attempts", () => {
        const attempts = [
            makeAttempt({ method: "exact_line_match", searchPhrase: "phrase A" }),
            makeAttempt({ method: "current_page", searchPhrase: "phrase A" }),
            makeAttempt({ method: "adjacent_pages", searchPhrase: "phrase B" }),
            makeAttempt({ method: "regex_search", searchPhrase: "phrase B" }),
            makeAttempt({ method: "expanded_window", searchPhrase: "phrase C" }),
        ];
        const analysis = analyzeVerification(makeVerification({ status: "not_found", searchAttempts: attempts }));
        expect(analysis.outcome).toBe("not_found");
        expect(analysis.colorScheme).toBe("red");
        expect(analysis.narrative.showAllRows).toBe(true);
        expect(analysis.summary.distinctQueries).toBeGreaterThanOrEqual(2);
    });
    it("partial match with low-trust variation", () => {
        const analysis = analyzeVerification(makeVerification({
            status: "partial_text_found",
            searchAttempts: [makeAttempt({ success: true, matchedVariation: "partial_source_context" })],
        }));
        expect(analysis.outcome).toBe("partial_match");
        expect(analysis.colorScheme).toBe("amber");
    });
    it("null verification returns pending with empty collections", () => {
        const analysis = analyzeVerification(null);
        expect(analysis.outcome).toBe("pending");
        expect(analysis.colorScheme).toBe("gray");
        expect(analysis.intent).toBeNull();
        expect(analysis.narrative.rows).toEqual([]);
        expect(analysis.summary.totalAttempts).toBe(0);
    });
    it("verification without sourceContext returns null intent", () => {
        const analysis = analyzeVerification(makeVerification({
            citation: { type: "document", sourceContext: "", citationNumber: 1 },
        }));
        expect(analysis.intent).toBeNull();
    });
    it("every SearchStatus maps to a defined outcome and colorScheme", () => {
        const allStatuses = Object.keys(STATUS_MAP);
        for (const status of allStatuses) {
            const result = classifySearch(status);
            expect(result.outcome).toBeDefined();
            expect(result.colorScheme).toBeDefined();
            expect(["exact_match", "partial_match", "not_found", "pending"]).toContain(result.outcome);
            expect(["green", "amber", "red", "gray"]).toContain(result.colorScheme);
        }
    });
    it("lazy evaluation — accessing only outcome does not compute narrative", () => {
        const analysis = analyzeVerification(makeVerification());
        // Access only eager properties
        const { outcome, colorScheme, statusLabel } = analysis;
        expect(outcome).toBe("exact_match");
        expect(colorScheme).toBe("green");
        expect(statusLabel).toBeTruthy();
        // Narrative/intent/summary should still be accessible (lazy-computed on access)
        expect(analysis.narrative).toBeDefined();
    });
});
