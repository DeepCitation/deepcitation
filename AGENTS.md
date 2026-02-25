# AGENTS.md

Instructions for AI coding agents working on the DeepCitation repository.

## Project Overview

DeepCitation is a citation verification library for AI-generated content. Provides citation extraction, normalization, verification against attachments, and visual proof generation.

- **Package**: `deepcitation`
- **License**: MIT
- **Node**: >=18

## Commands

```bash
npm install        # Install dependencies
npm run check:fix  # Auto-fix lint + formatting (Biome) — RUN BEFORE COMMITTING
npm run lint       # Verify lint/format passes (same as CI: biome ci ./src)
npm run build      # Build library (tsup + CSS)
npm test           # Run tests (bun test)
npm run test:ct    # Playwright component tests
npm run size       # Check bundle size
```

## Pre-Submission Checklist

Before opening a PR, run and confirm these pass:

1. `npm run check:fix` — auto-fix lint and formatting issues (Biome). **Run this first — it's the most common CI failure.**
2. `npm run lint` — verify lint/format passes cleanly (`biome ci ./src`, same check CI runs)
3. `npm run build` — TypeScript + CSS compilation
4. `bun run test` — all unit tests pass
5. `npm run size` — bundle stays within limits (react module ≤ 15KB)
6. Verify all new public functions/types are exported from `src/index.ts` or `src/react/index.ts`
7. If you extracted a constant or utility to a shared location, grep for and remove ALL remaining duplicates
8. PR description must match the actual diff — run `git diff main...HEAD --stat` to verify

**Lint/format failures are the most common CI failure.** Always run `npm run check:fix` after writing code and before committing. The CI runs `npx biome ci ./src` which does NOT auto-fix — it only checks. If you skip the fix step locally, the PR will fail.

## Project Structure

```
src/
├── index.ts          # Main exports
├── client/           # DeepCitation API client
├── parsing/          # Citation parsing & normalization
├── prompts/          # LLM prompt utilities
├── react/            # React components (CitationComponent, etc.)
├── types/            # TypeScript types
└── utils/            # Utilities
docs/                 # Jekyll documentation (docs.deepcitation.com)
examples/             # Usage examples (nextjs-ai-sdk, basic-verification)
```

## Code Conventions

- TypeScript with strict typing
- ESM modules
- Tests colocated in `src/__tests__/`
- React components use Tailwind CSS
- Keep bundle size under limits — react module ≤ 15KB (see size-limit in package.json)
- Prefer lightweight custom implementations over heavy dependencies (e.g., Radix UI was removed in favor of a custom popover to save ~15KB)
- Always run `npm run size` before submitting

## Important Notes

- Product name is **DeepCitation** (not "DeepCite")
- Example app models: `gpt-5-mini` (OpenAI), `gemini-2.0-flash-lite` (Google) — DO NOT CHANGE
- Always use `extractVisibleText()` before displaying LLM output to users
- The `<<<CITATION_DATA>>>` block must be stripped before showing to users

## React Component Notes

- **CitationComponent** supports `interactionMode` prop: `"eager"` (default) or `"lazy"`
  - Eager: hover shows popover, click zooms image (or toggles details if no image)
  - Lazy: hover only styles, click toggles popover, second click toggles search details
  - Use lazy mode for dense citation layouts
- **UrlCitationComponent** always opens URL on click (no config needed)
- Status indicators use `XCircleIcon` SVG for not-found states (centered, not subscript)

## Popover Timing Constants

The popover uses carefully calibrated timing values exported from `src/react/CitationComponent.tsx`. These are tested by both unit tests (`src/__tests__/useRepositionGracePeriod.test.ts`, 9 test cases) and Playwright interaction tests (`tests/playwright/specs/citationPopoverInteractions.spec.tsx`).

| Constant | Value | Purpose |
|----------|-------|---------|
| `HOVER_CLOSE_DELAY_MS` | 150ms | Delay before closing popover on mouse leave |
| `REPOSITION_GRACE_PERIOD_MS` | 300ms | Grace period after content resize to prevent spurious close. Set to 2× hover delay. |
| `SPINNER_TIMEOUT_MS` | 5000ms | Auto-hide spinner if verification is still pending |
| `TOUCH_CLICK_DEBOUNCE_MS` | 100ms | Debounce threshold for ignoring synthetic click events after touch on mobile |

**These values are deliberate and well-tested.** Do NOT flag the grace period mechanism as a race condition unless you can reproduce an actual bug with a failing test case.

## CSS Rules for Popovers

