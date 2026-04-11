# Docs Whitebox Evaluation

**Goal**: Bring all public documentation inline with the actual source code — types, method signatures, exports, examples, and behavioral descriptions must match what ships in the package.

**Scope**: Source-vs-docs comparison only. No competitive benchmarking, no live site fetches. Cross-reference `src/index.ts`, `src/react/index.ts`, `src/client/`, `src/types/`, and `src/prompts/` against every doc page.

**Key source files**:
- `src/index.ts` — 238-line public export manifest
- `src/react/index.ts` — React component/hook exports
- `src/client/DeepCitation.ts` — Client class methods
- `src/client/errors.ts` — Error classes and codes
- `src/types/citation.ts`, `verification.ts`, `search.ts` — Type definitions
- `src/prompts/citationPrompts.ts` — Prompt formats and constants

**Stale pages** (per `docs/agents/docs-site-map.md`):
- `sdk-reference.md` — stale at 10/10 commits
- `types.md` — stale at 12/10 commits
- `verification-statuses.md` — stale at 10/10 commits
- `error-handling.md` — stale at 15/15 commits
- `curl-guide.md` — stale at 18/15 commits

---

## P0 — Correctness Errors (docs say something wrong)

### T1 — Add `PaymentRequiredError` to `sdk-reference.md` and `error-handling.md`

`PaymentRequiredError` with code `DC_PAYMENT_REQUIRED` (HTTP 402) is exported from `src/client/errors.ts` and `src/index.ts`. It is entirely absent from both the error class table in `sdk-reference.md` and from `error-handling.md`.

**Files to update**:
- `docs/sdk-reference.md` — add `PaymentRequiredError` to the error classes table and import block
- `docs/error-handling.md` — add a section describing when 402 is thrown (free tier exhausted, spend cap hit, payment failed) and that `isRetryable: false`

**Verify against**: `src/client/errors.ts` — confirm `DC_PAYMENT_REQUIRED`, `statusCode: 402`, `isRetryable: false`

---

### T2 — Fix constructor options table in `sdk-reference.md`

The constructor table documents `apiKey`, `maxRetries`, `requestSource`, `onLatestVersion` — but `DeepCitationConfig` in `src/client/types.ts` also includes `convertedPdfDownloadPolicy`, `logger` (DeepCitationLogger), and `apiUrl`. The `apiUrl` warning note references a field not in the table. 

**Files to update**:
- `docs/sdk-reference.md` — add missing constructor options; move the `apiUrl` warning to be adjacent to its row

**Verify against**: `src/client/types.ts` — export `DeepCitationConfig` full shape

---

### T3 — Verify `verification-statuses.md` status list is complete and correctly grouped

Cross-reference the `SearchStatus` union in `src/types/search.ts` against every status listed in `verification-statuses.md`. Two known issues:

1. **`found_phrase_missed_anchor_text`** — mentioned in earlier evaluation notes as "moved to Verified group" — does NOT exist in source (confirmed). The current doc is correct; no action needed here. Document this as verified-correct.
2. **Status grouping table** — verify each status in the table matches the logic in `getCitationStatus()` in `src/parsing/parseCitation.ts`. The function is the authoritative source of truth for UI grouping.

**Files to update**:
- `docs/verification-statuses.md` — update any mismatches found; also update `commit_sha` frontmatter

**Verify against**: `src/types/search.ts` `SearchStatus` union + `src/parsing/parseCitation.ts` `getCitationStatus()`

---

## P1 — Missing Major Features (blocks developer adoption)

### T4 — Document `verifyBatch()` and `verifyIterative()` in `sdk-reference.md`

Both methods exist on the `DeepCitation` class and have corresponding options types exported from `src/index.ts` (`VerifyBatchOptions`, `VerifyInput`). Developers building batch pipelines have no documentation for these.

**Files to update**:
- `docs/sdk-reference.md` — add a "Batch & Iterative Verification" section after the existing Citation Verification section, documenting both methods with signatures, parameter tables, and return types

**Verify against**: `src/client/DeepCitation.ts` — locate `verifyBatch` and `verifyIterative` method signatures; cross-check `VerifyBatchOptions` type shape

---

### T5 — Document all citation parsing/display utilities in `sdk-reference.md`

