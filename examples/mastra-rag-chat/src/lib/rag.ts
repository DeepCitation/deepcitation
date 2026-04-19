import { MDocument } from "@mastra/rag";
import { LibSQLVector } from "@mastra/libsql";
import { embedMany } from "ai";
import { openai as openaiProvider } from "@ai-sdk/openai";
import OpenAI from "openai";
import { DeepCitation } from "deepcitation/client";
import {
  ValidationError,
  extractVisibleText,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
} from "deepcitation";
import { wrapCitationPrompt } from "deepcitation/prompts";
import { CORPUS_SOURCES, type CorpusSource } from "@/lib/corpus";
import type { ChatResponse, RetrievedSource, VerificationSummary } from "@/lib/types";

const deepCitationApiKey = process.env.DEEPCITATION_API_KEY;
const openAiApiKey = process.env.OPENAI_API_KEY;

// endUserId is a static app-level label here. In a multi-user deployment replace it
// with a per-user identifier so DeepCitation can attribute usage correctly.
const deepCitation = deepCitationApiKey
  ? new DeepCitation({ apiKey: deepCitationApiKey, endUserId: "mastra-rag-chat" })
  : null;
const openai = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;

const embeddingModel = openaiProvider.embedding("text-embedding-3-small");
const INDEX_NAME = "corpus";

// Module-level singleton — fine for local dev; serverless cold starts rebuild the store,
// and warm instances share it across requests (safe here since the store is read-only).
// Eagerly initialized so the vector store builds in parallel with attachment warmup,
// cutting cold-start latency roughly in half vs. waiting for the first request.
let vectorStorePromise: Promise<LibSQLVector> | null = openAiApiKey ? buildVectorStore() : null;
const preparedAttachmentCache = new Map<
  string,
  Promise<{ attachmentId: string; deepTextPages: string[] }>
>();

const MAX_RETRIEVED_SOURCES = 2;

// ---------------------------------------------------------------------------
// Attachment resolution
// ---------------------------------------------------------------------------
// Each corpus source may have a cached attachmentId stored as an env var
// (e.g. DEEPCITATION_ATTACHMENT_YC_SAFE). When the var is set we call the
// lightweight getAttachment() instead of re-uploading the full PDF on every
// cold start. If deepTextPages is absent from that response (it is
// optional) we fall back to uploading.
//
// All four sources are resolved eagerly at module load so the first request
// doesn't pay the upload cost. Errors surface per-request via the rejected
// promise stored in the cache.
// ---------------------------------------------------------------------------

