/**
 * Tests for normalizeScreenshotSrc() — input validation for screenshot data
 * Addresses PR review requirement for test coverage of security validation logic.
 */

import { describe, expect, it } from "bun:test";
import { normalizeScreenshotSrc } from "../react/CitationComponent";

describe("normalizeScreenshotSrc", () => {
	describe("Valid inputs", () => {
		it("should accept valid data URI and return as-is", () => {
			const dataUri = "data:image/jpeg;base64,abc123DEF456";
			expect(normalizeScreenshotSrc(dataUri)).toBe(dataUri);
		});

		it("should accept data URI with different image types", () => {
			const pngUri = "data:image/png;base64,iVBORw0KGgoAAAANS";
			expect(normalizeScreenshotSrc(pngUri)).toBe(pngUri);
		});

		it("should convert raw base64 to data URI", () => {
			const rawBase64 = "abc123DEF456+/==";
			const expected = "data:image/jpeg;base64,abc123DEF456+/==";
			expect(normalizeScreenshotSrc(rawBase64)).toBe(expected);
		});

		it("should handle base64 without padding", () => {
			const rawBase64 = "VGVzdA";
			const expected = "data:image/jpeg;base64,VGVzdA";
			expect(normalizeScreenshotSrc(rawBase64)).toBe(expected);
		});

		it("should handle base64 with single padding char", () => {
			const rawBase64 = "VGVzdDE=";
			const expected = "data:image/jpeg;base64,VGVzdDE=";
			expect(normalizeScreenshotSrc(rawBase64)).toBe(expected);
		});

		it("should handle base64 with double padding chars", () => {
			const rawBase64 = "VGVz==";
			const expected = "data:image/jpeg;base64,VGVz==";
			expect(normalizeScreenshotSrc(rawBase64)).toBe(expected);
		});
	});

	describe("Invalid inputs", () => {
		it("should throw on empty string", () => {
			expect(() => normalizeScreenshotSrc("")).toThrow("expected non-empty string");
		});

		it("should throw on null input", () => {
			// biome-ignore lint/suspicious/noExplicitAny: Testing invalid input
			expect(() => normalizeScreenshotSrc(null as any)).toThrow("expected non-empty string");
		});

		it("should throw on undefined input", () => {
			// biome-ignore lint/suspicious/noExplicitAny: Testing invalid input
			expect(() => normalizeScreenshotSrc(undefined as any)).toThrow("expected non-empty string");
		});

		it("should throw on non-string input (number)", () => {
			// biome-ignore lint/suspicious/noExplicitAny: Testing invalid input
			expect(() => normalizeScreenshotSrc(123 as any)).toThrow("expected non-empty string");
		});

		it("should throw on non-string input (object)", () => {
			// biome-ignore lint/suspicious/noExplicitAny: Testing invalid input
			expect(() => normalizeScreenshotSrc({} as any)).toThrow("expected non-empty string");
		});
	});

	describe("Security: Invalid base64 format", () => {
		it("should throw on HTML/script injection attempt", () => {
			expect(() => normalizeScreenshotSrc("<script>alert(1)</script>")).toThrow(
				"Invalid base64 format detected",
			);
		});

		it("should throw on string with special characters", () => {
			expect(() => normalizeScreenshotSrc("abc!@#$%^&*()")).toThrow("Invalid base64 format detected");
		});

		it("should throw on string with newlines", () => {
			expect(() => normalizeScreenshotSrc("abc\ndef")).toThrow("Invalid base64 format detected");
		});

		it("should throw on string with spaces", () => {
			expect(() => normalizeScreenshotSrc("abc def")).toThrow("Invalid base64 format detected");
		});

		it("should throw on base64 with invalid characters mixed in", () => {
			expect(() => normalizeScreenshotSrc("VGVz~dA==")).toThrow("Invalid base64 format detected");
		});
	});

	describe("Edge cases", () => {
		it("should validate only first 100 chars (prevent ReDoS)", () => {
			// Valid base64 in first 100 chars, but invalid after
			const validStart = "A".repeat(100);
			const invalidEnd = "<script>alert(1)</script>";
			const input = validStart + invalidEnd;

			// Should pass validation since only first 100 chars are checked
			const result = normalizeScreenshotSrc(input);
			expect(result).toBe(`data:image/jpeg;base64,${input}`);
		});

		it("should handle very long valid base64 strings", () => {
			const longBase64 = "A".repeat(10000);
			const result = normalizeScreenshotSrc(longBase64);
			expect(result).toBe(`data:image/jpeg;base64,${longBase64}`);
		});
	});
});
