# Mastra RAG Chat with DeepCitation

A Next.js RAG chat application using [Mastra](https://mastra.ai) for document chunking and vector search, with [DeepCitation](https://deepcitation.com) for citation-aware generation and verification.

## What it does

1. **Chunks & embeds** a bundled PDF corpus using Mastra's `MDocument` and the Vercel AI SDK (`embedMany`)
2. **Stores vectors** in Mastra's `LibSQLVector` (in-memory SQLite — zero infrastructure)
3. **Retrieves** the most relevant sources for each question
4. **Generates** a cited answer via OpenAI
5. **Verifies** every citation against source pages using DeepCitation

## Quick start

```bash
npm install
cp .env.example .env.local   # Add your API keys
npm run dev
# Open http://localhost:3000
```

## Required environment variables

| Variable | Description |
|----------|-------------|
| `DEEPCITATION_API_KEY` | Free key from [deepcitation.com/signup](https://deepcitation.com/signup) |
| `OPENAI_API_KEY` | OpenAI key for embeddings + chat |

## Stack

- **Mastra** (`@mastra/rag`, `@mastra/libsql`) — document chunking, in-memory vector store
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`) — embedding via `embedMany`
- **OpenAI** — chat generation (gpt-5-mini)
- **DeepCitation** — citation wrapping, verification, proof images
- **Next.js 16** — full-stack framework

## How it differs from langchain-rag-chat

This example replaces LangChain's `RecursiveCharacterTextSplitter`, `OpenAIEmbeddings`, and `MemoryVectorStore` with Mastra's `MDocument.chunk()`, the Vercel AI SDK's `embedMany()`, and `LibSQLVector`. The key difference: Mastra's vector store requires pre-embedded query vectors (explicit `embedMany` call before `query()`), whereas LangChain embeds internally in `similaritySearchWithScore()`.
