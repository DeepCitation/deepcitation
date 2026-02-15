import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { sanitizeForLog, type FileDataPart, wrapCitationPrompt } from "@deepcitation/deepcitation-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const maxDuration = 60;

// Available models - using fast/cheap models for examples
const MODELS = {
  openai: openai("gpt-5-mini"),
  gemini: google("gemini-2.0-flash-lite"),
} as const;

type ModelProvider = keyof typeof MODELS;

export async function POST(req: Request) {
  const { messages, provider = "openai", fileDataParts: clientFileDataParts = [] } = await req.json();

  console.log("[Chat API] Received messages:", JSON.stringify(messages?.slice(-1), null, 2));

  // fileDataParts now contains deepTextPromptPortion - single source of truth
  const fileDataParts: FileDataPart[] = clientFileDataParts;

  // Extract deepTextPromptPortion from fileDataParts
  const deepTextPromptPortion = fileDataParts.map((f: FileDataPart) => f.deepTextPromptPortion).filter(Boolean);

  const hasDocuments = fileDataParts.length > 0;

  console.log(`[Chat API] ${fileDataParts.length} files, provider=${sanitizeForLog(provider)}`);

  // Helper to extract text content from UI message parts
  const getMessageContent = (msg: UIMessage): string => {
    if (!msg.parts) return "";
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join("");
  };

  // Get the latest user message
  const lastUserMessage = (messages as UIMessage[]).findLast(m => m.role === "user");
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

  // Select model based on provider
  const selectedModel = MODELS[provider as ModelProvider] || MODELS.openai;

  // Stream the response
  const result = streamText({
    model: selectedModel,
    system: enhancedSystemPrompt,
    messages: modelMessages,
  });

  return result.toTextStreamResponse();
}
