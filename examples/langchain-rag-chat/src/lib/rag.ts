import { readFile } from "node:fs/promises";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import OpenAI from "openai";
import {
  DeepCitation,
  extractVisibleText,
  getAllCitationsFromLlmOutput,
  getCitationStatus,
  wrapCitationPrompt,
} from "deepcitation";
import { CORPUS_SOURCES, getCorpusFilePath, type CorpusSource } from "@/lib/corpus";
import type { ChatResponse, RetrievedSource, VerificationSummary } from "@/lib/types";

const deepCitationApiKey = process.env.DEEPCITATION_API_KEY;
const openAiApiKey = process.env.OPENAI_API_KEY;

const deepCitation = deepCitationApiKey ? new DeepCitation({ apiKey: deepCitationApiKey }) : null;
const openai = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;

let vectorStorePromise: Promise<MemoryVectorStore> | null = null;
const preparedAttachmentCache = new Map<
  string,
  Promise<{ attachmentId: string; deepTextPromptPortion: string }>
>();

function getRequiredClient(): DeepCitation {
  if (!deepCitationApiKey || !deepCitation) {
    throw new Error("DEEPCITATION_API_KEY is missing. Copy examples/basic-verification/.env into .env.local.");
  }

  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is missing. Copy examples/basic-verification/.env into .env.local.");
  }

  return deepCitation;
}

function getRequiredOpenAiClient(): OpenAI {
  if (!openAiApiKey || !openai) {
    throw new Error("OPENAI_API_KEY is missing. Copy examples/basic-verification/.env into .env.local.");
  }

  return openai;
}

async function buildVectorStore(): Promise<MemoryVectorStore> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 180,
    chunkOverlap: 32,
  });

  const documents = await splitter.createDocuments(
    CORPUS_SOURCES.map(source => source.retrievalText),
    CORPUS_SOURCES.map(source => ({
      sourceId: source.id,
      title: source.title,
      filename: source.filename,
    })),
  );

  return MemoryVectorStore.fromDocuments(
    documents,
    new OpenAIEmbeddings({
      apiKey: openAiApiKey,
      model: "text-embedding-3-small",
    }),
  );
}

async function getVectorStore(): Promise<MemoryVectorStore> {
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
  const matches = await store.similaritySearchWithScore(question, 4);
  const deduped = new Map<string, RetrievedSource>();

  for (const [document, score] of matches) {
    const sourceId = String(document.metadata.sourceId);
    if (deduped.has(sourceId)) continue;

    deduped.set(sourceId, {
      sourceId,
      title: String(document.metadata.title),
      filename: String(document.metadata.filename),
      score: Number(score.toFixed(3)),
      excerpt: document.pageContent,
    });

    if (deduped.size === 2) break;
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

async function prepareAttachment(
  dc: DeepCitation,
  source: CorpusSource,
): Promise<{ attachmentId: string; deepTextPromptPortion: string }> {
  const existing = preparedAttachmentCache.get(source.id);
  if (existing) return existing;

  const pending = (async () => {
    const file = await readFile(getCorpusFilePath(source.filename));
    const prepared = await dc.prepareAttachments([
      {
        file,
        filename: source.filename,
      },
    ]);

    return {
      attachmentId: prepared.fileDataParts[0].attachmentId,
      deepTextPromptPortion: prepared.deepTextPromptPortion,
    };
  })();

  preparedAttachmentCache.set(source.id, pending);
  return pending;
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

    if (status.isVerified) {
      verified += 1;
      if (status.isPartialMatch) partial += 1;
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

export async function answerQuestion(question: string): Promise<ChatResponse> {
  const dc = getRequiredClient();
  const openAiClient = getRequiredOpenAiClient();
  const retrievedSources = await retrieveSources(question);
  const sourceDefs = retrievedSources.map(source => getSourceById(source.sourceId));
  const preparedSources = await Promise.all(sourceDefs.map(source => prepareAttachment(dc, source)));

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
    deepTextPromptPortion: preparedSources.map(item => item.deepTextPromptPortion),
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
    rawLlmOutput,
    citations,
    verifications: verificationResult.verifications,
    summary: summarizeVerifications(verificationResult.verifications),
    retrievedSources,
  };
}
