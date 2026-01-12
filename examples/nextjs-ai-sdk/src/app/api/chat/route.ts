import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import {
  enhancePrompts,
  verifyCitations,
  getSessionFiles,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
} from "@/lib/deepcitation";

export const maxDuration = 60;

// Available models - using fast/cheap models for examples
const MODELS = {
  openai: openai("gpt-5-mini"),
  gemini: google("gemini-2.0-flash-lite"),
} as const;

type ModelProvider = keyof typeof MODELS;

export async function POST(req: Request) {
  const {
    messages,
    sessionId = "default",
    provider = "openai", // Default to OpenAI, can be "openai" or "gemini"
  } = await req.json();

  const hasDocuments = getSessionFiles(sessionId).length > 0;

  // Get the latest user message
  const lastUserMessage = messages.findLast(
    (m: { role: string }) => m.role === "user"
  );

  // Prepare system prompt
  const baseSystemPrompt = `You are a helpful assistant that answers questions accurately.
${
  hasDocuments
    ? "When referencing information from the provided documents, cite your sources."
    : ""
}`;

  // Enhance prompts with citation instructions if documents are uploaded
  const { enhancedSystemPrompt, enhancedUserPrompt } = hasDocuments
    ? enhancePrompts(
        baseSystemPrompt,
        lastUserMessage?.content || "",
        sessionId
      )
    : {
        enhancedSystemPrompt: baseSystemPrompt,
        enhancedUserPrompt: lastUserMessage?.content || "",
      };

  // Replace the last user message with enhanced version
  const enhancedMessages = messages.map(
    (m: { role: string; content: string }, i: number) => {
      if (i === messages.length - 1 && m.role === "user" && hasDocuments) {
        return { ...m, content: enhancedUserPrompt };
      }
      return m;
    }
  );

  // Select model based on provider
  const selectedModel = MODELS[provider as ModelProvider] || MODELS.openai;

  // Stream the response
  const result = streamText({
    model: selectedModel,
    system: enhancedSystemPrompt,
    messages: enhancedMessages,
    async onFinish({ text }) {
      // Verify citations after streaming completes
      // In production, you might want to send this via a separate endpoint
      // or use Server-Sent Events for real-time verification updates
      if (hasDocuments) {
        try {
          const verifications = await verifyCitations(sessionId, text);
          const citations = getAllCitationsFromLlmOutput(text);

          const verifiedCount = Object.values(verifications).filter(
            (v) => getCitationStatus(v).isVerified
          ).length;
          const totalCount = Object.keys(citations).length;

          console.log(
            `[${sessionId}] Verified ${verifiedCount}/${totalCount} citations (${provider})`
          );
        } catch (error) {
          console.error("Citation verification failed:", error);
        }
      }
    },
  });

  return result.toDataStreamResponse();
}
