/**
 * Tests for IntercomBot class
 *
 * These tests verify the core bot functionality including:
 * - Constructor validation
 * - Knowledge base loading
 * - Response generation with citation verification
 * - Intercom API interactions
 */

import { describe, expect, it, beforeEach, mock, spyOn } from "bun:test";
import { IntercomBot, type IntercomBotConfig } from "../intercom-bot.js";

// Mock the external dependencies
const mockPrepareFiles = mock(() =>
  Promise.resolve({
    fileDataParts: [
      {
        fileId: "file_123",
        metadata: { filename: "test.txt", pageCount: 1 },
      },
    ],
    deepTextPromptPortion: ["[Page 1]\n[L1] Test content"],
  })
);

const mockVerifyCitationsFromLlmOutput = mock(() =>
  Promise.resolve({
    verifications: {
      "1": {
        pageNumber: 1,
        searchState: { status: "found" },
        matchSnippet: "Test content",
      },
    },
  })
);

const mockOpenAICreate = mock(() =>
  Promise.resolve({
    choices: [
      {
        message: {
          content:
            "Here is the answer. <cite file_id='file_123' start_page_key='page_number_1_index_0' full_phrase='Test content' key_span='Test' line_ids='1' />",
        },
      },
    ],
  })
);

const mockIntercomReply = mock(() => Promise.resolve({}));

// Mock modules
mock.module("@deepcitation/deepcitation-js", () => ({
  DeepCitation: class {
    prepareFiles = mockPrepareFiles;
    verifyCitationsFromLlmOutput = mockVerifyCitationsFromLlmOutput;
  },
  wrapCitationPrompt: () => ({
    enhancedSystemPrompt: "Enhanced system prompt",
    enhancedUserPrompt: "Enhanced user prompt",
  }),
  getCitationStatus: (verification: { searchState: { status: string } }) => ({
    isVerified: verification.searchState.status === "found",
  }),
  removeCitations: (text: string) => text.replace(/<cite[^>]*\/>/g, "").trim(),
}));

mock.module("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: mockOpenAICreate,
      },
    };
  },
}));

mock.module("intercom-client", () => ({
  IntercomClient: class {
    conversations = {
      reply: mockIntercomReply,
    };
  },
}));

