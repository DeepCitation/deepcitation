import { describe, expect, it } from "@jest/globals";
import { shouldHighlightAnchorText } from "../drawing/citationDrawing";
import { isValidOverlayGeometry, toPercentRect, wordCount } from "../react/overlayGeometry";
import type { DeepTextItem } from "../types/boxes";

describe("CitationAnnotationOverlay utilities", () => {
  describe("wordCount", () => {
    it("returns 0 for empty string", () => {
      expect(wordCount("")).toBe(0);
    });

    it("returns 0 for whitespace-only string", () => {
      expect(wordCount("   \t\n  ")).toBe(0);
    });

    it("counts single word", () => {
      expect(wordCount("hello")).toBe(1);
    });

    it("counts multiple words", () => {
      expect(wordCount("the quick brown fox")).toBe(4);
    });

    it("handles consecutive whitespace", () => {
      expect(wordCount("a   b\t\tc")).toBe(3);
    });

    it("trims leading/trailing whitespace", () => {
      expect(wordCount("  hello world  ")).toBe(2);
    });

    it("throws on input exceeding 100KB (safeSplit limit)", () => {
      const oversized = "word ".repeat(25_000); // ~125KB
      expect(() => wordCount(oversized)).toThrow("Input too large");
    });
  });

  describe("isValidOverlayGeometry", () => {
    const validScale = { x: 1.5, y: 1.5 };

    it("accepts valid positive dimensions", () => {
      expect(isValidOverlayGeometry(validScale, 800, 600)).toBe(true);
    });

    it("rejects zero scale.x", () => {
      expect(isValidOverlayGeometry({ x: 0, y: 1 }, 800, 600)).toBe(false);
    });

    it("rejects zero scale.y", () => {
      expect(isValidOverlayGeometry({ x: 1, y: 0 }, 800, 600)).toBe(false);
    });

    it("rejects negative scale", () => {
      expect(isValidOverlayGeometry({ x: -1, y: 1 }, 800, 600)).toBe(false);
    });

    it("rejects zero imageNaturalWidth", () => {
      expect(isValidOverlayGeometry(validScale, 0, 600)).toBe(false);
    });

    it("rejects zero imageNaturalHeight", () => {
      expect(isValidOverlayGeometry(validScale, 800, 0)).toBe(false);
    });

    it("rejects NaN scale", () => {
      expect(isValidOverlayGeometry({ x: NaN, y: 1 }, 800, 600)).toBe(false);
    });

    it("rejects Infinity dimensions", () => {
      expect(isValidOverlayGeometry(validScale, Infinity, 600)).toBe(false);
    });

    it("rejects negative Infinity", () => {
      expect(isValidOverlayGeometry(validScale, 800, -Infinity)).toBe(false);
    });
  });

  describe("toPercentRect", () => {
    const scale = { x: 2, y: 2 };
    const imgW = 1000;
    const imgH = 800;

    function makeItem(x: number, y: number, width: number, height: number): DeepTextItem {
      return { x, y, width, height };
    }

    it("converts valid coordinates to percentage strings", () => {
      // x=50, y=400 (PDF bottom-up), w=100, h=25
      // imgX = 50*2 = 100, imgY = 800 - 400*2 = 0, imgW = 100*2 = 200, imgH = 25*2 = 50
      const result = toPercentRect(makeItem(50, 400, 100, 25), scale, imgW, imgH);
      expect(result).toEqual({
        left: "10%", // 100/1000
        top: "0%", // 0/800
        width: "20%", // 200/1000
        height: "6.25%", // 50/800
      });
    });

    it("returns null for zero-dimension image", () => {
      expect(toPercentRect(makeItem(0, 0, 10, 10), scale, 0, imgH)).toBeNull();
    });

    it("returns null for NaN scale", () => {
      expect(toPercentRect(makeItem(0, 0, 10, 10), { x: NaN, y: 2 }, imgW, imgH)).toBeNull();
    });

    it("clamps negative PDF coordinates to zero", () => {
      // x=-50 → imgX = -100 → clamped to 0
      const result = toPercentRect(makeItem(-50, 400, 100, 25), scale, imgW, imgH);
      expect(result).not.toBeNull();
      expect(result?.left).toBe("0%");
    });

    it("clamps coordinates that exceed image bounds", () => {
      // x=450, w=200 → imgX=900, imgRight=1300 → clamped to 1000
      const result = toPercentRect(makeItem(450, 400, 200, 25), scale, imgW, imgH);
      expect(result).not.toBeNull();
      expect(result?.left).toBe("90%"); // 900/1000
      expect(result?.width).toBe("10%"); // (1000-900)/1000, clamped right edge
    });

    it("produces zero-width rect when fully out of bounds", () => {
      // x=600 → imgX=1200 → clamped to 1000
      // w=100 → imgRight=1400 → clamped to 1000
      // width = 1000-1000 = 0
      const result = toPercentRect(makeItem(600, 400, 100, 25), scale, imgW, imgH);
      expect(result).not.toBeNull();
      expect(result?.width).toBe("0%");
    });
  });

  describe("shouldHighlightAnchorText", () => {
    it("returns false for null/undefined inputs", () => {
      expect(shouldHighlightAnchorText(null, "hello world")).toBe(false);
      expect(shouldHighlightAnchorText("hello", null)).toBe(false);
      expect(shouldHighlightAnchorText(undefined, undefined)).toBe(false);
    });

    it("returns true when anchorText equals fullPhrase (visual gate is in computeKeySpanHighlight)", () => {
      expect(shouldHighlightAnchorText("hello world", "hello world")).toBe(true);
    });

    it("returns true when anchorText has more words than fullPhrase", () => {
      expect(shouldHighlightAnchorText("the quick brown fox", "quick brown")).toBe(true);
    });

    it("returns true for 2 words in 3 words", () => {
      expect(shouldHighlightAnchorText("quick brown", "the quick brown")).toBe(true);
    });

    it("returns true for 2 words in 4 words", () => {
      expect(shouldHighlightAnchorText("quick brown", "the quick brown fox")).toBe(true);
    });

    it("returns true for 1 word in 3 words", () => {
      expect(shouldHighlightAnchorText("brown", "the quick brown")).toBe(true);
    });

    it("returns true for 1 word in 2 words", () => {
      expect(shouldHighlightAnchorText("hello", "hello world")).toBe(true);
    });

    it("returns true for 1 word in 1 word (visual distinctness decided downstream)", () => {
      expect(shouldHighlightAnchorText("hello", "world")).toBe(true);
    });

    it("returns false for empty strings", () => {
      expect(shouldHighlightAnchorText("", "hello world")).toBe(false);
      expect(shouldHighlightAnchorText("hello", "")).toBe(false);
    });

    it("returns false for whitespace-only strings", () => {
      expect(shouldHighlightAnchorText("   ", "hello world")).toBe(false);
    });
  });
});
