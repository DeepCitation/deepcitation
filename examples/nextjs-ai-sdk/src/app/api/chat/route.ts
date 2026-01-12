import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
} from "@deepcitation/deepcitation-js";
import { getSessionFiles, getSessionPromptPortions } from "@/lib/store";

export const maxDuration = 60;

// Check for API key at startup
const apiKey = process.env.DEEPCITATION_API_KEY;
if (!apiKey) {
  console.error(
    "\n⚠️  DEEPCITATION_API_KEY is not set!\n" +
    "   Get your API key from https://deepcitation.com/dashboard\n"
  );
}

const dc = apiKey ? new DeepCitation({ apiKey }) : null;

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
    provider = "openai",
    fileDataParts: clientFileDataParts = [],
    deepTextPromptPortion: clientDeepTextPromptPortion = [],
  } = await req.json();

  console.log("[Chat API] Received messages:", JSON.stringify(messages?.slice(-1), null, 2));

  // Prefer client-provided data, fall back to server-side store
  const fileDataParts =
    clientFileDataParts.length > 0
      ? clientFileDataParts
      : getSessionFiles(sessionId);
  const deepTextPromptPortion =
    clientDeepTextPromptPortion.length > 0
      ? clientDeepTextPromptPortion
      : getSessionPromptPortions(sessionId);
  const hasDocuments = fileDataParts.length > 0;

  console.log(`[${sessionId}] Chat: ${fileDataParts.length} files, provider=${provider}`);

  // Helper to extract text content from UI message parts
  const getMessageContent = (msg: UIMessage): string => {
    if (!msg.parts) return "";
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  };

  // Get the latest user message
  const lastUserMessage = (messages as UIMessage[]).findLast(
    (m) => m.role === "user"
  );
  const lastUserContent = lastUserMessage ? getMessageContent(lastUserMessage) : "";

  // Prepare system prompt
  const baseSystemPrompt = `You are a helpful assistant that answers questions accurately.`;

  // Enhance prompts with citation instructions if documents are uploaded
  const { enhancedSystemPrompt, enhancedUserPrompt } = hasDocuments
    ? wrapCitationPrompt({
        systemPrompt: baseSystemPrompt,
        userPrompt: lastUserContent,
        deepTextPromptPortion,
      })
    : {
        enhancedSystemPrompt: baseSystemPrompt,
        enhancedUserPrompt: lastUserContent,
      };

  // Convert UI messages to model messages and enhance the last user message
  const uiMessages = messages as UIMessage[];
  const enhancedUIMessages = uiMessages.map((m, i) => {
    if (i === uiMessages.length - 1 && m.role === "user" && hasDocuments) {
      // Replace the text content with enhanced version
      return {
        ...m,
        parts: [{ type: "text" as const, text: enhancedUserPrompt }],
      };
    }
    return m;
  });

  // Convert to model messages (async in AI SDK v6)
  const modelMessages = await convertToModelMessages(enhancedUIMessages);

  console.log("[Chat API] Model messages:", JSON.stringify(modelMessages, null, 2));

  // Select model based on provider
  const selectedModel = MODELS[provider as ModelProvider] || MODELS.openai;

  // Stream the response
  const result = streamText({
    model: selectedModel,
    system: enhancedSystemPrompt,
    messages: modelMessages,
    onFinish: async ({ text }) => {
      console.log("[Chat API] Finished streaming, text length:", text.length);
      if (hasDocuments && dc) {
        try {
          const { foundHighlights } = await dc.verifyCitationsFromLlmOutput({
            llmOutput: text,
            fileDataParts,
          });

          const citations = getAllCitationsFromLlmOutput(text);
          const verifiedCount = Object.values(foundHighlights).filter(
            (v) => getCitationStatus(v).isVerified
          ).length;
          const totalCount = Object.keys(citations).length;

          console.log(
            `[${sessionId}] Verified ${verifiedCount}/${totalCount} citations (${provider})`
          );
        } catch (error: any) {
          console.error("Citation verification failed:", error?.message || error);
        }
      }
    },
  });

  return result.toTextStreamResponse();
}
