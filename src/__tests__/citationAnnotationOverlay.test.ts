import { describe, expect, it } from "bun:test";
import { computeBracketTarget, shouldHighlightSourceMatch } from "../drawing/citationDrawing";
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

  describe("shouldHighlightSourceMatch", () => {
    it("returns false for null/undefined inputs", () => {
      expect(shouldHighlightSourceMatch(null, "hello world")).toBe(false);
      expect(shouldHighlightSourceMatch("hello", null)).toBe(false);
      expect(shouldHighlightSourceMatch(undefined, undefined)).toBe(false);
    });

    it("returns true when sourceMatch equals sourceContext (visual gate is in computeKeySpanHighlight)", () => {
      expect(shouldHighlightSourceMatch("hello world", "hello world")).toBe(true);
    });

    it("returns true when sourceMatch has more words than sourceContext", () => {
      expect(shouldHighlightSourceMatch("the quick brown fox", "quick brown")).toBe(true);
    });

    it("returns true for 2 words in 3 words", () => {
      expect(shouldHighlightSourceMatch("quick brown", "the quick brown")).toBe(true);
    });

    it("returns true for 2 words in 4 words", () => {
      expect(shouldHighlightSourceMatch("quick brown", "the quick brown fox")).toBe(true);
    });

    it("returns true for 1 word in 3 words", () => {
      expect(shouldHighlightSourceMatch("brown", "the quick brown")).toBe(true);
    });

    it("returns true for 1 word in 2 words", () => {
      expect(shouldHighlightSourceMatch("hello", "hello world")).toBe(true);
    });

    it("returns true for 1 word in 1 word (visual distinctness decided downstream)", () => {
      expect(shouldHighlightSourceMatch("hello", "world")).toBe(true);
    });

    it("returns false for empty strings", () => {
      expect(shouldHighlightSourceMatch("", "hello world")).toBe(false);
      expect(shouldHighlightSourceMatch("hello", "")).toBe(false);
    });

    it("returns false for whitespace-only strings", () => {
      expect(shouldHighlightSourceMatch("   ", "hello world")).toBe(false);
    });
  });

  describe("computeBracketTarget", () => {
    function makeItem(x: number, y: number, width: number, height: number, text?: string): DeepTextItem {
      return { x, y, width, height, text };
    }

    const broadPhraseLine = makeItem(252, 1212, 748, 31, "10 John Doe 50 / M Full NKDA contact CONSULTS");

    it("returns bounding hull of sourceMatchDeepItems when available", () => {
      // "NKDA" is a single word at x=644, w=63 — should NOT use the broad phrase line
      const anchorItems = [makeItem(644, 1210, 63, 20, "NKDA")];
      const result = computeBracketTarget(broadPhraseLine, anchorItems);

      expect(result.x).toBe(644);
      expect(result.width).toBe(63);
      expect(result.y).toBe(1210);
      expect(result.height).toBe(20);
    });

    it("computes bounding hull spanning multiple anchor items", () => {
      // "John Doe 50/M" — four separate word boxes
      const anchorItems = [
        makeItem(307, 1208, 55, 25, "John"),
        makeItem(374, 1209, 46, 24, "Doe"),
        makeItem(446, 1211, 29, 24, "50"),
        makeItem(473, 1210, 12, 23, "/"),
      ];
      const result = computeBracketTarget(broadPhraseLine, anchorItems);

      // Hull: x from 307 to 307+55=362… but rightmost is 473+12=485
      // y from min(1208,1209,1211,1210)=1208 to max bottom = max(1208+25,1209+24,1211+24,1210+23) = 1235
      expect(result.x).toBe(307);
      expect(result.width).toBe(485 - 307); // 178
      expect(result.y).toBe(1208);
      expect(result.height).toBe(1235 - 1208); // 27
    });

    it("falls back to sourceContextDeepItem when sourceMatchDeepItems is undefined", () => {
      const result = computeBracketTarget(broadPhraseLine, undefined);

      expect(result.x).toBe(broadPhraseLine.x);
      expect(result.y).toBe(broadPhraseLine.y);
      expect(result.width).toBe(broadPhraseLine.width);
      expect(result.height).toBe(broadPhraseLine.height);
    });

    it("falls back to sourceContextDeepItem when sourceMatchDeepItems is empty", () => {
      const result = computeBracketTarget(broadPhraseLine, []);

      expect(result.x).toBe(broadPhraseLine.x);
      expect(result.y).toBe(broadPhraseLine.y);
      expect(result.width).toBe(broadPhraseLine.width);
      expect(result.height).toBe(broadPhraseLine.height);
    });

    it("handles single anchor item correctly", () => {
      const anchorItems = [makeItem(100, 200, 50, 20, "word")];
      const phrase = makeItem(0, 200, 500, 20, "some long line of text");
      const result = computeBracketTarget(phrase, anchorItems);

      expect(result.x).toBe(100);
      expect(result.width).toBe(50);
    });

    it("real-world: radial art line anchor should not span entire chart section", () => {
      // sourceContextDeepItem covers a massive area (many OCR lines merged)
      const massivePhrase = makeItem(
        200,
        800,
        900,
        300,
        "radial art line Bumex 5mg/hr ... PLAN: Optimize for transplant",
      );
      const anchorItems = [
        makeItem(680, 950, 70, 20, "radial"),
        makeItem(755, 950, 30, 20, "art"),
        makeItem(790, 950, 40, 20, "line"),
      ];
      const result = computeBracketTarget(massivePhrase, anchorItems);

      // Should be tight around "radial art line", NOT the massive phrase
      expect(result.x).toBe(680);
      expect(result.width).toBe(830 - 680); // 150, not 900
      expect(result.y).toBe(950);
      expect(result.height).toBe(20);
    });
  });
});