describe("IntercomBot", () => {
  const validConfig: IntercomBotConfig = {
    deepcitationApiKey: "sk-dc-test",
    openaiApiKey: "sk-openai-test",
    intercomAccessToken: "intercom-token",
    minConfidenceThreshold: 0.8,
  };

  beforeEach(() => {
    mockPrepareFiles.mockClear();
    mockVerifyCitationsFromLlmOutput.mockClear();
    mockOpenAICreate.mockClear();
    mockIntercomReply.mockClear();
  });

  describe("constructor", () => {
    it("creates bot with valid config", () => {
      const bot = new IntercomBot(validConfig);
      expect(bot).toBeInstanceOf(IntercomBot);
    });

    it("uses default confidence threshold of 0.8", () => {
      const configWithoutThreshold = {
        deepcitationApiKey: "sk-dc-test",
        openaiApiKey: "sk-openai-test",
        intercomAccessToken: "intercom-token",
      };
      const bot = new IntercomBot(configWithoutThreshold);
      expect(bot).toBeInstanceOf(IntercomBot);
    });

    it("accepts custom confidence threshold", () => {
      const configWithThreshold = {
        ...validConfig,
        minConfidenceThreshold: 0.9,
      };
      const bot = new IntercomBot(configWithThreshold);
      expect(bot).toBeInstanceOf(IntercomBot);
    });
  });

  describe("isReady", () => {
    it("returns false before knowledge base is loaded", () => {
      const bot = new IntercomBot(validConfig);
      expect(bot.isReady()).toBe(false);
    });

    it("returns true after knowledge base is loaded", async () => {
      const bot = new IntercomBot(validConfig);
      await bot.loadKnowledgeBase([
        { content: "Test content", filename: "test.txt" },
      ]);
      expect(bot.isReady()).toBe(true);
    });
  });

  describe("loadKnowledgeBase", () => {
    it("loads documents successfully", async () => {
      const bot = new IntercomBot(validConfig);

      await bot.loadKnowledgeBase([
        { content: "FAQ content", filename: "faq.txt" },
        { content: "Policy content", filename: "policy.txt" },
      ]);

      expect(mockPrepareFiles).toHaveBeenCalledTimes(1);
      expect(bot.isReady()).toBe(true);
    });

    it("handles Buffer content", async () => {
      const bot = new IntercomBot(validConfig);

      await bot.loadKnowledgeBase([
        { content: Buffer.from("Binary content"), filename: "doc.pdf" },
      ]);

      expect(mockPrepareFiles).toHaveBeenCalledTimes(1);
    });

    it("handles empty documents array", async () => {
      mockPrepareFiles.mockImplementationOnce(() =>
        Promise.resolve({
          fileDataParts: [],
          deepTextPromptPortion: [],
        })
      );

      const bot = new IntercomBot(validConfig);
      await bot.loadKnowledgeBase([]);

      expect(mockPrepareFiles).toHaveBeenCalledTimes(1);
    });
  });

  describe("generateResponse", () => {
    it("throws error if knowledge base not loaded", async () => {
      const bot = new IntercomBot(validConfig);

      await expect(bot.generateResponse("What is the policy?")).rejects.toThrow(
        "Knowledge base not loaded"
      );
    });

    it("generates response with citation verification", async () => {
      const bot = new IntercomBot(validConfig);
      await bot.loadKnowledgeBase([
        { content: "Test content", filename: "test.txt" },
      ]);

      const response = await bot.generateResponse("What is the test content?");

      expect(response).toHaveProperty("cleanResponse");
      expect(response).toHaveProperty("rawResponse");
      expect(response).toHaveProperty("confidence");
      expect(response).toHaveProperty("needsReview");
      expect(response).toHaveProperty("totalCitations");
      expect(response).toHaveProperty("verifiedCitations");
      expect(response).toHaveProperty("verificationDetails");
    });

    it("calculates confidence correctly with all verified citations", async () => {
      const bot = new IntercomBot(validConfig);
      await bot.loadKnowledgeBase([
        { content: "Test content", filename: "test.txt" },
      ]);

      const response = await bot.generateResponse("Question?");

      expect(response.confidence).toBe(1);
      expect(response.verifiedCitations).toBe(1);
      expect(response.totalCitations).toBe(1);
      expect(response.needsReview).toBe(false);
    });

    it("flags response for review when confidence is low", async () => {
      // Mock low confidence scenario
      mockVerifyCitationsFromLlmOutput.mockImplementationOnce(() =>
        Promise.resolve({
          verifications: {
            "1": {
              pageNumber: 1,
              searchState: { status: "not_found" },
            },
          },
        })
      );

      const bot = new IntercomBot(validConfig);
      await bot.loadKnowledgeBase([
        { content: "Test content", filename: "test.txt" },
      ]);

      const response = await bot.generateResponse("Question?");

      expect(response.confidence).toBe(0);
      expect(response.needsReview).toBe(true);
    });

    it("handles response with no citations", async () => {
      mockOpenAICreate.mockImplementationOnce(() =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: "I don't have information about that.",
              },
            },
          ],
        })
      );

      mockVerifyCitationsFromLlmOutput.mockImplementationOnce(() =>
        Promise.resolve({
          verifications: {},
        })
      );

      const bot = new IntercomBot(validConfig);
      await bot.loadKnowledgeBase([
        { content: "Test content", filename: "test.txt" },
      ]);

      const response = await bot.generateResponse("Unknown question?");

      expect(response.totalCitations).toBe(0);
      expect(response.confidence).toBe(0);
      expect(response.needsReview).toBe(true);
    });

    it("removes citations from clean response", async () => {
      const bot = new IntercomBot(validConfig);
      await bot.loadKnowledgeBase([
        { content: "Test content", filename: "test.txt" },
      ]);

      const response = await bot.generateResponse("Question?");

      expect(response.rawResponse).toContain("<cite");
      expect(response.cleanResponse).not.toContain("<cite");
    });
  });

  describe("replyToConversation", () => {
    it("sends reply via Intercom API", async () => {
      const bot = new IntercomBot(validConfig);

      await bot.replyToConversation("conv_123", "Hello!", "admin_456");

      expect(mockIntercomReply).toHaveBeenCalledTimes(1);
      expect(mockIntercomReply).toHaveBeenCalledWith({
        conversation_id: "conv_123",
        body: {
          message_type: "comment",
          type: "admin",
          admin_id: "admin_456",
          body: "Hello!",
        },
      });
    });
  });

  describe("addInternalNote", () => {
    it("adds note via Intercom API", async () => {
      const bot = new IntercomBot(validConfig);

      await bot.addInternalNote("conv_123", "Internal note", "admin_456");

      expect(mockIntercomReply).toHaveBeenCalledTimes(1);
      expect(mockIntercomReply).toHaveBeenCalledWith({
        conversation_id: "conv_123",
        body: {
          message_type: "note",
          type: "admin",
          admin_id: "admin_456",
          body: "Internal note",
        },
      });
    });
  });

  describe("formatVerificationNote", () => {
    it("formats high confidence note correctly", () => {
      const bot = new IntercomBot(validConfig);

      const response = {
        cleanResponse: "Answer",
        rawResponse: "Answer with cite",
        confidence: 1,
        needsReview: false,
        totalCitations: 2,
        verifiedCitations: 2,
        verificationDetails: {
          "1": { pageNumber: 1, searchState: { status: "found" } },
          "2": { pageNumber: 1, searchState: { status: "found" } },
        },
      };

      const note = bot.formatVerificationNote(response as any);

      expect(note).toContain("✅");
      expect(note).toContain("100%");
      expect(note).toContain("2/2 verified");
      expect(note).not.toContain("Action Required");
    });

    it("formats low confidence note with warning", () => {
      const bot = new IntercomBot(validConfig);

      const response = {
        cleanResponse: "Answer",
        rawResponse: "Answer with cite",
        confidence: 0.5,
        needsReview: true,
        totalCitations: 2,
        verifiedCitations: 1,
        verificationDetails: {
          "1": { pageNumber: 1, searchState: { status: "found" } },
          "2": { pageNumber: 1, searchState: { status: "not_found" } },
        },
      };

      const note = bot.formatVerificationNote(response as any);

      expect(note).toContain("⚠️");
      expect(note).toContain("50%");
      expect(note).toContain("Action Required");
    });

    it("formats zero confidence note correctly", () => {
      const bot = new IntercomBot(validConfig);

      const response = {
        cleanResponse: "Answer",
        rawResponse: "Answer",
        confidence: 0,
        needsReview: true,
        totalCitations: 0,
        verifiedCitations: 0,
        verificationDetails: {},
      };

      const note = bot.formatVerificationNote(response as any);

      expect(note).toContain("❌");
      expect(note).toContain("0%");
    });
  });

  describe("handleIncomingMessage", () => {
    it("processes message and sends reply with note", async () => {
      const bot = new IntercomBot(validConfig);
      await bot.loadKnowledgeBase([
        { content: "Test content", filename: "test.txt" },
      ]);

      const response = await bot.handleIncomingMessage(
        "conv_123",
        "What is the test content?",
        "admin_456"
      );

      // Should call Intercom twice: once for reply, once for note
      expect(mockIntercomReply).toHaveBeenCalledTimes(2);

      // First call is the customer reply
      expect(mockIntercomReply.mock.calls[0][0]).toMatchObject({
        conversation_id: "conv_123",
        body: {
          message_type: "comment",
          type: "admin",
        },
      });

      // Second call is the internal note
      expect(mockIntercomReply.mock.calls[1][0]).toMatchObject({
        conversation_id: "conv_123",
        body: {
          message_type: "note",
          type: "admin",
        },
      });

      expect(response.cleanResponse).toBeDefined();
      expect(response.confidence).toBeGreaterThanOrEqual(0);
    });

    it("throws error if knowledge base not loaded", async () => {
      const bot = new IntercomBot(validConfig);

      await expect(
        bot.handleIncomingMessage("conv_123", "Question?", "admin_456")
      ).rejects.toThrow("Knowledge base not loaded");
    });
  });
});