The "Citation Parsing" utility table in `sdk-reference.md` documents only 4 functions (`getAllCitationsFromLlmOutput`, `parseCitationResponse`, `groupCitationsByAttachmentId`, `getCitationKey`). The following are exported from `src/index.ts` but not documented anywhere:

| Function | Source file |
|---|---|
| `stripCitations` | `src/parsing/citationParser.ts` |
| `replaceCitationMarkers` | `src/parsing/citationParser.ts` |
| `extractVisibleText` | `src/parsing/citationParser.ts` |
| `hasCitationData` | `src/parsing/citationParser.ts` |
| `getCitationMarkerIds` | `src/parsing/citationParser.ts` |
| `extractCitationsFromMarkers` | `src/parsing/citationParser.ts` |
| `parseCitationData` | `src/parsing/citationParser.ts` |
| `citationDataToCitation` | `src/parsing/citationParser.ts` |
| `groupCitationsByAttachmentIdObject` | `src/parsing/parseCitation.ts` |
| `normalizeCitationType` | `src/parsing/parseCitation.ts` |
| `isDocumentCitation` | `src/types/citation.ts` |
| `isUrlCitation` | `src/types/citation.ts` |
| `isAudioVideoCitation` | `src/types/citation.ts` |

**Files to update**:
- `docs/sdk-reference.md` — expand the Citation Parsing table with all functions above; group into "Parsing", "Text Manipulation", and "Type Guards" sub-sections

**Verify against**: `src/index.ts` lines 67–92 and `src/types/citation.ts` exports

---

### T6 — Document prompt format variants and constants in `sdk-reference.md` and `prompts.md`

The SDK exports four distinct citation prompt formats — but `prompts.md` and `sdk-reference.md` only explain the standard document format. Developers using audio/video citations or compact mode have no documentation.

**Exported but undocumented**:
- `AV_CITATION_PROMPT` + `CITATION_AV_JSON_OUTPUT_FORMAT` + `CITATION_AV_REMINDER` — AV timestamp citations
- `COMPACT_CITATION_PROMPT` + `COMPACT_CITATION_SCENARIO2_PROMPT` + `COMPACT_CITATION_JSON_OUTPUT_FORMAT` — compact citation format
- `CITATION_PROMPT` + `CITATION_JSON_OUTPUT_FORMAT` + `CITATION_REMINDER` — standard format (referenced but not shown as importable constants)
- `compressPromptIds` / `decompressPromptIds` / `CompressedResult` — prompt ID compression utilities

**Files to update**:
- `docs/prompts.md` — add "Format Variants" section describing AV and compact formats with when-to-use guidance
- `docs/sdk-reference.md` — expand the Constants section to enumerate all prompt format constants with their values

**Verify against**: `src/prompts/citationPrompts.ts` for actual constant values; `src/prompts/promptCompression.ts` for compression API

---

### T7 — Document rendering port (`prepareCitations`) in `sdk-reference.md` or new `rendering.md`

The `prepareCitations` function (prepare-once, render-many pattern) and its associated types `CitationIR`, `CitationAdapter`, `PrepareCitationsOptions`, `ResolvedCitation` are exported from `src/index.ts` but not documented anywhere. This is a key integration point for custom renderers.

**Files to update**:
- `docs/sdk-reference.md` — add a "Rendering" section documenting `prepareCitations` with parameter table, return type shape, and a minimal usage example showing the prepare-once pattern

**Verify against**: `src/rendering/prepareCitations.ts` — type signatures and JSDoc

---

## P2 — Completeness Gaps (partial docs, missing types)

### T8 — Expand `types.md` with missing exported types

The following types are exported from `src/index.ts` but absent from `types.md`:

