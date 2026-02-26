/**
 * AG-UI SSE Endpoint — /api/agent
 *
 * Merges the nextjs-ai-sdk's /api/chat + /api/verify into a single SSE stream
 * using AG-UI protocol events. The client receives LLM tokens AND verification
 * results through one connection.
 *
 * Event sequence:
 *   RUN_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT (many)
 *   → TEXT_MESSAGE_END → STATE_DELTA (verifying) → STATE_SNAPSHOT (results)
 *   → RUN_FINISHED
 */

import {
  DeepCitation,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  sanitizeForLog,
  wrapCitationPrompt,
  type FileDataPart,
} from "deepcitation";
import { EventEncoder } from "@ag-ui/encoder";
import OpenAI from "openai";
import {
  runStarted,
  textMessageStart,
  textMessageContent,
  textMessageEnd,
  stateDelta,
  stateSnapshot,
  runFinished,
  runError,
} from "@/lib/agui-events";

// Check for API keys at startup
const dcApiKey = process.env.DEEPCITATION_API_KEY;
if (!dcApiKey) {
  console.error(
    "\n⚠️  DEEPCITATION_API_KEY is not set!\n" +
      "   1. Copy .env.example to .env\n" +
      "   2. Get your API key from https://deepcitation.com/dashboard\n" +
      "   3. Add it to .env: DEEPCITATION_API_KEY=sk-dc-your-key\n",
  );
}

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error("\n⚠️  OPENAI_API_KEY is not set!\n");
}

const deepCitation = dcApiKey ? new DeepCitation({ apiKey: dcApiKey }) : null;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const textEncoder = new TextEncoder();

export const maxDuration = 120; // LLM streaming + verification can exceed default timeout

export async function POST(req: Request) {
  // Per-request encoder — EventEncoder may carry internal state
  const encoder = new EventEncoder();

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { threadId, runId, messages, state } = body;
  const fileDataParts: FileDataPart[] = state?.fileDataParts ?? [];
  const deepTextPromptPortions: string[] = state?.deepTextPromptPortions ?? [];
  const hasDocuments = fileDataParts.length > 0;

  if (!openai) {
    return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Abort controller for client disconnection
  const abortController = new AbortController();

  const messageId = `msg-${runId}`;

  const stream = new ReadableStream({
    async start(controller) {
      /** Encode an AG-UI event and enqueue it as SSE bytes */
      const emit = (event: Parameters<typeof encoder.encode>[0]) => {
        controller.enqueue(textEncoder.encode(encoder.encode(event)));
      };

      try {
        // --- Phase 1: Stream LLM response ---
        emit(runStarted(threadId, runId));

        // Extract user message and prepare prompts
        const lastUserMessage = messages?.findLast(
          (m: { role: string }) => m.role === "user",
        );
        const lastUserContent: string = lastUserMessage?.content ?? "";

        // deepTextPromptPortions is passed from the client (accumulated per upload)
        const deepTextPromptPortion = deepTextPromptPortions;

        const baseSystemPrompt = "You are a helpful assistant that answers questions accurately.";

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

        // Build OpenAI messages from conversation history
        const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system" as const, content: enhancedSystemPrompt },
        ];

        // Add conversation history (all messages except last user message)
        for (const msg of messages ?? []) {
          if (msg === lastUserMessage) continue;
          if (msg.role === "user" || msg.role === "assistant") {
            openaiMessages.push({
              role: msg.role as "user" | "assistant",
              content: msg.content,
            });
          }
        }

        // Add enhanced user message last
        openaiMessages.push({ role: "user" as const, content: enhancedUserPrompt });

        // Start text message stream
        emit(textMessageStart(messageId));

        let fullResponse = "";

        const llmStream = await openai.chat.completions.create(
          {
            model: "gpt-5-mini",
            messages: openaiMessages,
            stream: true,
          },
          { signal: abortController.signal },
        );

        for await (const chunk of llmStream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            emit(textMessageContent(messageId, delta));
          }
        }

        emit(textMessageEnd(messageId));

        // --- Phase 2: Async verification (stream stays open) ---
        if (hasDocuments && dc && fullResponse) {
          emit(
            stateDelta([
              { op: "replace", path: "/verificationStatus", value: "verifying" },
            ]),
          );

          const citations = getAllCitationsFromLlmOutput(fullResponse);
          const citationCount = Object.keys(citations).length;

          if (citationCount > 0) {
            const attachmentId = fileDataParts[0].attachmentId;

            const result = await dc.verifyAttachment(attachmentId, citations, {
              outputImageFormat: "avif",
              generateProofUrls: true,
              proofConfig: {
                access: "signed",
                signedUrlExpiry: "7d",
                imageFormat: "png",
              },
            });

            const { verifications } = result;

            // Calculate summary in a single pass
            let verified = 0;
            let missed = 0;
            let pending = 0;

            for (const [, verification] of Object.entries(verifications)) {
              const status = getCitationStatus(verification);
              if (status.isVerified) verified++;
              if (status.isMiss) missed++;
              if (status.isPending) pending++;
            }

            const summary = {
              total: citationCount,
              verified,
              missed,
              pending,
            };

            emit(
              stateSnapshot({
                citations,
                verifications,
                summary,
                verificationStatus: "complete",
              }),
            );
          } else {
            // No citations found in output
            emit(
              stateSnapshot({
                citations: {},
                verifications: {},
                summary: { total: 0, verified: 0, missed: 0, pending: 0 },
                verificationStatus: "complete",
              }),
            );
          }
        }

        emit(runFinished(threadId, runId));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        emit(runError(sanitizeForLog(message)));
        controller.close();
      }
    },
    cancel() {
      // Client disconnected — abort in-progress LLM/verification calls
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
