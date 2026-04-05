---
layout: default
title: Mastra
parent: Frameworks
nav_order: 6
description: "Using DeepCitation with Mastra RAG pipelines"
commit_sha: "80dfecd"
stale_after_commits: 20
watch_paths:
  - src/client/DeepCitation.ts
  - examples/mastra-rag-chat/
---

# DeepCitation + Mastra

Integrate citation verification into Mastra RAG pipelines. Mastra's `MDocument` chunking + vector search handles retrieval, DeepCitation verifies that the LLM's claims match the source documents.

{: .note }
A complete, runnable example is available at [mastra-rag-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/mastra-rag-chat) ([live demo](https://mastra-rag-deepcitation.vercel.app/)).

---

## Install

```bash
npm install deepcitation @mastra/rag @mastra/libsql ai @ai-sdk/openai openai
```

---

## Architecture

```
[PDF Sources] → MDocument.chunk() → Vector Store → Query → Retrieved Chunks
                                                              ↓
                                              DeepCitation.prepareAttachments()
                                                              ↓
                                              wrapCitationPrompt() → LLM → verify()
```

Mastra handles the RAG pipeline (chunking, embedding, retrieval). DeepCitation adds the verification layer: prepare the source PDFs, wrap the prompt with citation instructions, and verify the LLM's output against the originals.

---

## Key Integration Pattern

```typescript
import { MDocument } from "@mastra/rag";
import { LibSQLVector } from "@mastra/libsql";
import { DeepCitation, wrapCitationPrompt } from "deepcitation";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// 1. Chunk and index your corpus with Mastra
const doc = MDocument.fromText(sourceText, { sourceId: "report" });
const chunks = await doc.chunk({ strategy: "recursive", maxSize: 180, overlap: 32 });
// ... embed and upsert into LibSQLVector ...

// 2. Prepare source PDFs for DeepCitation
const { fileDataParts, deepTextPages } = await dc.prepareAttachments([
  { file: pdfBuffer, filename: "report.pdf" },
]);

// 3. On each query: retrieve chunks, then verify citations
const retrievedChunks = await vectorStore.query({ indexName: "corpus", queryVector, topK: 3 });

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a research assistant that cites sources.",
  userPrompt: userQuestion,
  deepTextPages,
});

const response = await openai.chat.completions.create({
  model: "gpt-5-mini",
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    { role: "user", content: enhancedUserPrompt },
  ],
});

// 4. Verify citations
const { verifications } = await dc.verify({
  llmOutput: response.choices[0].message.content,
});
```

---

## Caching Attachments Across Requests

Uploading PDFs on every request is wasteful. Cache the `attachmentId` and reuse it:

```typescript
const cache = new Map<string, Promise<{ attachmentId: string; deepTextPages: string[] }>>();

async function getAttachment(source: { id: string; url: string; filename: string }) {
  const existing = cache.get(source.id);
  if (existing) return existing;

  const pending = (async () => {
    // Check for a pre-cached attachment ID (e.g., from env vars)
    const savedId = process.env[`DEEPCITATION_ATTACHMENT_${source.id.toUpperCase()}`];
    if (savedId) {
      const attachment = await dc.getAttachment(savedId);
      if (attachment.deepTextPages?.length) {
        return { attachmentId: savedId, deepTextPages: attachment.deepTextPages };
      }
    }

    // Upload fresh
    const file = Buffer.from(await (await fetch(source.url)).arrayBuffer());
    const prepared = await dc.prepareAttachments([{ file, filename: source.filename }]);
    return {
      attachmentId: prepared.fileDataParts[0].attachmentId,
      deepTextPages: prepared.deepTextPages,
    };
  })();

  // Evict on failure so the next call retries instead of returning a rejected promise
  const safe = pending.catch((e) => { cache.delete(source.id); throw e; });
  cache.set(source.id, safe);
  return safe;
}
```

{: .note }
Store `attachmentId` values as environment variables to skip uploads on serverless cold starts. The example app logs the IDs on first upload for easy copy-paste.

---

## Next Steps

- [Getting Started]({{ site.baseurl }}/getting-started/) — Core DeepCitation workflow
- [Components]({{ site.baseurl }}/components/) — Display verified citations in React
- [Vercel AI SDK Guide]({{ site.baseurl }}/frameworks/vercel-ai-sdk/) — If you're using `useChat` / `streamText`