| Type | Source | Notes |
|---|---|---|
| `ParsedCitationResult` | `src/parsing/parseCitationResponse.ts` | Return type of `parseCitationResponse` — currently used in docs without definition |
| `WrapCitationPromptOptions` | `src/prompts/citationPrompts.ts` | Options for `wrapCitationPrompt` — only the function is documented, not its input |
| `WrapCitationPromptResult` | `src/prompts/citationPrompts.ts` | Return type of `wrapCitationPrompt` |
| `WrapSystemPromptOptions` | `src/prompts/citationPrompts.ts` | Options for `wrapSystemCitationPrompt` |
| `DeepCitationConfig` | `src/client/types.ts` | Full constructor options shape |
| `DeepCitationLogger` | `src/client/types.ts` | Logger interface for custom log sinks |
| `VerifyBatchOptions` | `src/client/index.ts` | Needed for T4 |
| `CitationIR` / `CitationAdapter` / `PrepareCitationsOptions` / `ResolvedCitation` | `src/rendering/prepareCitations.ts` | Needed for T7 |
| `CitationWithStatus` | `src/formatting/index.ts` | Combines Citation + verification status |
| `IndicatorSet` / `IndicatorStyle` | `src/formatting/index.ts` | For display customization |
| `LinePosition` | `src/formatting/index.ts` | Line position descriptor |
| `TimingMetrics` / `CitationTimingEvent` | `src/types/timing.ts` | Performance measurement |
| `ContentMatchStatus` / `UrlAccessStatus` | `src/types/verification.ts` | URL verification sub-types |
| `PageImagesStatus` | `src/types/verification.ts` | Status of page image rendering |
| `DeepTextItem` / `ScreenBox` | `src/types/boxes.ts` | Already referenced in SearchAttempt but not defined in types.md |
| `CompressedResult` | `src/prompts/promptCompression.ts` | Return type of `compressPromptIds` |

**Files to update**:
- `docs/types.md` — add sections for each group above with TypeScript interface definitions sourced directly from the files listed

---

### T9 — Document formatting utilities in `sdk-reference.md`

The following are exported from `src/index.ts` but not documented:

- `toSuperscript(n: number) => string` — convert number to Unicode superscript
- `getIndicator(set: IndicatorSet, index: number) => string` — get indicator character
- `humanizeLinePosition(pos: LinePosition) => string` — human-readable line position
- `INDICATOR_SETS` — predefined indicator sets (numbers, letters, symbols)
- `SUPERSCRIPT_DIGITS` — superscript character lookup

These are display helpers useful for custom citation renderers.

**Files to update**:
- `docs/sdk-reference.md` — add a "Display Utilities" section after the verification helpers table

**Verify against**: `src/formatting/index.ts`

---

### T10 — Document `components.md` gaps: CitationPrimitives, DeepCitationTheme, advanced components

`src/react/index.ts` exports the following that are absent from or only mentioned in passing in `docs/components.md`:

1. **Citation Primitives** — `Citation.Root`, `Citation.Trigger`, `Citation.AnchorText`, `Citation.Number`, `Citation.Indicator`, `Citation.Bracket` — composable building blocks for custom citation UI. No docs.
2. **`DeepCitationTheme`** — theme provider component. No docs.
3. **`DefaultPopoverContent`** — exported for consumers who want to use the standard popover body in a custom trigger. No docs.
4. **`SplitDiffDisplay`**, **`CollapsibleText`**, **`MatchQualityBar`** — advanced visualization components. No docs.
5. **`VerificationLog`** and **`VerificationTabs`** — mentioned in one table row but no props/usage docs.
6. **`buildSearchNarrative`**, **`buildSearchSummary`**, **`buildIntentSummary`**, **`deriveContextWindow`** — search explanation utilities for building custom verification UIs.

**Files to update**:
- `docs/components.md` — add an "Advanced Components" section and a "Composition Primitives" section with usage examples and prop tables

**Verify against**: `src/react/index.ts` for export names; `src/react/CitationPrimitives.ts` for primitive shapes; `src/react/types.ts` for prop types

---

### T11 — Document i18n API fully in `components.md`

`components.md` mentions `esMessages`, `frMessages`, `viMessages`, and `DeepCitationI18nProvider` but does not document:
- `createTranslator` — for creating custom locale packs
- `useTranslation` / `useLocale` — hooks for reading locale in custom components  
- `defaultMessages` — the full message key schema (this is what custom translators must implement)

**Files to update**:
- `docs/components.md` — expand the i18n section to show how to create a custom locale pack with `createTranslator`, list the message key schema from `defaultMessages`, and document the hooks

**Verify against**: `src/react/i18n.ts` for `createTranslator` signature and `defaultMessages` shape

---

### T12 — Audit `curl-guide.md` for staleness (18/15 commits)

The curl guide is the most stale doc. Audit request/response shapes against the current REST API, particularly:
- Confirm `<<<CITATION_DATA>>>` delimiter format still correct
- Confirm response shape shows `searchState.status` (not `verification.status`) for raw REST
- Check any billing/header changes introduced since `commit_sha`

