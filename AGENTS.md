# AGENTS.md

This package implements DeepCitation, a TypeScript library for citation extraction, normalization, verification, and proof rendering for AI-generated content.

Use progressive disclosure: keep this file minimal and load focused guidance only when relevant.

## Environment

- Package manager: `npm`
- Node: `>=18`
- Build: `npm run build`
- Lint/format: `npm run check:fix` then `npm run lint`
- Tests: `npm test` and `npm run test:ct`

## Always-Applicable Invariants

- Product name is `DeepCitation` (never `DeepCite`).
- Example app models must remain `gpt-5-mini` (OpenAI) and `gemini-2.0-flash-lite` (Google).
- Strip `<<<CITATION_DATA>>>` before displaying model output.
- Use `extractVisibleText()` before displaying model output to users.

## Guidance Router

- Working on implementation, tests, CI, exports, security, or PR prep:
  [docs/agents/engineering-rules.md](./docs/agents/engineering-rules.md)
- Working on citation UI behavior, popovers, timestamps, SSR, or overflow/layout:
  [docs/agents/react-citation-ui.md](./docs/agents/react-citation-ui.md)
- Working on package API usage, capabilities, or service endpoints:
  [docs/agents/package-reference.md](./docs/agents/package-reference.md)

If multiple domains apply, open only the relevant files above instead of loading everything.
