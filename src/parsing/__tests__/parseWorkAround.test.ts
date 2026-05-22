import { describe, expect, it } from "bun:test";
import {
  cleanRepeatingLastSentence,
  isGeminiGarbage,
} from "../parseWorkAround";

describe("isGeminiGarbage", () => {
  describe("single-character repetition", () => {
    it("detects all-same-character strings", () => {
      expect(isGeminiGarbage("a".repeat(100))).toBe(true);
    });

    it("returns false for short all-same-character strings", () => {
      expect(isGeminiGarbage("a".repeat(10))).toBe(false);
    });

    it("returns false for normal text", () => {
      expect(isGeminiGarbage("The quick brown fox jumps over the lazy dog.")).toBe(false);
    });
  });

  describe("multi-character repeating unit", () => {
    it("detects repeated </font> lines", () => {
      const garbage = "</font>\n".repeat(20);
      expect(isGeminiGarbage(garbage)).toBe(true);
    });

    it("detects repeated HTML tags without trailing newline", () => {
      const lines = Array(20).fill("</font>").join("\n");
      expect(isGeminiGarbage(lines)).toBe(true);
    });

    it("detects other repeated multi-char tokens", () => {
      const garbage = Array(15).fill("<br/>").join("\n");
      expect(isGeminiGarbage(garbage)).toBe(true);
    });

    it("returns false when lines differ", () => {
      const normal = ["First sentence.", "Second sentence.", "Third sentence."].join("\n");
      expect(isGeminiGarbage(normal)).toBe(false);
    });

    it("returns false when fewer than MIN_REPETITIONS lines", () => {
      expect(isGeminiGarbage("</font>")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for empty string", () => {
      expect(isGeminiGarbage("")).toBe(false);
    });

    it("returns false for whitespace-only string", () => {
      expect(isGeminiGarbage("   ")).toBe(false);
    });
  });
});

describe("cleanRepeatingLastSentence", () => {
  it("removes trailing repeated sentence", () => {
    const repeated =
      "The cat sat on the mat. The dog ran fast. The dog ran fast.";
    expect(cleanRepeatingLastSentence(repeated)).toBe(
      "The cat sat on the mat. The dog ran fast."
    );
  });

  it("removes many repetitions keeping one copy", () => {
    const base = "Something happened here.";
    const repeated = base + " The fog rolled in. The fog rolled in. The fog rolled in.";
    expect(cleanRepeatingLastSentence(repeated)).toBe(base + " The fog rolled in.");
  });

  it("returns text unchanged when no repetition", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    expect(cleanRepeatingLastSentence(text)).toBe(text);
  });

  it("returns text unchanged when too short to repeat", () => {
    const text = "Hello world.";
    expect(cleanRepeatingLastSentence(text)).toBe(text);
  });
});
