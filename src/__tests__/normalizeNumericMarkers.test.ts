import { describe, expect, it } from "@jest/globals";
import { normalizeNumericMarkers } from "../vanilla/reportUtils.js";

describe("normalizeNumericMarkers", () => {
  it("leaves OpenAI-style markers (anchor then [N]) unchanged", () => {
    const text = "The economy grew by 3.2% [1] last quarter.";
    const anchorMap = { "1": "The economy grew by 3.2%" };
    expect(normalizeNumericMarkers(text, anchorMap)).toBe(text);
  });

  it("repositions Anthropic-style markers ([N] before anchor)", () => {
    const text = "[1] The economy grew by 3.2% last quarter.";
    const anchorMap = { "1": "The economy grew by 3.2%" };
    const result = normalizeNumericMarkers(text, anchorMap);
    // After removing [1] from position 0, a leading space may remain
    expect(result.trim()).toBe("The economy grew by 3.2% [1] last quarter.");
  });

  it("expands Gemini-style grouped markers [1, 5] → [1][5]", () => {
    const text = "Revenue increased [1, 5] significantly.";
    const anchorMap = {
      "1": "Revenue increased",
      "5": "significantly",
    };
    const result = normalizeNumericMarkers(text, anchorMap);
    // Both markers should be expanded and repositioned
    expect(result).not.toContain("[1, 5]");
    expect(result).toContain("[1]");
    expect(result).toContain("[5]");
  });

  it("handles multiple citations without interference", () => {
    const text = "Claim A [1] and claim B [2] are both cited.";
    const anchorMap = { "1": "Claim A", "2": "claim B" };
    const result = normalizeNumericMarkers(text, anchorMap);
    // Both already in correct position — should be unchanged
    expect(result).toBe(text);
  });

  it("handles marker within gap tolerance (≤5 chars after anchor end)", () => {
    const text = "Claim A  [1] rest of text.";
    const anchorMap = { "1": "Claim A" };
    // Gap is 2 chars ("  "), within tolerance of 5
    const result = normalizeNumericMarkers(text, anchorMap);
    expect(result).toBe(text);
  });

  it("returns text unchanged when no markers match", () => {
    const text = "No markers here.";
    const anchorMap = { "1": "missing anchor" };
    expect(normalizeNumericMarkers(text, anchorMap)).toBe(text);
  });

  it("returns text unchanged when anchor text is not found", () => {
    const text = "Some text [1] here.";
    const anchorMap = { "1": "nonexistent anchor phrase" };
    expect(normalizeNumericMarkers(text, anchorMap)).toBe(text);
  });

  it("handles empty anchorMap", () => {
    const text = "Some text [1] here.";
    expect(normalizeNumericMarkers(text, {})).toBe(text);
  });

  it("expands triple grouped markers [1, 2, 3]", () => {
    const text = "Claims [1, 2, 3] are supported.";
    const anchorMap = { "1": "Claims", "2": "Claims", "3": "Claims" };
    const result = normalizeNumericMarkers(text, anchorMap);
    expect(result).not.toContain("[1, 2, 3]");
    expect(result).toContain("[1]");
    expect(result).toContain("[2]");
    expect(result).toContain("[3]");
  });

  it("uses prefix matching for long anchors", () => {
    const longAnchor = "A".repeat(60);
    const text = `[1] ${longAnchor} rest.`;
    const anchorMap = { "1": longAnchor };
    const result = normalizeNumericMarkers(text, anchorMap);
    // Marker should move after the anchor
    expect(result).toContain(`${longAnchor} [1]`);
    expect(result.startsWith("[1]")).toBe(false);
  });
});
