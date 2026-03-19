# LangChain RAG Chat Example

A runnable RAG example built with Next.js, LangChain.js, and DeepCitation.

This example uses:

- `LangChain.js` for chunking, embeddings, and in-memory retrieval
- `Next.js` for the local UI and API route
- `DeepCitation` for prompt wrapping, citation extraction, verification, and inline proof UI

It ships with a tiny bundled PDF corpus, so there is no upload flow, database, or vector store setup.

## Quick Start

```bash
cd examples/langchain-rag-chat
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required Environment Variables

```bash
DEEPCITATION_API_KEY=dc-...
OPENAI_API_KEY=sk-...
```

For local validation in this repo, you can copy the values from `../basic-verification/.env`.

## How It Works

1. The example loads three bundled PDFs from `./corpus`.
2. LangChain chunks the matching text and indexes it in an in-memory `MemoryVectorStore`.
3. When you ask a question, the server retrieves the most relevant sources.
4. The server uploads only those retrieved source PDFs to DeepCitation.
5. `wrapCitationPrompt()` adds the citation-aware document payload to the LLM prompt.
6. The model answers with numeric citation markers plus `<<<CITATION_DATA>>>`.
7. DeepCitation verifies the citations and the UI renders them with `CitationComponent`.

## Try These Questions

- `Which company reported 42 percent revenue growth, and what else did management say?`
- `What changed in the Solena battery safety pilot?`
- `How did Aster Health improve onboarding and activation?`

## Notes

- The example uses `gpt-5-mini` for answer generation.
- The vector store is process-local and rebuilt on startup.
- Source attachments are cached in memory after the first request to avoid re-uploading the same PDFs on every question.