async function resolveAttachment(
  dc: DeepCitation,
  source: CorpusSource,
): Promise<{ attachmentId: string; deepTextPages: string[] }> {
  const savedId = process.env[source.attachmentEnvVar];

  if (savedId) {
    try {
      const attachment = await dc.getAttachment(savedId);
      const attachmentPages =
        (attachment as { deepTextPages?: string[]; pageTexts?: string[] }).deepTextPages ??
        attachment.pageTexts ??
        [];
      if (attachmentPages.length) {
        return { attachmentId: savedId, deepTextPages: attachmentPages };
      }
      console.warn(
        `[DeepCitation] ${source.attachmentEnvVar}=${savedId} did not return deepTextPages — re-uploading.`,
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
  const prepared = await dc.prepareAttachments([{ file, filename: source.filename }]);
  const attachmentId = prepared.fileDataParts[0].attachmentId;
  const deepTextPages = prepared.deepTextPagesByAttachmentId[attachmentId] ?? [];

  console.log(
    `[DeepCitation] Uploaded "${source.title}". Add to env to skip re-upload on cold starts:\n  ${source.attachmentEnvVar}=${attachmentId}`,
  );

  return { attachmentId, deepTextPages };
}

function cacheAttachment(
  dc: DeepCitation,
  source: CorpusSource,
): Promise<{ attachmentId: string; deepTextPages: string[] }> {
  const pending = resolveAttachment(dc, source);
  preparedAttachmentCache.set(source.id, pending);
  pending.catch(() => preparedAttachmentCache.delete(source.id));
  return pending;
}

function getAttachmentPromise(
  dc: DeepCitation,
  source: CorpusSource,
): Promise<{ attachmentId: string; deepTextPages: string[] }> {
  const existing = preparedAttachmentCache.get(source.id);
  if (existing) return existing;
  return cacheAttachment(dc, source);
}

// Kick off warmup for all sources immediately (fire-and-forget).
// Warm serverless instances reuse the cache; cold starts begin resolving
// before the first request arrives, cutting per-request latency.
if (deepCitation) {
  for (const source of CORPUS_SOURCES) {
    cacheAttachment(deepCitation, source);
  }
}

function getRequiredClient(): DeepCitation {
  if (!deepCitationApiKey || !deepCitation) {
    throw new Error("DEEPCITATION_API_KEY is not set. Add it to your environment variables.");
  }

  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to your environment variables.");
  }

  return deepCitation;
}

function getRequiredOpenAiClient(): OpenAI {
  if (!openAiApiKey || !openai) {
    throw new Error("OPENAI_API_KEY is not set. Add it to your environment variables.");
  }

  return openai;
}

async function buildVectorStore(): Promise<LibSQLVector> {
  // file: URL gives a persistent SQLite file that survives across async operations.
  // :memory: has a known issue with @libsql/client where the database is lost between calls.
  const vectorStore = new LibSQLVector({
    id: "deepcitation-rag",
    url: "file:/tmp/deepcitation-mastra-rag.db",
  });

  await vectorStore.createIndex({
    indexName: INDEX_NAME,
    dimension: 1536,
    metric: "cosine",
  });

  // Chunk all corpus sources using Mastra's MDocument
  const allChunks: { text: string; metadata: Record<string, string> }[] = [];

  for (const source of CORPUS_SOURCES) {
    const doc = MDocument.fromText(source.retrievalText, {
      sourceId: source.id,
      title: source.title,
      filename: source.filename,
    });
    const chunks = await doc.chunk({
      strategy: "recursive",
      maxSize: 180,
      overlap: 32,
    });

    for (const chunk of chunks) {
      const chunkText = typeof chunk === "string" ? chunk : chunk.text;
      allChunks.push({
        text: chunkText,
        metadata: {
          sourceId: source.id,
          title: source.title,
          filename: source.filename,
          text: chunkText,
        },
      });
    }
  }

  // Batch embed all chunks
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: allChunks.map(c => c.text),
  });

  // Upsert into the vector store
  await vectorStore.upsert({
    indexName: INDEX_NAME,
    vectors: embeddings,
    metadata: allChunks.map(c => c.metadata),
  });

  return vectorStore;
}

async function getVectorStore(): Promise<LibSQLVector> {
  vectorStorePromise ??= buildVectorStore();
  return vectorStorePromise;
}

function getSourceById(sourceId: string): CorpusSource {
  const source = CORPUS_SOURCES.find(item => item.id === sourceId);
  if (!source) {
    throw new Error(`Unknown corpus source: ${sourceId}`);
  }
  return source;
}

async function retrieveSources(question: string): Promise<RetrievedSource[]> {
  const store = await getVectorStore();

  // Mastra requires pre-embedded query vector (unlike LangChain which embeds internally)
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: [question],
  });
  const [queryVector] = embeddings;

  const results = await store.query({
    indexName: INDEX_NAME,
    queryVector,
    topK: MAX_RETRIEVED_SOURCES * 2,
  });

  const deduped = new Map<string, RetrievedSource>();

  for (const result of results) {
    const sourceId = String(result.metadata?.sourceId);
    if (deduped.has(sourceId)) continue;

    deduped.set(sourceId, {
      sourceId,
      title: String(result.metadata?.title),
      filename: String(result.metadata?.filename),
      score: Number((result.score ?? 0).toFixed(3)),
      // LibSQLVector returns chunk text in metadata, not as document content
      excerpt: String(result.metadata?.text ?? ""),
    });

    if (deduped.size === MAX_RETRIEVED_SOURCES) break;
  }

  if (deduped.size > 0) {
    return Array.from(deduped.values());
  }

  return CORPUS_SOURCES.slice(0, 2).map(source => ({
    sourceId: source.id,
    title: source.title,
    filename: source.filename,
    score: 0,
    excerpt: source.retrievalText,
  }));
}


function buildRetrievalNarrative(retrievedSources: RetrievedSource[]): string {
  return retrievedSources
    .map(
      source =>
        `- ${source.title} (${source.filename}, similarity=${source.score}): ${source.excerpt}`,
    )
    .join("\n");
}

