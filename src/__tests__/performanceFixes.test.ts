/**
 * Tests for performance fixes identified in PERFORMANCE_ANALYSIS.md
 *
 * These tests verify:
 * 1. Global regex state bug fix (parseWorkAround.ts)
 * 2. Loop iteration corruption fix (normalizeCitation.ts)
 * 3. Citations without attachmentId warning (DeepCitation.ts)
 * 4. Regex cache for attribute extraction (parseCitation.ts)
 * 5. String concatenation fix (diff.ts splitLines)
 * 6. Unshift optimization (diff.ts backtrack)
 * 7. Sequential string replacement optimization (normalizeCitation.ts)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanRepeatingLastSentence } from "../parsing/parseWorkAround.js";
import { normalizeCitations } from "../parsing/normalizeCitation.js";
import { getAllCitationsFromLlmOutput } from "../parsing/parseCitation.js";
import { diffLines, diffWordsWithSpace } from "../utils/diff.js";

describe("Performance Fixes", () => {
  describe("Global Regex State Bug Fix (parseWorkAround.ts)", () => {
    it("should correctly find sentence endings on multiple consecutive calls", () => {
      // This was failing before the fix because the global regex maintained
      // its lastIndex state between function calls
      const text = "Hello world. This is a test. More content here.";

      // Call the function multiple times - each should work independently
      const result1 = cleanRepeatingLastSentence(text);
      const result2 = cleanRepeatingLastSentence(text);
      const result3 = cleanRepeatingLastSentence(text);

      // All calls should return the same result
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(text); // No repetition, should return unchanged
    });

    it("should detect repeating sentences consistently across calls", () => {
      // Test with actual repetition
      const repeatingText =
        "This is content. This is a repeated sentence. This is a repeated sentence. This is a repeated sentence.";

      const result1 = cleanRepeatingLastSentence(repeatingText);
      const result2 = cleanRepeatingLastSentence(repeatingText);

      // Both calls should detect the repetition
      expect(result1).toBe(result2);
      expect(result1).toBe(
        "This is content. This is a repeated sentence."
      );
    });
  });

  describe("Loop Iteration Corruption Fix (normalizeCitation.ts)", () => {
    it("should handle duplicate unclosed citation tags", () => {
      // This was failing when the same unclosed citation appeared multiple times
      // because .replace() only replaced the first occurrence
      const input = `
        Some text <cite attachment_id='abc123' full_phrase='test1' anchor_text='test1' line_ids='1'> and more text
        <cite attachment_id='abc123' full_phrase='test2' anchor_text='test2' line_ids='2'> end text
      `.trim();

      const result = normalizeCitations(input);

      // Both citations should be converted to self-closing
      const selfClosingCount = (result.match(/\/>/g) || []).length;
      expect(selfClosingCount).toBeGreaterThanOrEqual(2);
    });

    it("should handle identical citation tags", () => {
      // Test with identical citations (same content)
      const input = `
        Text <cite attachment_id='abc123' full_phrase='same' anchor_text='same' line_ids='1'>
        More <cite attachment_id='abc123' full_phrase='same' anchor_text='same' line_ids='1'>
      `.trim();

      const result = normalizeCitations(input);

      // Both should be converted
      const selfClosingCount = (result.match(/\/>/g) || []).length;
      expect(selfClosingCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Regex Cache for Attribute Extraction (parseCitation.ts)", () => {
    it("should correctly parse citations with all attribute variations", () => {
      // Test that the regex cache works correctly for different attribute names
      const citationText = `
        <cite attachment_id='abc123' start_page_key='page_number_1_index_0' full_phrase='Test phrase' anchor_text='Test' line_ids='1' />
        <cite attachmentId='def456' startPageKey='page_number_2_index_0' fullPhrase='Another phrase' anchorText='Another' lineIds='2' />
        <cite file_id='ghi789' start_page_key='page_number_3_index_0' full_phrase='Third phrase' anchor_text='Third' line_ids='3' />
      `;

      const citations = getAllCitationsFromLlmOutput(citationText);

      // All three citations should be parsed
      expect(Object.keys(citations).length).toBe(3);
    });

    it("should handle many citations efficiently", () => {
      // Generate many citations to test performance
      const citations: string[] = [];
      for (let i = 0; i < 100; i++) {
        citations.push(
          `<cite attachment_id='att${i}' start_page_key='page_number_${i}_index_0' full_phrase='Phrase ${i}' anchor_text='Key ${i}' line_ids='${i}' />`
        );
      }
      const text = citations.join("\n");

      const startTime = performance.now();
      const result = getAllCitationsFromLlmOutput(text);
      const endTime = performance.now();

      expect(Object.keys(result).length).toBe(100);
      // Should complete in reasonable time (< 500ms for 100 citations)
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe("Diff Algorithm Optimizations (diff.ts)", () => {
    describe("splitLines optimization", () => {
      it("should correctly split lines with Unix line endings", () => {
        const text = "line1\nline2\nline3";
        const result = diffLines(text, text);

        // No changes expected
        expect(result.every((c) => !c.added && !c.removed)).toBe(true);
      });

      it("should correctly split lines with Windows line endings", () => {
        const text = "line1\r\nline2\r\nline3";
        const result = diffLines(text, text);

        // No changes expected
        expect(result.every((c) => !c.added && !c.removed)).toBe(true);
      });

      it("should handle empty strings", () => {
        const result = diffLines("", "new content");

        expect(result.some((c) => c.added)).toBe(true);
      });

      it("should handle lines without trailing newline", () => {
        const result = diffLines("line1\nline2", "line1\nline2\nline3");

        // Should detect the added line
        expect(result.some((c) => c.added && c.value.includes("line3"))).toBe(
          true
        );
      });
    });

    describe("backtrack optimization (push + reverse)", () => {
      it("should produce correct diff results for additions", () => {
        const result = diffWordsWithSpace("hello", "hello world");

        // Should have unchanged "hello" and added " world"
        expect(result.some((c) => !c.added && !c.removed && c.value.includes("hello"))).toBe(
          true
        );
        expect(result.some((c) => c.added && c.value.includes("world"))).toBe(
          true
        );
      });

      it("should produce correct diff results for removals", () => {
        const result = diffWordsWithSpace("hello world", "hello");

        // Should have unchanged "hello" and removed " world"
        expect(result.some((c) => !c.added && !c.removed && c.value.includes("hello"))).toBe(
          true
        );
        expect(result.some((c) => c.removed && c.value.includes("world"))).toBe(
          true
        );
      });

      it("should produce correct diff results for replacements", () => {
        const result = diffWordsWithSpace("hello world", "hello universe");

        // Should have unchanged "hello", removed "world", added "universe"
        expect(result.some((c) => c.removed && c.value.includes("world"))).toBe(
          true
        );
        expect(result.some((c) => c.added && c.value.includes("universe"))).toBe(
          true
        );
      });

      it("should handle large diffs efficiently", () => {
        // Create large strings to test performance
        const oldWords = Array(1000)
          .fill(null)
          .map((_, i) => `word${i}`)
          .join(" ");
        const newWords = Array(1000)
          .fill(null)
          .map((_, i) => `word${i + 1}`)
          .join(" ");

        const startTime = performance.now();
        const result = diffWordsWithSpace(oldWords, newWords);
        const endTime = performance.now();

        // Should complete in reasonable time
        expect(endTime - startTime).toBeLessThan(1000);
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Sequential String Replacement Optimization (normalizeCitation.ts)", () => {
    it("should correctly decode HTML entities", () => {
      const input = `<cite attachment_id='abc' full_phrase='Test &quot;quoted&quot; and &apos;apostrophe&apos; with &lt;tag&gt; and &amp;' anchor_text='Test' line_ids='1' />`;

      const result = normalizeCitations(input);

      // HTML entities should be decoded
      expect(result).not.toContain("&quot;");
      expect(result).not.toContain("&apos;");
      expect(result).not.toContain("&lt;");
      expect(result).not.toContain("&gt;");
      expect(result).not.toContain("&amp;");
    });

    it("should handle newlines in attribute content", () => {
      const input = `<cite attachment_id='abc' full_phrase='Line1
Line2
Line3' anchor_text='Test' line_ids='1' />`;

      const result = normalizeCitations(input);

      // Newlines should be flattened to spaces
      expect(result).not.toMatch(/full_phrase='[^']*\n[^']*'/);
    });

    it("should remove markdown markers from content", () => {
      const input = `<cite attachment_id='abc' full_phrase='**bold** and __underline__ text' anchor_text='Test' line_ids='1' />`;

      const result = normalizeCitations(input);

      // Markdown markers should be removed
      expect(result).not.toContain("**");
      expect(result).not.toContain("__");
    });

    it("should properly escape quotes", () => {
      const input = `<cite attachment_id='abc' full_phrase='Text with "double" and single quotes' anchor_text='Test' line_ids='1' />`;

      const result = normalizeCitations(input);

      // Quotes should be escaped
      expect(result).toMatch(/full_phrase='[^']*\\"/);
    });
  });
});

describe("Data Loss Fix - Citations Without AttachmentId", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("should parse citations without attachmentId", () => {
    // Citations without attachmentId should still be parsed
    const text = `<cite full_phrase='Test phrase without attachment' anchor_text='Test' line_ids='1' />`;

    const result = getAllCitationsFromLlmOutput(text);

    // Citation should be parsed even without attachmentId
    expect(Object.keys(result).length).toBe(1);
    const citation = Object.values(result)[0];
    expect(citation.fullPhrase).toBe("Test phrase without attachment");
    expect(citation.attachmentId).toBeUndefined();
  });
});