describe("IntercomBot edge cases", () => {
  const validConfig: IntercomBotConfig = {
    deepcitationApiKey: "sk-dc-test",
    openaiApiKey: "sk-openai-test",
    intercomAccessToken: "intercom-token",
  };

  beforeEach(() => {
    mockPrepareFiles.mockClear();
    mockVerifyCitationsFromLlmOutput.mockClear();
    mockOpenAICreate.mockClear();
    mockIntercomReply.mockClear();
  });

  it("handles API errors gracefully", async () => {
    mockPrepareFiles.mockImplementationOnce(() =>
      Promise.reject(new Error("API Error"))
    );

    const bot = new IntercomBot(validConfig);

    await expect(
      bot.loadKnowledgeBase([{ content: "test", filename: "test.txt" }])
    ).rejects.toThrow("API Error");
  });

  it("handles OpenAI API errors", async () => {
    mockOpenAICreate.mockImplementationOnce(() =>
      Promise.reject(new Error("OpenAI rate limit"))
    );

    const bot = new IntercomBot(validConfig);
    await bot.loadKnowledgeBase([
      { content: "Test content", filename: "test.txt" },
    ]);

    await expect(bot.generateResponse("Question?")).rejects.toThrow(
      "OpenAI rate limit"
    );
  });

  it("handles Intercom API errors", async () => {
    mockIntercomReply.mockImplementationOnce(() =>
      Promise.reject(new Error("Intercom API error"))
    );

    const bot = new IntercomBot(validConfig);

    await expect(
      bot.replyToConversation("conv_123", "Message", "admin_456")
    ).rejects.toThrow("Intercom API error");
  });

  it("handles partial verification results", async () => {
    mockVerifyCitationsFromLlmOutput.mockImplementationOnce(() =>
      Promise.resolve({
        verifications: {
          "1": { pageNumber: 1, searchState: { status: "found" } },
          "2": { pageNumber: 1, searchState: { status: "not_found" } },
          "3": { pageNumber: 2, searchState: { status: "found" } },
        },
      })
    );

    const bot = new IntercomBot(validConfig);
    await bot.loadKnowledgeBase([
      { content: "Test content", filename: "test.txt" },
    ]);

    const response = await bot.generateResponse("Multi-citation question?");

    expect(response.totalCitations).toBe(3);
    expect(response.verifiedCitations).toBe(2);
    expect(response.confidence).toBeCloseTo(0.667, 2);
    expect(response.needsReview).toBe(true);
  });
});
