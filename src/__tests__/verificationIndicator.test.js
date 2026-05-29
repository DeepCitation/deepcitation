import { describe, expect, it } from "bun:test";
import { getVerificationTextIndicator } from "../utils/verificationIndicator.js";
describe("getVerificationTextIndicator", () => {
    it("returns unknown indicator for null (no verification data)", () => {
        expect(getVerificationTextIndicator(null)).toBe("◌");
    });
    it("returns unknown indicator for undefined (no verification data)", () => {
        expect(getVerificationTextIndicator(undefined)).toBe("◌");
    });
    it("returns pending indicator for explicit pending status", () => {
        const v = { status: "pending" };
        expect(getVerificationTextIndicator(v)).toBe("⌛");
    });
    it("returns miss indicator for not_found", () => {
        const v = { status: "not_found" };
        expect(getVerificationTextIndicator(v)).toBe("❌");
    });
    it("returns verified indicator for exact match", () => {
        const v = { status: "found" };
        expect(getVerificationTextIndicator(v)).toBe("☑️");
    });
    it("returns partial indicator for partial match status", () => {
        const v = { status: "found_source_match_only" };
        expect(getVerificationTextIndicator(v)).toBe("✅");
    });
});
