import { describe, expect, it } from "@jest/globals";
import {
  CITATION_MARKDOWN_SYNTAX_PROMPT,
  AV_CITATION_MARKDOWN_SYNTAX_PROMPT,
  CITATION_JSON_OUTPUT_FORMAT,
  CITATION_AV_BASED_JSON_OUTPUT_FORMAT,
  wrapSystemCitationPrompt,
  wrapCitationPrompt,
} from "../prompts/citationPrompts.js";
import {
  DEFERRED_CITATION_PROMPT,
  DEFERRED_AV_CITATION_PROMPT,
  CITATION_DATA_START_DELIMITER,
} from "../prompts/deferredCitationPrompt.js";

describe("citation prompts", () => {
  it("includes guidance for citation markdown syntax", () => {
    expect(CITATION_MARKDOWN_SYNTAX_PROMPT).toContain(
      "<cite attachment_id='"
    );
    expect(CITATION_MARKDOWN_SYNTAX_PROMPT).toContain("line_ids");
    expect(AV_CITATION_MARKDOWN_SYNTAX_PROMPT).toContain(
      "timestamps='HH:MM:SS.SSS"
    );
    expect(AV_CITATION_MARKDOWN_SYNTAX_PROMPT).toContain("key_span");
  });

  it("defines required fields for text-based citations in CoT order (fullPhrase before keySpan)", () => {
    expect(CITATION_JSON_OUTPUT_FORMAT.required).toEqual([
      "attachmentId",
      "reasoning",
      "fullPhrase",
      "keySpan",
      "startPageKey",
      "lineIds",
    ]);
  });

  it("defines timestamp requirements for AV citations", () => {
    const timestamps =
      CITATION_AV_BASED_JSON_OUTPUT_FORMAT.properties?.timestamps;
    expect(timestamps?.required).toEqual(["startTime", "endTime"]);
  });
});

describe("wrapSystemCitationPrompt", () => {
  it("wraps system prompt with citation instructions at start and reminder at end", () => {
    const systemPrompt = "You are a helpful assistant.";
    const result = wrapSystemCitationPrompt({ systemPrompt });

    expect(result).toContain("You are a helpful assistant.");
    expect(result).toContain("<cite attachment_id='");
    expect(result).toContain("line_ids");
    expect(result).toContain("<citation-reminder>");
    // Citation instructions come first (wrap mode)
    expect(result.indexOf("<cite")).toBeLessThan(
      result.indexOf("You are a helpful assistant.")
    );
    // Reminder comes after system prompt
    expect(result.indexOf("You are a helpful assistant.")).toBeLessThan(
      result.indexOf("<citation-reminder>")
    );
  });

  it("uses AV citation format when isAudioVideo is true", () => {
    const systemPrompt = "You are an audio transcription assistant.";
    const result = wrapSystemCitationPrompt({
      systemPrompt,
      isAudioVideo: true,
    });

    expect(result).toContain("You are an audio transcription assistant.");
    expect(result).toContain("timestamps='HH:MM:SS.SSS");
    expect(result).not.toContain("line_ids");
  });

  it("trims whitespace from system prompt", () => {
    const systemPrompt = "  Has whitespace around  ";
    const result = wrapSystemCitationPrompt({ systemPrompt });

    expect(result).toContain("Has whitespace around");
    expect(result).not.toMatch(/^\s+Has/);
  });

  it("handles empty system prompt", () => {
    const result = wrapSystemCitationPrompt({ systemPrompt: "" });

    expect(result).toContain("<cite attachment_id='");
  });
});

