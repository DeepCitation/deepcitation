import { describe, expect, it } from "@jest/globals";
import {
  AV_CITATION_PROMPT,
  CITATION_AV_JSON_OUTPUT_FORMAT,
  CITATION_DATA_START_DELIMITER,
  CITATION_JSON_OUTPUT_FORMAT,
  CITATION_PROMPT,
  wrapCitationPrompt,
  wrapSystemCitationPrompt,
} from "../prompts/citationPrompts.js";

describe("citation prompts", () => {
  it("includes deferred JSON citation structure", () => {
    expect(CITATION_PROMPT).toContain(CITATION_DATA_START_DELIMITER);
    expect(CITATION_PROMPT).toContain("[1]");
    // Grouped format uses attachment_id as object key, not field
    expect(CITATION_PROMPT).toContain("attachment_id");
    expect(CITATION_PROMPT).toContain('"full_phrase"');
    expect(CITATION_PROMPT).toContain('"anchor_text"');
    expect(CITATION_PROMPT).toContain('"page_id"');
    expect(CITATION_PROMPT).toContain('"line_ids"');
  });

  it("includes timestamps in AV_CITATION_PROMPT", () => {
    expect(AV_CITATION_PROMPT).toContain(CITATION_DATA_START_DELIMITER);
    expect(AV_CITATION_PROMPT).toContain('"timestamps"');
    expect(AV_CITATION_PROMPT).toContain('"start_time"');
    expect(AV_CITATION_PROMPT).toContain('"end_time"');
  });

  it("defines required fields for citations in JSON schema", () => {
    expect(CITATION_JSON_OUTPUT_FORMAT.required).toEqual(["id", "attachment_id", "full_phrase", "anchor_text"]);
  });

  it("defines timestamp requirements for AV citations in JSON schema", () => {
    const timestamps = CITATION_AV_JSON_OUTPUT_FORMAT.properties?.timestamps;
    expect(timestamps?.required).toEqual(["start_time", "end_time"]);
  });
});

describe("wrapSystemCitationPrompt", () => {
  it("wraps system prompt with citation instructions at start and reminder at end", () => {
    const systemPrompt = "You are a helpful assistant.";
    const result = wrapSystemCitationPrompt({ systemPrompt });

    expect(result).toContain("You are a helpful assistant.");
    expect(result).toContain(CITATION_DATA_START_DELIMITER);
    expect(result).toContain("[1]");
    expect(result).toContain("<citation-reminder>");
    // Citation instructions come first (wrap mode)
    expect(result.indexOf(CITATION_DATA_START_DELIMITER)).toBeLessThan(result.indexOf("You are a helpful assistant."));
    // Reminder comes after system prompt
    expect(result.indexOf("You are a helpful assistant.")).toBeLessThan(result.indexOf("<citation-reminder>"));
  });

  it("uses AV citation format when isAudioVideo is true", () => {
    const systemPrompt = "You are an audio transcription assistant.";
    const result = wrapSystemCitationPrompt({
      systemPrompt,
      isAudioVideo: true,
    });

    expect(result).toContain("You are an audio transcription assistant.");
    expect(result).toContain(CITATION_DATA_START_DELIMITER);
    expect(result).toContain("timestamps");
    expect(result).toContain("HH:MM:SS.SSS");
  });

  it("trims whitespace from system prompt", () => {
    const systemPrompt = "  Has whitespace around  ";
    const result = wrapSystemCitationPrompt({ systemPrompt });

    expect(result).toContain("Has whitespace around");
    expect(result).not.toMatch(/^\s+Has/);
  });

  it("handles empty system prompt", () => {
    const result = wrapSystemCitationPrompt({ systemPrompt: "" });

    expect(result).toContain(CITATION_DATA_START_DELIMITER);
  });
});

