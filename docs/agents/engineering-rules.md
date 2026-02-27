# Engineering Rules

Open this file for implementation workflow, security, tests, exports, and PR quality gates.

## Pre-Submission Checklist

Run these before opening a PR:

1. `npm run check:fix`
2. `npm run lint`
3. `npm run build`
4. `bun run test`
5. `npm run size`
6. Verify all new public functions/types are exported from `src/index.ts` or `src/react/index.ts`.
7. If you extracted a shared constant/utility, remove remaining duplicates.
8. Ensure PR description matches diff scope (`git diff main...HEAD --stat`).

`npm run check:fix` is required before lint because CI runs `biome ci ./src` in check-only mode.

## Code Conventions

- TypeScript with strict typing and ESM modules.
- Tests are colocated in `src/__tests__/`.
- Prefer lightweight custom implementations over heavy dependencies to protect bundle size.
- Keep react module bundle size at or below 15KB (`npm run size`).

## Testing Rules

- Tests must validate implemented behavior, not aspirational behavior.
- Avoid generic testing suggestions unless a specific gap is identified.

Current suites:

- Unit tests: parsing/normalization, security utilities, hooks, rendering, client errors, date utils.
- Playwright component tests: popover interactions, overflow/width, visual snapshots, variants, URL citations, drawer/markdown/render-target showcases.

When to add tests:

- New component: unit test + Playwright visual/component test.
- New hook: hook test via `renderHook`.
- Styling/visual change: run `npm run test:ct`; update snapshots intentionally.
- Security change: add dedicated cases under security test coverage.
- New rendering target: add target-specific rendering tests.

## Security Patterns

Use existing utilities in `src/utils/` and avoid ad-hoc equivalents.

- Domain checks: use `isDomainMatch()` (not substring checks like `url.includes(...)`).
- Object assignment from untrusted keys: use `safeAssign()` / `safeMerge()`.
- Regex on untrusted input: use `safeMatch()` / `safeReplace()` / `safeTest()`.
- Logging untrusted strings: sanitize with `sanitizeForLog()`.
- Image source validation: use `isValidProofImageSrc()` before rendering user-controlled URLs.

## Canonical Import/Export Policy

- Do not create variable re-export wrappers or alias constants/functions.
- Keep each variable/function/class in one canonical definition file.
- Import symbols from canonical locations directly.
- Type-only re-exports are acceptable.

## PR Description Rules

- Description must match actual diff.
- Do not mention version numbers/files/changes not in the diff.
- Call out security-sensitive changes explicitly.
- Flag breaking changes to API/types/component props.
- Explain what changed and why.
