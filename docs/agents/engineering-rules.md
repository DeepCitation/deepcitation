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
8. Verify all user-facing strings and aria-labels use i18n keys (no hardcoded text). See `i18n-policy.md`.
9. Ensure PR description matches diff scope (`git diff main...HEAD --stat`).

`npm run check:fix` is required before lint because CI runs `biome ci ./src` in check-only mode.

## Code Conventions

- TypeScript with strict typing and ESM modules.
- Tests are colocated in `src/__tests__/`.
- Prefer lightweight custom implementations over heavy dependencies to protect bundle size.
- Keep react module bundle size at or below 15KB (`npm run size`).

## Citation Type Model

`CitationBase` intentionally carries `attachmentId`, `pageNumber`, `lineIds`, and `startPageId` on **all** citation types, including `UrlCitation`. This is because URL citations are fetched and converted to PDFs before verification — after that conversion, every citation type can carry a page location. A `UrlCitation` without these fields simply hasn't been verified yet.

Do **not** flag these shared fields as "semantically document-only" in code reviews. For field naming conventions and domain binding rules, see [concepts.md](./concepts.md). The correct mental model is:

> All citations are potentially verifiable against a page-indexed document. The `type` discriminator indicates the *source* of the citation, not whether page/line fields will be populated.

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

## Performance

- No N+1 query patterns
- No performance anti-patterns
- No unnecessary re-renders, or inefficient algorithms
- `useMemo`/`useCallback` dependency arrays complete

## Enhance Clarity: Simplify code structure by:

- Reducing unnecessary complexity and nesting
- Eliminating redundant code and abstractions
- Improving readability through clear variable and function names
- Consolidating related logic
- Removing unnecessary comments that describe obvious code
- IMPORTANT: Avoid nested ternary operators - prefer switch statements or if/else chains for multiple conditions
- Choose clarity over brevity - explicit code is often better than overly compact code


## Maintain Balance: Avoid over-simplification that could:

- Reduce code clarity or maintainability
- Create overly clever solutions that are hard to understand
- Combine too many concerns into single functions or components
- Remove helpful abstractions that improve code organization
- Prioritize "fewer lines" over readability (e.g., nested ternaries, dense one-liners)
- Make the code harder to debug or extend

## Type Safety

### Discriminated Unions Must Be Complete

When a type uses a discriminator field (e.g., `type: "url" | "document"`), **every function that creates instances of that type must set the discriminator**. After adding or modifying a discriminator field, grep for all constructors, factories, and parsing functions that produce that type and ensure they set the field correctly.

```typescript
// WRONG
return { pageNumber, lineIds, sourceContext }; // Missing type: "document"

// CORRECT
return { type: "document", pageNumber, lineIds, sourceContext };
```

### No Unsafe Casts

**Avoid `as unknown as T` casts.** Use type guards instead. If a cast is truly unavoidable, add a comment explaining why it's safe.

### Export Verification

When adding new public types or functions, verify they are exported from `src/index.ts` or `src/react/index.ts`. Missing exports have required follow-up fix PRs in the past.

## Internal vs External Data

### Line IDs are Internal Only

**Do NOT expose `lineIds` to end users.** Line IDs are internal identifiers used by the verification system — they do not correspond to visible line numbers in documents.

- **Internal use**: `lineIds` for verification matching, stored in `Citation.lineIds`
- **User-facing display**: Show only `pageNumber` (e.g., "Page 3") — never show line IDs
- **Acceptable**: Humanize into relative positions: `Page 3 (expected early, found middle)`

## PR Description Rules

- Description must match actual diff.
- Do not mention version numbers/files/changes not in the diff.
- Call out security-sensitive changes explicitly.
- Flag breaking changes to API/types/component props.
- Explain what changed and why.
