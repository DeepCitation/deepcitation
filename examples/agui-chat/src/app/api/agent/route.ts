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
  getVerificationTextIndicator,
  sanitizeForLog,
  wrapCitationPrompt,
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
import { checkRateLimit } from "@/lib/rateLimit";
import { CORPUS_SOURCES, type CorpusSource } from "@/lib/corpus";

// Check for API keys at startup
const dcApiKey = process.env.DEEPCITATION_API_KEY;
if (!dcApiKey) {
  console.error(
    "\n⚠️  DEEPCITATION_API_KEY is not set!\n" +
      "   1. Copy .env.example to .env\n" +
      "   2. Get your API key from https://deepcitation.com/keys\n" +
      "   3. Add it to .env: DEEPCITATION_API_KEY=sk-dc-your-key\n",
  );
}

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error("\n⚠️  OPENAI_API_KEY is not set!\n");
}

// endUserId is a static app-level label here. In a multi-user deployment replace it
// with a real per-user identifier so DeepCitation usage is tracked per user.
const dc = dcApiKey ? new DeepCitation({ apiKey: dcApiKey, endUserId: "agui-chat" }) : null;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const textEncoder = new TextEncoder();

interface FileDataPart {
  attachmentId: string;
  filename?: string;
}

// ---------------------------------------------------------------------------
// Corpus attachment resolution (mirrors langchain-rag-chat/src/lib/rag.ts)
// ---------------------------------------------------------------------------
// Each corpus source may have a cached attachmentId stored as an env var.
// When set we call the lightweight getAttachment() instead of re-uploading.
// All sources are resolved eagerly at module load so the first request
// doesn't pay the upload cost.
// ---------------------------------------------------------------------------

const preparedAttachmentCache = new Map<
  string,
  Promise<{ attachmentId: string; deepTextPromptPortion: string }>
>();

async function resolveAttachment(
  dcClient: DeepCitation,
  source: CorpusSource,
): Promise<{ attachmentId: string; deepTextPromptPortion: string }> {
  const savedId = process.env[source.attachmentEnvVar];

  if (savedId) {
    try {
      const attachment = await dcClient.getAttachment(savedId);
      if (attachment.deepTextPromptPortion) {
        return { attachmentId: savedId, deepTextPromptPortion: attachment.deepTextPromptPortion };
      }
      console.warn(
        `[DeepCitation] ${source.attachmentEnvVar}=${savedId} did not return deepTextPromptPortion — re-uploading.`,
      );
    } catch (err) {
      console.warn(
        `[DeepCitation] Cached ${source.attachmentEnvVar}=${savedId} failed (${err instanceof Error ? err.message : err}) — re-uploading.`,
      );
    }
  }

  const response = await fetch(source.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch "${source.filename}": ${response.status} ${response.statusText}`);
  }
  const file = Buffer.from(await response.arrayBuffer());
  const prepared = await dcClient.prepareAttachments([{ file, filename: source.filename }]);
  const attachmentId = prepared.fileDataParts[0].attachmentId;

  console.log(
    `[DeepCitation] Uploaded "${source.title}". Add to env to skip re-upload on cold starts:\n  ${source.attachmentEnvVar}=${attachmentId}`,
  );

  return { attachmentId, deepTextPromptPortion: prepared.deepTextPromptPortion };
}

function cacheAttachment(
  dcClient: DeepCitation,
  source: CorpusSource,
): Promise<{ attachmentId: string; deepTextPromptPortion: string }> {
  const pending = resolveAttachment(dcClient, source);
  preparedAttachmentCache.set(source.id, pending);
  pending.catch(() => preparedAttachmentCache.delete(source.id));
  return pending;
}

function getAttachmentPromise(
  dcClient: DeepCitation,
  source: CorpusSource,
): Promise<{ attachmentId: string; deepTextPromptPortion: string }> {
  const existing = preparedAttachmentCache.get(source.id);
  if (existing) return existing;
  return cacheAttachment(dcClient, source);
}

// Kick off warmup for all corpus sources immediately (fire-and-forget).
if (dc) {
  for (const source of CORPUS_SOURCES) {
    cacheAttachment(dc, source);
  }
}

export const maxDuration = 120; // LLM streaming + verification can exceed default timeout

export async function POST(req: Request) {
  // NOTE: x-forwarded-for is client-controlled behind Vercel's edge network — the
  // leftmost value can be spoofed to bypass the per-IP cap. This is acceptable for a
  // demo. For a production deployment use `x-real-ip` or Next.js edge middleware's
  // `request.ip`, which Vercel sets from the trusted edge layer.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { allowed, reason } = checkRateLimit(ip);
  if (!allowed) {
    const message =
      reason === "ip"
        ? "You\u2019ve reached the per-user daily limit (5 queries). Fork this example and add your own API keys to remove the limit."
        : "Daily query limit reached. Fork this example and add your own API keys to remove the limit.";
    const nowMs = Date.now();
    const d = new Date();
    const midnightMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    const retryAfter = String(Math.ceil((midnightMs - nowMs) / 1000));
    return new Response(JSON.stringify({ error: message }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": retryAfter },
    });
  }

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
  let fileDataParts: FileDataPart[] = state?.fileDataParts ?? [];
  let deepTextPromptPortions: string[] = state?.deepTextPromptPortions ?? [];

  // When no user-uploaded files, use pre-resolved corpus attachments
  if (fileDataParts.length === 0 && dc) {
    const corpusResults = await Promise.all(
      CORPUS_SOURCES.map(source => getAttachmentPromise(dc, source)),
    );
    fileDataParts = corpusResults.map((r, i) => ({
      attachmentId: r.attachmentId,
      filename: CORPUS_SOURCES[i].filename,
    }));
    deepTextPromptPortions = corpusResults.map(r => r.deepTextPromptPortion);
  }

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
            const citationEntries = Object.entries(citations);
            console.log(`[agui-chat] Parsed ${citationCount} citation(s) from LLM output`);
            for (const [key, citation] of citationEntries) {
              console.log(
                `[agui-chat] Citation ${key}: anchor="${citation.anchorText ?? ""}" full="${citation.fullPhrase ?? ""}" ` +
                  `pageId="${citation.startPageId ?? ""}" lineIds="${citation.lineIds?.join(",") ?? ""}"`,
              );
            }

            const result = await dc.verify(
              { llmOutput: fullResponse, outputImageFormat: "avif" },
              citations,
            );

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

            for (const [key, verification] of Object.entries(verifications)) {
              const indicator = getVerificationTextIndicator(verification);
              const status = getCitationStatus(verification);
              console.log(
                `[agui-chat] Verification ${key}: ${indicator} status="${verification.status ?? "unknown"}" ` +
                  `verified=${status.isVerified} partial=${status.isPartialMatch} miss=${status.isMiss}`,
              );
            }

            for (const [key] of citationEntries) {
              if (!verifications[key]) {
                console.log(`[agui-chat] Missing verification for citation key: ${key}`);
              }
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