describe("wrapCitationPrompt", () => {
  it("wraps both system and user prompts", () => {
    const result = wrapCitationPrompt({
      systemPrompt: "You are a helpful assistant.",
      userPrompt: "Analyze this document.",
    });

    expect(result.enhancedSystemPrompt).toContain("You are a helpful assistant.");
    expect(result.enhancedSystemPrompt).toContain(CITATION_DATA_START_DELIMITER);
    expect(result.enhancedUserPrompt).toContain("Analyze this document.");
  });

  it("returns object with enhancedSystemPrompt and enhancedUserPrompt", () => {
    const result = wrapCitationPrompt({
      systemPrompt: "System",
      userPrompt: "User",
    });

    expect(result).toHaveProperty("enhancedSystemPrompt");
    expect(result).toHaveProperty("enhancedUserPrompt");
    expect(typeof result.enhancedSystemPrompt).toBe("string");
    expect(typeof result.enhancedUserPrompt).toBe("string");
  });

  it("uses AV citation format when isAudioVideo is true", () => {
    const result = wrapCitationPrompt({
      systemPrompt: "Audio assistant",
      userPrompt: "Transcribe this.",
      isAudioVideo: true,
    });

    expect(result.enhancedSystemPrompt).toContain(CITATION_DATA_START_DELIMITER);
    expect(result.enhancedSystemPrompt).toContain("timestamps");
    expect(result.enhancedSystemPrompt).toContain("start_time");
  });

  it("passes through user prompt unchanged by default", () => {
    const userPrompt = "Analyze this document: [content here]";
    const result = wrapCitationPrompt({
      systemPrompt: "System prompt",
      userPrompt,
    });

    // User prompt should be returned as-is (or with minimal modifications)
    expect(result.enhancedUserPrompt).toContain("Analyze this document: [content here]");
  });

  it("handles empty prompts", () => {
    const result = wrapCitationPrompt({
      systemPrompt: "",
      userPrompt: "",
    });

    expect(result.enhancedSystemPrompt).toContain(CITATION_DATA_START_DELIMITER);
    expect(typeof result.enhancedUserPrompt).toBe("string");
  });

  it("preserves multi-line prompts", () => {
    const systemPrompt = `You are a helpful assistant.

You should analyze documents carefully.

Always cite your sources.`;
    const userPrompt = `Here is the document:

Page 1:
Some content here.

Page 2:
More content.`;

    const result = wrapCitationPrompt({ systemPrompt, userPrompt });

    expect(result.enhancedSystemPrompt).toContain("analyze documents carefully");
    expect(result.enhancedUserPrompt).toContain("Page 1:");
    expect(result.enhancedUserPrompt).toContain("Page 2:");
  });

  describe("deepTextPromptPortion handling", () => {
    it("includes single string deepTextPromptPortion in user prompt", () => {
      const deepTextPromptPortion =
        "<attachment_text>\n[L1] This is the document content.\n[L2] Second line here.\n</attachment_text>";
      const result = wrapCitationPrompt({
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Summarize this document.",
        deepTextPromptPortion,
      });

      expect(result.enhancedUserPrompt).toContain("This is the document content.");
      expect(result.enhancedUserPrompt).toContain("Second line here.");
      expect(result.enhancedUserPrompt).toContain("Summarize this document.");
    });

    it("includes array of deepTextPromptPortion strings in user prompt", () => {
      const deepTextPromptPortion = [
        "<attachment_text attachment_id='file1'>\n[L1] Content from first file.\n</attachment_text>",
        "<attachment_text attachment_id='file2'>\n[L1] Content from second file.\n</attachment_text>",
      ];
      const result = wrapCitationPrompt({
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Compare these documents.",
        deepTextPromptPortion,
      });

      expect(result.enhancedUserPrompt).toContain("Content from first file.");
      expect(result.enhancedUserPrompt).toContain("Content from second file.");
      expect(result.enhancedUserPrompt).toContain("Compare these documents.");
    });

    it("places deepTextPromptPortion before user prompt", () => {
      const deepTextPromptPortion = "[FILE CONTENT HERE]";
      const result = wrapCitationPrompt({
        systemPrompt: "System",
        userPrompt: "User question",
        deepTextPromptPortion,
      });

      const fileContentIndex = result.enhancedUserPrompt.indexOf("[FILE CONTENT HERE]");
      const userPromptIndex = result.enhancedUserPrompt.indexOf("User question");
      expect(fileContentIndex).toBeLessThan(userPromptIndex);
    });

    it("handles empty string deepTextPromptPortion", () => {
      const result = wrapCitationPrompt({
        systemPrompt: "System",
        userPrompt: "User",
        deepTextPromptPortion: "",
      });

      // Empty string is falsy, so user prompt should be unchanged
      expect(result.enhancedUserPrompt).toBe("User");
    });

    it("handles empty array deepTextPromptPortion", () => {
      const result = wrapCitationPrompt({
        systemPrompt: "System",
        userPrompt: "User",
        deepTextPromptPortion: [],
      });

      // Empty array produces empty content, user prompt should have some separator
      expect(result.enhancedUserPrompt).toContain("User");
    });

    it("handles undefined deepTextPromptPortion", () => {
      const result = wrapCitationPrompt({
        systemPrompt: "System",
        userPrompt: "User",
        deepTextPromptPortion: undefined,
      });

      expect(result.enhancedUserPrompt).toBe("User");
    });
  });

  it("includes reminder in user prompt when deepTextPromptPortion is provided", () => {
    const result = wrapCitationPrompt({
      systemPrompt: "System",
      userPrompt: "Question",
      deepTextPromptPortion: "File content here",
    });

    expect(result.enhancedUserPrompt).toContain("<<<CITATION_DATA>>>");
  });
});

describe("wrapSystemCitationPrompt maintains wrap strategy", () => {
  it("places instructions at start and reminder at end", () => {
    const result = wrapSystemCitationPrompt({
      systemPrompt: "My system prompt here",
    });
    expect(result.indexOf(CITATION_DATA_START_DELIMITER)).toBeLessThan(result.indexOf("My system prompt here"));
    expect(result.indexOf("My system prompt here")).toBeLessThan(result.lastIndexOf("<citation-reminder>"));
  });
});