**Files to update**:
- `docs/curl-guide.md` — update any stale request/response shapes; update `commit_sha` frontmatter

**Verify against**: `docs/api-reference.md` (fresher) as ground truth for REST shapes

---

### T13 — Add `docUrl` to error documentation in `error-handling.md`

The Express guide references `err.docUrl` but `error-handling.md` does not document that all `DeepCitationError` instances include a `docUrl` property. The property is present in `src/client/errors.ts`.

Also document the `statusCode` property shape — it is type `number | undefined` and is absent from the error properties table.

**Files to update**:
- `docs/error-handling.md` — add `docUrl` and `statusCode` to the error properties table with descriptions

---

### T14 — Update `sdk-reference.md` frontmatter commit_sha

The frontmatter shows `commit_sha: "80dfecd"` and `stale_after_commits: 10`. After completing all tasks above, update the `commit_sha` to the current HEAD and run `/reindex` to refresh `docs/agents/docs-site-map.md`.

**Files to update**:
- `docs/sdk-reference.md` — update `commit_sha`
- `docs/types.md` — update `commit_sha`
- `docs/verification-statuses.md` — update `commit_sha`
- `docs/error-handling.md` — update `commit_sha`
- `docs/curl-guide.md` — update `commit_sha`

---

## P3 — Polish & Discoverability

### T15 — Add `remarkCitationMarkers` cross-reference in `getting-started.md`

The React rendering example in `getting-started.md` uses a `remarkCitationMarkers` remark plugin but does not link to where it is documented (the Next.js framework guide). A developer reading `getting-started.md` without checking the Next.js guide will be stuck.

**Files to update**:
- `docs/getting-started.md` — add a callout or footnote after the `remarkCitationMarkers` usage pointing to `frameworks/nextjs.md#remark-plugin`

---

### T16 — Add "Common Mistakes" discoverability: link from `index.md`

The "Common Mistakes" section added to `error-handling.md` is the highest-value troubleshooting content in the docs. It is not linked from the homepage Quick Navigation table.

**Files to update**:
- `docs/index.md` — add "Common Mistakes" row to the Quick Navigation table pointing to `error-handling.md#common-mistakes`

---

### T17 — Add `isDocumentCitation` / `isUrlCitation` / `isAudioVideoCitation` usage example in `types.md`

These type guard functions are exported from `src/index.ts` via `src/types/citation.ts` but not documented in `types.md` or anywhere else. They are the canonical way to narrow `Citation` union types.

**Files to update**:
- `docs/types.md` — add a "Type Guards" section in the Citation Types area with a usage example showing narrowing pattern

---

## Execution Order

Run tasks in priority order. Each task is independently executable:

1. **T1** (PaymentRequiredError) — P0, fixes broken/missing error docs
2. **T2** (constructor options) — P0, fixes incomplete constructor table
3. **T3** (verification-statuses audit) — P0, confirms correctness
4. **T4** (verifyBatch/verifyIterative) — P1, unblocks batch users
5. **T5** (citation utilities) — P1, highest export surface gap
6. **T6** (prompt format variants) — P1, AV/compact users completely blocked
7. **T7** (rendering port) — P1, custom renderer users completely blocked
8. **T8** (types.md completeness) — P2, systematic type coverage
9. **T9** (formatting utilities) — P2, display customization
10. **T10** (components advanced) — P2, React power users
11. **T11** (i18n full API) — P2, i18n completeness
12. **T12** (curl-guide audit) — P2, stale REST docs
13. **T13** (docUrl in errors) — P2, minor error property gap
14. **T14** (frontmatter update) — P3, run after all changes
15. **T15** (remarkCitationMarkers cross-ref) — P3, navigation polish
16. **T16** (index.md common mistakes link) — P3, discoverability
17. **T17** (type guard usage example) — P3, types.md polish

---

## Verification Protocol

After completing each task, verify against source before updating frontmatter:

1. For method signatures: grep `public \w+` in `src/client/DeepCitation.ts`
2. For exported types: cross-check against `src/index.ts` `export type` blocks
3. For React exports: cross-check against `src/react/index.ts`
4. For error codes: read `src/client/errors.ts` directly
5. For type shapes: read source type files, do not rely on memory or prior docs

After all tasks complete: run `/reindex` to update `docs/agents/docs-site-map.md` with fresh commit shas.
