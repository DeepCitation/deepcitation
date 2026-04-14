# DeepCitation Examples

Complete, runnable examples demonstrating DeepCitation integration patterns.

## Examples

| Example | Description | Best For | Demo |
|---------|-------------|----------|------|
| [**basic-verification**](./basic-verification) | Core 3-step workflow with OpenAI/Anthropic | Learning the basics, quick integration | — |
| [**langchain-rag-chat**](./langchain-rag-chat) | Next.js + LangChain.js RAG app with DeepCitation verification | RAG pipelines, retrieval + proof UI | [Live Demo](https://langchain-rag-chat-deepcitation.vercel.app/) |
| [**mastra-rag-chat**](./mastra-rag-chat) | Next.js + Mastra RAG app with DeepCitation verification | Mastra framework, TypeScript-native RAG | [Live Demo](https://mastra-rag-deepcitation.vercel.app/) |
| [**qmd-local-search**](./qmd-local-search) | CLI example using [qmd](https://github.com/tobi/qmd) as an on-device markdown index with DeepCitation verification | Local-first RAG, privacy-sensitive corpora, offline retrieval | — |
| [**nextjs-ai-sdk**](./nextjs-ai-sdk) | Next.js chat app with Vercel AI SDK | Full-stack apps, streaming UI | [Live Demo](https://nextjs-ai-sdk-deepcitation.vercel.app/) |
| [**agui-chat**](./agui-chat) | AG-UI protocol chat with SSE streaming | AG-UI integration, protocol-level control | [Live Demo](https://agui-chat-deepcitation.vercel.app/) |
| [**static-html**](./static-html) | CDN popover in plain HTML, no build step | Static sites, CDN integration | — |

## Quick Start

```bash
# Clone and navigate to examples
cd packages/deepcitation/examples

# Choose an example
cd basic-verification  # or langchain-rag-chat

# Install and run
npm install
cp .env.example .env   # Add your API keys
npm start
```

## Getting API Keys

1. **DeepCitation** (free): [deepcitation.com/signup](https://deepcitation.com/signup)
2. **OpenAI**: [platform.openai.com](https://platform.openai.com)
3. **Anthropic**: [console.anthropic.com](https://console.anthropic.com)

## Example Details

### Basic Verification

The simplest integration showing the complete workflow:

```typescript
// 1. Upload documents
const { fileDataParts, deepTextPages } = await deepcitation.prepareAttachments([...]);

// 2. Wrap prompts with citation instructions
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt: question,
  deepTextPages,
});

// 3. Call LLM with enhanced prompts
const response = await llm.chat({ messages: [...] });

// 4. Verify citations
const result = await deepcitation.verify({ llmOutput: response });

// 5. Check status
for (const [key, verification] of Object.entries(result.verifications)) {
  const status = getCitationStatus(verification);
  console.log(`Citation ${key}: ${status.isVerified ? "✅" : "❌"}`);
}
```

### Next.js AI SDK

Full-stack chat application with streaming and real-time verification:

```typescript
// API route with AI SDK streaming
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

const result = streamText({
  model: openai("gpt-5-mini"),
  system: enhancedSystemPrompt,
  messages: enhancedMessages,
  async onFinish({ text }) {
    // Verify after streaming completes
    const verifications = await verifyCitations(sessionId, text);
  },
});

return result.toDataStreamResponse();
```

```bash
# Run the Next.js example
cd nextjs-ai-sdk
npm install
npm run dev
# Open http://localhost:3000
```

### LangChain RAG Chat

Runnable RAG app with a bundled local PDF corpus and in-memory vector search:

```typescript
const retrievedSources = await vectorStore.similaritySearch(question, 2);
const prepared = await dc.prepareAttachments(retrievedPdfBuffers);
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt: question,
  deepTextPagesByAttachmentId: Object.fromEntries(
    prepared.map(item => [item.attachmentId, item.deepTextPages]),
  ),
});
```

```bash
# Run the LangChain RAG example
cd langchain-rag-chat
npm install
npm run dev
# Open http://localhost:3000
```

### Mastra RAG Chat

Runnable RAG app using Mastra for chunking and vector search, with in-memory LibSQLVector:

```typescript
const doc = MDocument.fromText(source.retrievalText, metadata);
const chunks = await doc.chunk({ strategy: "recursive", size: 180, overlap: 32 });
const { embeddings } = await embedMany({ model: embeddingModel, values: chunkTexts });
await vectorStore.upsert({ indexName: "corpus", vectors: embeddings, metadata });
```

```bash
# Run the Mastra RAG example
cd mastra-rag-chat
npm install
npm run dev
# Open http://localhost:3000
```

### qmd Local Search

CLI example using [qmd](https://github.com/tobi/qmd) as an on-device markdown
index. Retrieval is local (BM25 + vector + LLM rerank); DeepCitation verifies
the resulting citations against a parallel PDF corpus keyed by filename stem.

```typescript
import { createStore } from "@tobilu/qmd";

const store = await createStore({
  dbPath: "./.qmd-index.sqlite",
  config: { collections: { corpus: { path: "./corpus/md", pattern: "**/*.md" } } },
});

await store.update();
await store.embed(); // first run downloads a GGUF embedding model

const hits = await store.search({ query: question, collection: "corpus", limit: 6 });

// Bridge: each hit.file → corpus/pdf/<stem>.pdf
const pdfUploads = [...new Set(hits.map(h => h.file))].map(mdFile => {
  const pdfPath = mdFileToPdfPath(mdFile);
  return { file: readFileSync(pdfPath), filename: basename(pdfPath) };
});

const { fileDataParts, deepTextPagesByAttachmentId } = await dc.prepareAttachments(pdfUploads);
```

```bash
# Run the qmd example
cd qmd-local-search
bun install          # auto-builds corpus/pdf from corpus/md
cp .env.example .env # add DEEPCITATION_API_KEY + OPENAI_API_KEY
bun run start        # interactive picker
```

## More Resources

- [Full Documentation](https://docs.deepcitation.com/)
- [API Reference](../README.md#api-reference)
- [React Components](../README.md#react-components)
- [Integration Patterns](../README.md#integration-patterns)