describe("wrapCitationPrompt", () => {
  it("wraps both system and user prompts", () => {
    const result = wrapCitationPrompt({
      systemPrompt: "You are a helpful assistant.",
      userPrompt: "Analyze this document.",
    });

    expect(result.enhancedSystemPrompt).toContain(
      "You are a helpful assistant."
    );
    expect(result.enhancedSystemPrompt).toContain(
      "<cite attachment_id='"
    );
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

    expect(result.enhancedSystemPrompt).toContain("timestamps='HH:MM:SS.SSS");
    expect(result.enhancedSystemPrompt).not.toContain("line_ids");
  });

  it("passes through user prompt unchanged by default", () => {
    const userPrompt = "Analyze this document: [content here]";
    const result = wrapCitationPrompt({
      systemPrompt: "System prompt",
      userPrompt,
    });

    // User prompt should be returned as-is (or with minimal modifications)
    expect(result.enhancedUserPrompt).toContain(
      "Analyze this document: [content here]"
    );
  });

  it("handles empty prompts", () => {
    const result = wrapCitationPrompt({
      systemPrompt: "",
      userPrompt: "",
    });

    expect(result.enhancedSystemPrompt).toContain("<cite");
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

    expect(result.enhancedSystemPrompt).toContain(
      "analyze documents carefully"
    );
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

      expect(result.enhancedUserPrompt).toContain(
        "This is the document content."
      );
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

      const fileContentIndex = result.enhancedUserPrompt.indexOf(
        "[FILE CONTENT HERE]"
      );
      const userPromptIndex =
        result.enhancedUserPrompt.indexOf("User question");
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

  describe("mode parameter", () => {
    it("defaults to inline_xml mode", () => {
      const result = wrapCitationPrompt({
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Analyze this.",
      });

      expect(result.enhancedSystemPrompt).toContain("<cite attachment_id='");
      expect(result.enhancedSystemPrompt).not.toContain(
        CITATION_DATA_START_DELIMITER
      );
    });

    it("uses inline_xml mode when explicitly set", () => {
      const result = wrapCitationPrompt({
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Analyze this.",
        mode: "inline_xml",
      });

      expect(result.enhancedSystemPrompt).toContain("<cite attachment_id='");
      expect(result.enhancedSystemPrompt).not.toContain(
        CITATION_DATA_START_DELIMITER
      );
    });

    it("uses deferred_json mode when set", () => {
      const result = wrapCitationPrompt({
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Analyze this.",
        mode: "deferred_json",
      });

      expect(result.enhancedSystemPrompt).toContain(
        CITATION_DATA_START_DELIMITER
      );
      expect(result.enhancedSystemPrompt).toContain("[1]");
      expect(result.enhancedSystemPrompt).not.toContain("<cite attachment_id='");
    });

    it("uses deferred AV format for audio/video with deferred_json mode", () => {
      const result = wrapCitationPrompt({
        systemPrompt: "You are an audio assistant.",
        userPrompt: "Transcribe this.",
        mode: "deferred_json",
        isAudioVideo: true,
      });

      expect(result.enhancedSystemPrompt).toContain(
        CITATION_DATA_START_DELIMITER
      );
      expect(result.enhancedSystemPrompt).toContain("timestamps");
      expect(result.enhancedSystemPrompt).toContain("start_time");
    });

    it("uses appropriate reminder in user prompt for deferred_json mode", () => {
      const result = wrapCitationPrompt({
        systemPrompt: "System",
        userPrompt: "Question",
        deepTextPromptPortion: "File content here",
        mode: "deferred_json",
      });

      expect(result.enhancedUserPrompt).toContain(
        "<<<CITATION_DATA>>>"
      );
    });
  });
});

describe("wrapSystemCitationPrompt mode parameter", () => {
  it("defaults to inline_xml mode", () => {
    const result = wrapSystemCitationPrompt({
      systemPrompt: "You are a helpful assistant.",
    });

    expect(result).toContain("<cite attachment_id='");
    expect(result).not.toContain(CITATION_DATA_START_DELIMITER);
  });

  it("uses deferred_json mode when set", () => {
    const result = wrapSystemCitationPrompt({
      systemPrompt: "You are a helpful assistant.",
      mode: "deferred_json",
    });

    expect(result).toContain(CITATION_DATA_START_DELIMITER);
    expect(result).toContain("[1]");
    expect(result).not.toContain("<cite attachment_id='");
  });

  it("uses deferred AV format for audio/video with deferred_json mode", () => {
    const result = wrapSystemCitationPrompt({
      systemPrompt: "Audio assistant",
      mode: "deferred_json",
      isAudioVideo: true,
    });

    expect(result).toContain(CITATION_DATA_START_DELIMITER);
    expect(result).toContain("timestamps");
    expect(result).toContain("HH:MM:SS.SSS");
  });

  it("maintains wrap strategy for both modes (instructions at start, reminder at end)", () => {
    // Test inline_xml mode
    const inlineResult = wrapSystemCitationPrompt({
      systemPrompt: "My system prompt here",
      mode: "inline_xml",
    });
    expect(inlineResult.indexOf("<cite")).toBeLessThan(
      inlineResult.indexOf("My system prompt here")
    );
    expect(inlineResult.indexOf("My system prompt here")).toBeLessThan(
      inlineResult.indexOf("<citation-reminder>")
    );

    // Test deferred_json mode
    const deferredResult = wrapSystemCitationPrompt({
      systemPrompt: "My system prompt here",
      mode: "deferred_json",
    });
    expect(deferredResult.indexOf(CITATION_DATA_START_DELIMITER)).toBeLessThan(
      deferredResult.indexOf("My system prompt here")
    );
    expect(deferredResult.indexOf("My system prompt here")).toBeLessThan(
      deferredResult.lastIndexOf("<citation-reminder>")
    );
  });
});

describe("deferred citation prompts", () => {
  it("includes correct structure in DEFERRED_CITATION_PROMPT", () => {
    expect(DEFERRED_CITATION_PROMPT).toContain(CITATION_DATA_START_DELIMITER);
    expect(DEFERRED_CITATION_PROMPT).toContain("[1]");
    expect(DEFERRED_CITATION_PROMPT).toContain('"attachment_id"');
    expect(DEFERRED_CITATION_PROMPT).toContain('"full_phrase"');
    expect(DEFERRED_CITATION_PROMPT).toContain('"key_span"');
    expect(DEFERRED_CITATION_PROMPT).toContain('"page_key"');
    expect(DEFERRED_CITATION_PROMPT).toContain('"line_ids"');
  });

  it("includes timestamps in DEFERRED_AV_CITATION_PROMPT", () => {
    expect(DEFERRED_AV_CITATION_PROMPT).toContain(CITATION_DATA_START_DELIMITER);
    expect(DEFERRED_AV_CITATION_PROMPT).toContain('"timestamps"');
    expect(DEFERRED_AV_CITATION_PROMPT).toContain('"start_time"');
    expect(DEFERRED_AV_CITATION_PROMPT).toContain('"end_time"');
  });
});
