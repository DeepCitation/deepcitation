# AGENTS.md

This package implements DeepCitation, a TypeScript library for citation extraction, normalization, verification, and proof rendering for AI-generated content.

Use progressive disclosure: keep this file minimal and load focused guidance only when relevant.

## Environment

- Package manager: `bun`
- Node: `>=18`
- Build: `bun run build`
- Lint/format: `bun run check:fix` then `bun run lint`
- Tests: `bun run test` and `bun run test:ct`

## Always-Applicable Invariants

- Product name is `DeepCitation` (never `DeepCite`).
- Example app models must remain `gpt-5-mini` (OpenAI) and `gemini-2.0-flash-lite` (Google).
- Strip `<<<CITATION_DATA>>>` before displaying model output.
- Use `extractVisibleText()` before displaying model output to users.
- `CitationRecord` is `Record<string, Citation>` — check emptiness with `Object.keys(citations).length === 0`, not `.length`.

## Guidance Router

- Working on implementation, tests, CI, exports, security, type safety, or PR prep:
  [docs/agents/engineering-rules.md](./docs/agents/engineering-rules.md)
- Working on citation UI behavior, popovers, timestamps, SSR, or overflow/layout:
  [docs/agents/react-citation-ui.md](./docs/agents/react-citation-ui.md)
- Working on animations, transitions, gestures, easing, zoom, drag, haptics, or reduced motion:
  [docs/agents/animation-transition-rules.md](./docs/agents/animation-transition-rules.md)
- Working on field naming, domain model, view states, or claim/source/evidence terminology:
  [docs/agents/deep-citation-concepts.md](./docs/agents/deep-citation-concepts.md)
- Working on package API usage, capabilities, or service endpoints:
  [docs/agents/package-reference.md](./docs/agents/package-reference.md)
- Working on accessibility, focus management, screen readers, or keyboard navigation:
  [docs/agents/a11y-patterns.md](./docs/agents/a11y-patterns.md)
- Working on user-facing strings, aria-labels, translations, or locale files:
  [docs/agents/i18n-policy.md](./docs/agents/i18n-policy.md)
- Looking up canonical import locations for any symbol:
  [docs/agents/canonical-exports.md](./docs/agents/canonical-exports.md)

If multiple domains apply, open only the relevant files above instead of loading everything.
