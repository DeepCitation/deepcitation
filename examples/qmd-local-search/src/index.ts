/**
 * DeepCitation + qmd Local Search Example
 *
 * Run: bun run start                      — interactive question picker
 *      bun run start "your question here" — one-shot mode
 */

console.log(`
╔════════════════════════════════════════════════════════════╗
║        DeepCitation + qmd Local Search Example             ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  qmd indexes corpus/md/*.md on-device (BM25 + vector +     ║
║  LLM rerank). DeepCitation verifies every citation in the  ║
║  LLM's answer against the parallel corpus/pdf/*.pdf.       ║
║                                                            ║
║  Run:                                                      ║
║    bun run start                 — interactive picker      ║
║    bun run start "your question" — one-shot                ║
║                                                            ║
║  Prerequisites:                                            ║
║    1. bun install  (auto-builds corpus PDFs)               ║
║    2. cp .env.example .env                                 ║
║    3. Add DEEPCITATION_API_KEY and OPENAI_API_KEY          ║
║                                                            ║
║  Get a free DeepCitation key:                              ║
║    https://deepcitation.com/playground                     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
