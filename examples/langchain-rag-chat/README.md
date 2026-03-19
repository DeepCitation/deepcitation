# LangChain RAG Chat Example

A runnable RAG example built with Next.js, LangChain.js, and DeepCitation.

This example uses:

- `LangChain.js` for chunking, embeddings, and in-memory retrieval
- `Next.js` for the local UI and API route
- `DeepCitation` for prompt wrapping, citation extraction, verification, and inline proof UI

It fetches four real PDFs from `deepcitation.com/demo` on first run, so there is no local corpus to check in.

## Quick Start

```bash
cd examples/langchain-rag-chat
npm install
cp .env.example .env.local
# Fill in DEEPCITATION_API_KEY and OPENAI_API_KEY, then:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required Environment Variables

```bash
DEEPCITATION_API_KEY=dc-...
OPENAI_API_KEY=sk-...
```

For local development in this repo, you can copy the values from `../basic-verification/.env`.

## Optional Environment Variables

### Attachment caching (skip PDF re-upload on cold starts)

On first run, the server fetches and uploads each corpus PDF to DeepCitation. The attachment IDs are logged to the console. Paste them here to skip re-uploading on subsequent cold starts:

```bash
DEEPCITATION_ATTACHMENT_YC_SAFE=att_...
DEEPCITATION_ATTACHMENT_NVDA_FORM144=att_...
DEEPCITATION_ATTACHMENT_ATTENTION_IS_ALL_YOU_NEED=att_...
DEEPCITATION_ATTACHMENT_WHY_HALLUCINATE=att_...
```

### Rate limiting

The hosted demo applies two daily caps to prevent runaway API usage:

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_MAX_PER_DAY` | `100` | Global query budget across all users per day |
| `RATE_LIMIT_MAX_PER_IP_PER_DAY` | `5` | Per-IP query budget per day |
| `RATE_LIMIT_DISABLED` | `false` | Set to `true` to disable rate limiting entirely |

Rate limit state is in-process (module-level), so it resets on cold starts — intentionally lenient for a demo. For stricter enforcement use an external store (Redis, KV).

## How It Works

1. On module load, the server fetches and uploads all four corpus PDFs to DeepCitation (or reads from cached attachment IDs in env).
2. LangChain chunks each source's retrieval text and indexes it in an in-memory `MemoryVectorStore`.
3. When you ask a question, the server retrieves the most relevant sources via vector similarity.
4. The server calls `getAttachment()` (or re-uses the warm cache) to get the `deepTextPromptPortion` for each retrieved source.
5. `wrapCitationPrompt()` adds the citation-aware document payload to the LLM prompt.
6. The model answers with numeric citation markers plus `<<<CITATION_DATA>>>`.
7. DeepCitation verifies the citations and the UI renders them with `CitationComponent` and `CitationDrawer`.

## Try These Questions

- `What discount rate applies when the YC SAFE converts, and what triggers a conversion event?`
- `How many NVIDIA shares is Robertson planning to sell, and what is the estimated aggregate market value?`
- `How does multi-head attention work, and why does the Transformer drop recurrence entirely?`
- `What are the root causes of hallucination in language models, and how does RAG reduce them?`

## Notes

- The example uses `gpt-5-mini` for answer generation.
- The vector store is process-local and rebuilt on cold starts.
- Corpus PDFs are served for download via the `/api/corpus/[filename]` route (redirects to the source URL).