function getModelText(
  content:
    | string
    | Array<
        | { type?: string; text?: string }
        | { content?: Array<{ type?: string; text?: string }> }
      >,
): string {
  if (typeof content === "string") return content;

  return content
    .flatMap(part => {
      if (typeof part !== "object" || !part) return [];
      if ("text" in part && part.type === "text" && typeof part.text === "string") {
        return [part.text];
      }
      if ("content" in part && Array.isArray(part.content)) {
        return part.content
          .filter(
            (nested): nested is { type: "output_text"; text: string } =>
              typeof nested === "object" && nested.type === "output_text" && typeof nested.text === "string",
          )
          .map(nested => nested.text);
      }
      return [];
    })
    .join("");
}

export function summarizeVerifications(summaryInput: ChatResponse["verifications"]): VerificationSummary {
  let verified = 0;
  let partial = 0;
  let missed = 0;
  let pending = 0;

  for (const verification of Object.values(summaryInput)) {
    const status = getCitationStatus(verification);

    // Buckets are mutually exclusive: partial_text_found goes into partial only.
    if (status.isPartialMatch) {
      partial += 1;
    } else if (status.isVerified) {
      verified += 1;
    } else if (status.isMiss) {
      missed += 1;
    } else if (status.isPending) {
      pending += 1;
    }
  }

  return {
    total: Object.keys(summaryInput).length,
    verified,
    partial,
    missed,
    pending,
  };
}

async function runAnswerQuestion(
  dc: DeepCitation,
  openAiClient: OpenAI,
  question: string,
): Promise<ChatResponse> {
  // Ensure all attachment warmups are resolved before we need them. On warm
  // instances the promises are already settled; on cold starts this runs in
  // parallel with retrieveSources below, so neither blocks the other.
  const allAttachmentsReady = Promise.all(CORPUS_SOURCES.map(source => getAttachmentPromise(dc, source)));

  const retrievedSources = await retrieveSources(question);
  await allAttachmentsReady;

  const sourceDefs = retrievedSources.map(source => getSourceById(source.sourceId));
  const preparedSources = await Promise.all(sourceDefs.map(source => getAttachmentPromise(dc, source)));

  const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
    systemPrompt:
      "You are a precise research assistant. Answer only from the retrieved documents. Cite every factual claim.",
    userPrompt: [
      `Question: ${question}`,
      "",
      "Retrieved source summary:",
      buildRetrievalNarrative(retrievedSources),
      "",
      "If the answer is not supported by the retrieved sources, say so plainly.",
    ].join("\n"),
    deepTextPagesByAttachmentId: Object.fromEntries(
      preparedSources.map(item => [item.attachmentId, item.deepTextPages]),
    ),
  });

  const response = await openAiClient.responses.create({
    model: "gpt-5-mini",
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: enhancedSystemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: enhancedUserPrompt }],
      },
    ],
  });

  const rawLlmOutput = getModelText(response.output ?? []).trim();
  const citations = getAllCitationsFromLlmOutput(rawLlmOutput);
  const verificationResult = await dc.verify(
    {
      llmOutput: rawLlmOutput,
      outputImageFormat: "avif",
    },
    citations,
  );

  return {
    visibleText: extractVisibleText(rawLlmOutput).trim(),
    // rawLlmOutput is sent to the client so renderMessageContent can re-parse citation
    // markers inline. In production you'd drop it from the API response and accept
    // pre-parsed `pieces` from the server instead to avoid the citation block crossing the wire.
    rawLlmOutput,
    citations,
    verifications: verificationResult.verifications,
    summary: summarizeVerifications(verificationResult.verifications),
    retrievedSources,
  };
}

export async function answerQuestion(question: string): Promise<ChatResponse> {
  const dc = getRequiredClient();
  const openAiClient = getRequiredOpenAiClient();
  try {
    return await runAnswerQuestion(dc, openAiClient, question);
  } catch (err) {
    if (err instanceof ValidationError && err.statusCode === 404) {
      // Cached attachment IDs expired on the server — clear the cache so fresh
      // uploads are used, then retry the full LLM + verify pipeline.
      console.warn("[DeepCitation] Attachment expired — clearing cache and retrying.");
      preparedAttachmentCache.clear();
      return await runAnswerQuestion(dc, openAiClient, question);
    }
    throw err;
  }
}
