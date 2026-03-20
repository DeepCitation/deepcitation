import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { sanitizeForLog, wrapCitationPrompt } from "deepcitation";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 60;

// Available models - using fast/cheap models for examples
const MODELS = {
  openai: openai("gpt-5-mini"),
  gemini: google("gemini-2.0-flash-lite"),
} as const;

type ModelProvider = keyof typeof MODELS;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { allowed, remaining, reason } = checkRateLimit(ip);
  if (!allowed) {
    const message =
      reason === "ip"
        ? "You\u2019ve reached the per-user daily limit (5 queries). Fork this example and add your own API keys to remove the limit."
        : "Daily query limit reached. Fork this example and add your own API keys to remove the limit.";
    const nowMs = Date.now();
    const midnightMs =
      new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime() + 86_400_000;
    const retryAfter = String(Math.ceil((midnightMs - nowMs) / 1000));
    return new Response(JSON.stringify({ error: message }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": retryAfter },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { messages, provider = "openai", fileDataParts: clientFileDataParts = [], deepTextPromptPortions = [] } = body;

  console.log("[Chat API] Received messages:", JSON.stringify(messages?.slice(-1), null, 2));

  const fileDataParts: Array<{ attachmentId: string; filename?: string }> = clientFileDataParts;

  // deepTextPromptPortions is passed from the client (accumulated per upload)
  const deepTextPromptPortion: string[] = deepTextPromptPortions;

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

  // Validate and select model based on provider
  const validatedProvider: ModelProvider = (provider in MODELS) ? provider as ModelProvider : "openai";
  const selectedModel = MODELS[validatedProvider];

  // Stream the response
  const result = streamText({
    model: selectedModel,
    system: enhancedSystemPrompt,
    messages: modelMessages,
  });

  return result.toTextStreamResponse();
}
