# qmd Local Search + DeepCitation

CLI example pairing [qmd](https://github.com/tobi/qmd) (on-device markdown
search: BM25 + vector + LLM rerank) with DeepCitation for citation
verification. Retrieval runs locally against `corpus/md/*.md`; verification
runs against the parallel `corpus/pdf/*.pdf`, keyed by filename stem.

## Why both?

qmd is markdown-native; DeepCitation's verifier ingests PDFs (plain-text
input is on the roadmap but not yet shipped). So the example ships a
**parallel corpus**: `.md` for qmd to index, `.pdf` for DeepCitation to
verify against. The PDFs are generated from the same markdown by
`scripts/build-corpus.ts` at install time — you edit the markdown, the
PDFs rebuild, filename stems stay in sync.

## Quick start

```bash
cd examples/qmd-local-search
bun install              # also runs scripts/build-corpus.ts (md → pdf)
cp .env.example .env     # add DEEPCITATION_API_KEY + OPENAI_API_KEY

bun run start                           # interactive picker
bun run start "How does Raft ensure safety?"   # one-shot
```

## Prerequisites

- **Node ≥ 22** (required by `@tobilu/qmd` — stricter than deepcitation's
  Node ≥ 18 floor)
- **Bun** (the runner used by all `bun run` scripts — `npm i -g bun`)
- `@tobilu/qmd` has native deps (`better-sqlite3`, `node-llama-cpp`,
  `sqlite-vec`). On first `embed()` qmd downloads a small GGUF embedding
  model (~200 MB). Subsequent runs reuse the cached model and the
  `.qmd-index.sqlite` index.

## What happens when you run it

1. `createStore({ dbPath: ".qmd-index.sqlite", config: { collections: { corpus: ... } } })`
2. `store.update()` scans `corpus/md/**/*.md` and detects changes
3. `store.embed()` generates vector embeddings for any new/changed docs
4. `store.search({ query, collection: "corpus", limit: 6 })` returns
   hybrid-ranked hits
5. For each unique source file, the example reads the matching
   `corpus/pdf/<stem>.pdf` and uploads it via
   `dc.prepareAttachments(...)`
6. `wrapCitationPrompt(...)` injects `deepTextPagesByAttachmentId` into
   the system/user prompts so the LLM emits `<cite attachment_id=... />`
   markers
7. `gpt-5-mini` streams an answer
8. `dc.verify({ llmOutput }, citations)` verifies every citation in a
   single call (multi-attachment is handled by the `attachment_id`
   embedded in each tag)
9. A self-contained HTML report is written to `output/` and opened in
   your browser — click any citation to see the source snippet in a
   popover

## Adding your own docs

1. Drop more `.md` files into `corpus/md/`
2. `bun run build:corpus` — regenerates the parallel PDFs
3. `bun run start` — qmd will auto-detect and re-embed on the next run

## Files

| Path | Purpose |
|------|---------|
| `corpus/md/*.md` | Markdown indexed by qmd |
| `corpus/pdf/*.pdf` | Parallel PDFs verified by DeepCitation (generated, gitignored) |
| `scripts/build-corpus.ts` | pdfkit-based md → pdf builder, runs on `postinstall` |
| `src/index.ts` | Banner / usage |
| `src/shared.ts` | Core pipeline: qmd store + DeepCitation verify + HTML report |
| `src/openai.ts` | OpenAI provider (gpt-5-mini streaming) |
| `src/html-report.ts` | Report renderer (copied from `basic-verification`) |
| `.qmd-index.sqlite` | qmd's on-disk index (gitignored) |
| `output/*.html` | Generated verification reports (gitignored) |

## Swapping retrieval for your real qmd corpus

If you already have a qmd index somewhere else (e.g., your notes folder):

```typescript
const store = await createStore({
  dbPath: "/path/to/your/existing.sqlite",
});
// No `config` block: reopens the existing store with its prior collections.
```

You only need the parallel-PDF bridge if you want DeepCitation verification.
For free-form retrieval without verification, qmd stands alone.