Popover and modal components must prevent horizontal overflow. These rules address recurring issues (PRs #243, #244, #247):

- **Max-width**: Use `max-w-[min(400px,calc(100vw-2rem))]` to prevent viewport overflow. Never set fixed widths without a viewport-relative fallback.
- **Image containment**: Verification images must use `max-width` + `object-contain`. See `VERIFICATION_IMAGE_MAX_WIDTH` and `VERIFICATION_IMAGE_MAX_HEIGHT` in `src/react/constants.ts`.
- **Overflow direction**: Containers use `overflow-y-auto overflow-x-hidden`, never bare `overflow-hidden` which clips scrollable content.
- **Transitions**: 150ms for user interactions, 200ms for popovers.
- **Regression test**: Run `tests/playwright/specs/popoverImageWidth.spec.tsx` after any popover/image dimension changes.

## SSR Safety

Any code that accesses `document`, `window`, or other DOM APIs must guard against server-side rendering:

```typescript
// Pattern for SSR-safe DOM access
if (typeof document !== 'undefined') {
  // safe to access DOM
}
```

For portal rendering, use `getPortalContainer()` from `src/react/constants.ts` — it handles the SSR check internally.

## User Goals in Citation Progressive Disclosure

Understanding WHY users interact with citations is critical for maintaining and extending the UI.
Each disclosure level serves specific user needs. When modifying or adding to the citation UX,
verify your changes serve at least one of these goals without adding cognitive load to the others.

### Level 0: Inline Indicator (No Interaction)
**"Is this real?"** — Quick trust signal at a glance.
- Green check = verified, trust the claim
- Amber check = partial match, may need investigation
- Red X = not found in source, treat with skepticism
- Spinner = still checking

All users see this. It must be instantly scannable. No interaction required.

### Level 1: Popover (First Click)
Serves four distinct user questions:

1. **"Where is this from?"** — Source attribution
   - Source name, favicon, domain, page number
   - Users need to evaluate source credibility before evaluating the claim

2. **"When was this checked?"** — Temporal validity
   - Crawl/verification timestamp
   - Critical for URLs (web content changes); important for audit trails
   - A URL verified yesterday vs six months ago has different reliability

3. **"Show me the evidence"** — Visual proof
   - Highlighted snippet image from the source document
   - Users see the actual text in situ, not just the AI's paraphrase

4. **"I need this quote"** — Content reuse
   - Copy button on anchor text
   - Researchers and writers copy exact quotes for their own work

**Design constraint:** The success state must feel clean and light. Source identity and
proof image are primary; timestamp and copy affordance are secondary (visible but not prominent).

### Level 2: Verification Log (Second Click)
**"How was this verified?"** / **"Why wasn't this found?"** — Audit trail.
- For verified: shows match type and confidence (exact vs normalized vs partial)
- For not-found: shows all search attempts, phrases tried, pages scanned
- Personas: developers debugging, compliance officers requiring audit trails

### Level 3: Full-Size Image Overlay (Click Proof Image)
**"Show me the original context"** — Deep verification.
- Full-screen view of proof image for reading actual source text
- Personas: fact-checkers, legal reviewers, academic peer reviewers

### Level 4: Citation Drawer (Separate Trigger)
**"What sources were used overall?"** — Holistic source review.
- All citations grouped by source with proof thumbnails
- Personas: editors reviewing draft quality, executives scanning report reliability

### Temporal Context Design Rules
- URL citations: show `crawledAt` as "Retrieved [date]" (web content is mutable)
- Document citations: show `verifiedAt` as "Verified [date]" (documents are stable)
- Use absolute dates, not relative ("Jan 15, 2026" not "2 days ago")
- Full ISO timestamp available on hover/title attribute for audit precision
- Date line appears as footer metadata — visible but not prominent

## API Endpoints

- `POST https://api.deepcitation.com/prepareFile` — Upload attachments
- `POST https://api.deepcitation.com/verifyCitations` — Verify citations

## Testing

```bash
npm test                    # Unit tests
npm run test:ct             # Playwright component tests
npm run test:ct:ui          # Component tests with UI
```

### Testing Rules

- **Tests must validate existing implemented behavior**, not aspirational or planned features. If a feature doesn't exist yet, don't write tests for it.
- Do NOT recommend generic improvements like "add cross-browser testing" or "accessibility validation" without identifying a specific gap in the existing suite.

### Existing Test Coverage

**Unit tests** (`src/__tests__/`, 28 files): Citation parsing, normalization, edge cases, security utilities (ReDoS, prototype pollution, URL safety, log injection), React hooks (`useRepositionGracePeriod`, `useSmartDiff`), component rendering, markdown rendering, prompt compression, SHA hashing, client error handling, date utilities, rendering targets (Slack, GitHub, HTML, terminal).

**Playwright component tests** (`tests/playwright/specs/`, 9 specs): Visual showcase snapshots (desktop, mobile, tablet, dark mode), popover image width/overflow, citation popover interactions (open, close, expand, grace period, hover, touch), citation variant rendering, URL citations, drawer showcase, markdown showcase, render target showcase.

**Snapshot format**: AVIF, with per-platform snapshots (chromium-linux, chromium-win32).

### When to Add Tests

- **New component**: Unit test in `src/__tests__/` + Playwright visual test in `tests/playwright/specs/`
- **New hook**: Unit test using `renderHook` from `@testing-library/react`
- **Styling change**: Run `npm run test:ct` and update snapshots if intentional (`npm run test:ct -- --update-snapshots`)
- **Security change**: Add test cases in `src/__tests__/security.test.ts`
- **New rendering target**: Add test in `src/__tests__/rendering/`

## PR Description Guidelines

- PR description must match the actual diff. Do not mention specific version numbers, file names, or changes not present in the diff.
- Run `git diff main...HEAD --stat` to verify scope before writing the description.
- Call out security-related changes explicitly (anything in `src/utils/`, input validation, URL handling).
- Flag breaking changes to exported types, function signatures, or component props.
- Describe what changed and why, not just which files were touched.

## Documentation

- Docs hosted at docs.deepcitation.com (Jekyll/GitHub Pages)
- For implementing DeepCitation in your project, see [INTEGRATION.md](./INTEGRATION.md)
