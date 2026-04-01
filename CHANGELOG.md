# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.6] - 2026-04-01

### Added

- **`display_label` field on `CitationData`** — compact key `d`, alias `displayLabel`; overrides `anchor_text` as the clickable trigger text. CLI injects `data-dc-display-label` attribute into verified HTML output. (#398)
- **Per-group drawer page badges** — multi-source drawers now show page badge strips inline with each source group header instead of one merged strip in the drawer header. (#398)
- **CLI all-not-found diagnostics** — when all citations are not-found, prints actionable hints (common format issues, `page_id` format, stale `attachmentId`). (#398)
- **`customPopoverActions` prop** — new `PopoverAction` interface threaded from `CitationComponent` → `DefaultPopoverContent` → `SourceContextHeader` / `PopoverFallbackView`. Each action renders as an icon-only button with reveal-on-hover. `label` doubles as `aria-label` and React key. (#397)
- **Phrase trimming** — `trimPhraseToAnchorWindow()` in `textCleanup.ts`: trims `fullPhrase` to a ±150-char context window when significantly longer than `anchorText`. Applied in `HighlightedPhrase`, `LookingForSection`, and `PopoverFallbackView`. (#397)
- **Jest test suites** — ~1980 tests across four new CLI suites (`cliUnit`, `cliCommands`, `cliAuthScenarios`, `cliIntegration`). `npm test` now uses Jest with `forceExit`. (#397)
- **`resolveAuth()` helper** — single source of truth for API key resolution (env var → `.env` files → `credentials.json`) used by all CLI commands via `requireAuth()`. (#395)
- **Cowork (cloud) support** — credentials stored in project-relative `.deepcitation/`; non-TTY `login` provides Cowork-specific setup instructions; proxy CONNECT errors suggest `NO_PROXY` workaround. (#395)
- **Auth key source reporting** — `status` and `whoami` show where the key was loaded from; `logout` gives source-aware removal instructions. (#395)

### Changed

- **CLI output co-location** — verified HTML outputs now default to the same directory as the input file instead of CWD. `inject` strips `-annotated`/`-draft` suffixes from the output filename. (#398)
- **CLI refactor** — `cli.ts` shrunk from ~1260 → 127 lines by extracting command logic to `src/cli/commands.ts`, proxy utilities to `src/cli/proxy.ts`, and pure helpers to `src/cli/cliUtils.ts`. (#397)
- **Anchor text validation thresholds** — loosened from hard limits (40 chars / 4 words) to soft readability suggestions (60 chars / 6 words). (#395)
- **`IS_COWORK` centralised** — extracted to `auth.ts` as single source of truth (was duplicated). (#395)

### Fixed

- **CDN popover positioning** — `position:static` portal targets no longer cause offset miscalculation (e.g. centred `body` with `margin:auto`). Added viewport Y-axis clamping for tall expanded popovers. (#398)
- **Punctuation-only anchor handling** — `wrapCitationMarkers` emits an empty `data-cite` span instead of wrapping garbage text; validation warnings added for punctuation-only and sub-3-char anchors. (#398)
- **Login process hang** — `process.stdin.destroy()` called after browser OAuth completes so the process exits cleanly. (#397)
- **Billing URL** — corrected from `/api#billing` to `/billing` in CLI help text. (#397)
- **Double `printFreeTierWelcome()`** — no longer called twice on terminal-paste login. (#395)
- **Unhandled rejection on `login()`** — properly handled. (#395)

### Removed

- **`USAGE_WARN_PCT` / `USAGE_CRITICAL_PCT` exports** — these constants were inadvertent public exports; canonical definitions remain in `packages/shared`. `warnUsage` callback and its `onUsageUpdate` wiring removed from `createClient()`. `src/billing.ts` deleted. (#396)

## [0.3.5] - 2026-03-31

## [0.3.4] - 2026-03-30

### Added

- **CDN drawer integration** — citation drawer support in CDN popover API with `[data-dc-drawer-trigger]` binding, `showDrawer`/`hideDrawer` methods, and auto-refresh on `update()` (#387)
- **Citation data validation** — `validateCitationData` and `detectExtractionArtifacts` utilities catch common PDF/HTML text-extraction issues (collapsed spaces, broken hyphens, ligature loss, table fragments) before they reach the API (#387)
- **`content_word_match` search method** — new `SearchMethod` variant with i18n support for all locales (#386)
- **`truncateMiddle` utility** — exported middle-truncation function for long strings (API keys, hashes, URLs) (#388)
- **DeepCitation branding on status labels** — verified/partial-match/not-found UI labels now prefixed with "DeepCitation" for product attribution (#388)
- **CDN `data-citation-key` resolution** — human-readable `data-citation-key` attributes resolved to hashed keys at runtime via key-map (#386)
- **CLI `--indicator` flag** — choose icon, dot, or none for `inject` and `verify-html` commands (#387)
- **Snippet text normalization** — `normalizeSnippetText` fixes collapsed spaces and quote boundaries in verification API snippets (#387)
- **Imprecise location note** — EvidenceTray shows "Exact location not specified" when a verified citation lacks page/line IDs (#387)

### Changed

- **`isImpreciseLocation` moved to Verification type** — pre-computed by the verification engine instead of re-derived in UI (#388)
- **Citation chip text** — removed hardcoded max-width truncation; chips now flow naturally with `min-w-0` flex overflow (#388)

### Fixed

- **WSL2 auth callback** — login callback server conditionally binds to `0.0.0.0` when `WSL_DISTRO_NAME` is set, so Windows browsers can reach it (#386)
- **CDN double-processing guard** — `data-citation-key` resolution skips elements already processed by legacy `data-cite` loop (#386)
- **CDN `stripExistingInjection`** — extracted to `reportUtils.ts`; tightened regex to require `window.DeepCitationPopover=` assignment (#387)
- **ReDoS guard** — `validateRegexInput` added to `detectExtractionArtifacts` (#387)

## [0.3.2] - 2026-03-28

### Added

- **CLI `verify` HTML mode** — `deepcitation verify --html` parses citation markers from HTML input, with full test coverage (#384)
- **CLI `normalize` command** — new `deepcitation normalize` command for normalizing citation text, with proxy support (#384)
- **CLI proxy support** — `--proxy` flag for routing API requests through a proxy server (#384)
- **Auth login/keygen flows** — `deepcitation login` and `deepcitation keygen` now handle interactive authentication with token persistence (#384)
- **`formatting` module** — new `deepcitation/formatting` export with `indicators.ts` for citation status indicators, replacing the removed markdown module (#383, #384)

### Changed

- **Renamed `markdown` → `formatting`** — the `deepcitation/markdown` entry point is now `deepcitation/formatting`; types moved accordingly (#383, #384)
- **CDN trigger styling** — updated CDN runtime trigger element styling (#384)

### Fixed

- **Build order** — CDN bundle now builds after tsup to prevent `clean: true` from deleting it (#383)
- **DTS generation** — fixed TypeScript declaration file generation for new entry points (#383)

### Removed

- **Text renderers** — removed GitHub, Slack, HTML, and markdown renderers (`renderMarkdown`, `githubRenderer`, `htmlRenderer`, `slackRenderer`) along with their test suites and Playwright showcase specs; use the `formatting` module or `terminalRenderer` instead (#383)
- **Proof URL utilities** — removed `buildProofUrl`, `buildProofUrls`, `buildSnippetImageUrl` and associated types from `rendering/proofUrl` (#383)
- **Brand iteration docs** — removed internal `brand-iteration-considerations.html` (#383)
- **Universal renderers plan** — removed `plans/plan-universal-renderers.md` (#383)

## [0.3.1] - 2026-03-27

### Added

- **Batch verification mode** — new `verifyBatch()` method sends all citations in a single API call instead of per-attachment fan-out; `verify()` now delegates to `verifyBatch()` internally (#381)
- **`BatchVerifyCitationRequest` and `VerifyInput` types** exported from root entry point (#381)
- **`skipped` discriminant** on `Verification` for citations that cannot be sent (e.g. URL citations without `prepareUrl`) (#381)
- **CLI commands** — `deepcitation prepare`, `deepcitation verify`, `deepcitation inject`, `deepcitation login`, `deepcitation keygen` for headless workflows (#378, #379)
- **CDN key-map resolution** — `data-citation-key` attributes resolved to hashed keys at runtime via an inline key-map, enabling human-readable HTML annotation (#378)
- **`/verify` Claude Code skill** — end-to-end citation verification skill with progressive-disclosure rules, now hosted at `DeepCitation/skills` (#377, #379)
- **Canonical citation-format spec** — `docs/prompts/citation-format.md` as single source of truth for citation field names (#379)
- **Analysis module** — extracted `src/analysis/` with citation grouping, statistics, and export utilities (#376)
- **`prepareCitations()` rendering utility** — new helper in `src/rendering/` for pre-processing citations before rendering (#375)

### Changed

- **CDN runtime consolidation** — merged `content.ts`, `popover.ts`, and `index.ts` into a single `cdn.ts` with two-div popover architecture, scroll passthrough, blink animations, and `ResizeObserver` position tracking (#378)
- **Evidence module deepened** — reorganized evidence-related code into cohesive submodules with cleaner exports (#375)
- **Hooks extraction** — moved reusable hooks into dedicated files for better tree-shaking (#376)
- **`escapeMd` regex cached at module scope** for improved rendering performance (#373)

### Fixed

- **AG-UI chat SSE hang** — resolved cold-start hang and streaming parse issues in the agui-chat example (#374)
- **Release notes extraction** — changelog entry is now correctly extracted for GitHub release notes instead of raw PR list (#065b602)
- **Build order** — CDN bundle now built after tsup to prevent `clean: true` from deleting it

### Removed

- **Vanilla report renderers** — removed `renderBrandedReport()`, `renderCitationReport()`, `BrandedReportOptions`, `VanillaReportOptions`, the `deepcitation/vanilla` export, and `deepcitation report` CLI command; use `deepcitation inject` instead

## [0.3.0] - 2026-03-25

## [0.2.3] - 2026-03-24

### Added

- **`CoordinateOrigin` option for image OCR** — specify coordinate origin (`top-left` or `bottom-left`) when working with OCR bounding boxes on image evidence (#367)
- **`displayLabel` prop** — customize the display label shown on citation markers (#361)
- **`docUrl` on error objects** — all SDK errors now include a `docUrl` linking to relevant documentation (#364)
- **Keyhole full-size state** — evidence keyhole can expand to full-size view for detailed inspection (#364)
- **Network error resilience** — automatic exponential backoff retry for transient network failures (#360)
- **Adaptive overlays** — citation overlays adapt to content context for better visibility (#361)
- **Express.js guide** — new framework guide for integrating DeepCitation with Express (#364)
- **Mastra and AG-UI guides** — new framework guides with API key validation (#370)
- **LangChain RAG chat example** — full example of LangChain + DeepCitation integration (#353)

### Changed

- **Design token migration** — migrated to `--dc-*` CSS custom properties with zinc color palette for consistent, overridable theming (#352, #358, #359)
- **Remark-based citation rendering** — switched docs and examples to use remark for citation rendering (#362)
- **Verified color rebrand** — verified status now uses `emerald-500` routed through design tokens (#352)
- **Popover simplification** — simplified popover internals and expanded API reference docs (#366)
- **Codebase simplification** — extracted `searchNarrative` module and `usePopoverViewState` hook for cleaner architecture (#351, #365)

### Fixed

- **Popover squish on scroll** — fixed popover content getting compressed during scroll (#365)
- **AG-UI chat type error and rate limiting** — fixed type errors, `endUserId`, and rate limiting in agui-chat example (#357)
- **Tailwind v4 `@source` fix** — corrected Tailwind v4 source configuration (#361)

## [0.2.2] - 2026-03-17

### Breaking Changes

- Removed XML citation support (`<cite>` tags) — all LLM outputs now use numeric `[N]` markers with `<<<CITATION_DATA>>>` JSON blocks (#337, #338)
- Removed exports: `normalizeCitations()`, `parseCitation()`, `replaceCitations()`, `ReplaceCitationsOptions`
- Migration: Use `parseCitationResponse()` for parsing and `replaceCitationMarkers()` for text replacement

### Added

- **CDN popover bundle** — new `deepcitation/vanilla/cdn` entry point for rendering citation popovers without React or a build step; includes a static HTML example (#340)
- **Design token system** — centralized color and spacing tokens in `DeepCitationTheme` for consistent theming across React and vanilla renderers (#340)
- **Page-expand ghost transition** — smooth geometry morph when expanding from keyhole evidence to full-page view, preventing layout flicker (#349)
- **SDK version header** — API requests now include an `X-DeepCitation-SDK-Version` header for server-side analytics and compatibility checks (#349)

### Fixed

- **Undefined markerMap keys** — guarded against `undefined` keys in citation rendering, preventing silent rendering failures (#339)
- **Null/undefined verification indicator** — restored `◌` symbol for null/undefined verification status instead of hourglass

### Removed

- `src/parsing/normalizeCitation.ts` — XML citation parser/normalizer (598 lines)
- `src/__tests__/normalizeCitation.test.ts` — XML format tests (948 lines)
- `getUniqueSearchAttemptCount()` helper — replaced with `groupSearchAttemptsForNotFound().length` (switches from per-page to cross-page grouping for miss displays, resulting in lower search-attempt counts in the UI)
- Dead code cleanup: ~2,000 lines of unused types, helpers, and redundant logic removed across the codebase (#341, #342)

## [0.2.1] - 2026-03-12

### Added

- **Vanilla citation report renderer** — new `deepcitation/vanilla` entry point for rendering citation verification reports without React; includes positioning utilities and runtime types (#334)
- **`disableTelemetry` prop** on `CitationComponent` — opt out of anonymous usage analytics (#330)
- **`prefetch` prop** on `CitationComponent` — control whether verification data is prefetched on mount (#330)
- **Deferred verification support** — new `parseCitationResponse` unified parser and deferred verification flow for streaming-friendly citation resolution (#328)

### Fixed

- **Popover dismiss during view transitions** — popover no longer closes when a CSS view transition is in flight, preventing accidental dismissals during expand/collapse animations (#332)
- **Image loading polish** — improved loading states and error handling for evidence images; cleaned up trusted host configuration (#333)
- **Document overrides for non-match pages** — image expansion now correctly applies document overrides when the evidence page doesn't match the citation's original page (#329)
- **View transition cross-fade timing** — new `dc-expand-old-out` / `dc-expand-new-in` keyframes so page-expand transitions show content during the geometry morph instead of appearing invisible for 60% of the animation
- **Blink motion opacity flash** — pinned shell opacity to 1 for all active blink stages (every stage except `idle` and `steady`), preventing a visible dip (0.22 → 0.78) that fired after view transitions completed

### Changed

- **Bracket accent styling** aligned with 3-section workflow; CSS transition constants centralized in `constants.ts` (#335)
- **`useAnimatedHeight` hook** added for smooth height transitions in expandable sections (#335)
- Bumped `@types/node` dev dependency (#331)

## [0.2.0] - 2026-03-08

### Added

- **i18n infrastructure** — Zero-dependency internationalization for all React components (#321, #322, #324, #325):
  - `DeepCitationI18nProvider` — React context provider for custom translation strings
  - `useTranslation()` — hook returning a `t(key, values?)` interpolation function
  - `useLocale()` — hook and `locale` prop on `DeepCitationI18nProvider` for controlling `Intl` date/number formatting
  - `createTranslator()` — factory for non-React contexts (SSR, tests)
  - `tPlural()` — `_one` / `_other` plural selector helper
  - Built-in locale packs: English (`en`), Spanish (`es`), French (`fr`), Vietnamese (`vi`)
- **`footnote` display variant** — numeric footnote marker with neutral gray default and status-aware coloring after verification
- **`onSourceDownload` callback prop** on `CitationComponent` — renders a download button in the popover header for both URL and Document citations
- **`DownloadIcon`** SVG component exported from `deepcitation/react`
- **`getAllCitationsFromDeferredResponse`** and **`parseDeferredCitationResponse`** now exported from the `deepcitation` root entry point
- **`getCitationKey`** and **`getVerificationKey`** utilities exported from the `deepcitation` root (moved from `deepcitation/react`)
- **`resolveFieldName`**, **`resolveFieldNameSnake`**, **`resolveField`**, **`getFieldAliases`**, **`normalizeCitationFields`** — new field alias utilities exported from root (#326)
- AudioVideo citation type support with timestamp fields (#323)
- Trusted image host allowlist for citation images (#323)
- Framework integration guides for LangChain, Next.js, and Vercel AI SDK

### Changed

- **Peer dependencies** widened to `react >= 18.0.0` and `react-dom >= 18.0.0` (previously required React 19)
- **Verification assets API** — field names updated to match the new assets model (#322):
  - `verification.evidence.src` (was `verification.document.verificationImageSrc`)
  - `verification.evidence.dimensions` (was `verification.document.verificationImageDimensions`)
  - Page renders now accessed via `assets.pageRenders[]` instead of `verification.pages[]`
- **Field alias resolution** centralized into a single `fieldAliases` module — both XML normalization and JSON parsing now delegate to a shared alias map instead of maintaining separate inline lists (#326)
- **`EvidenceTray`** refactored from cascading `setState` to `useReducer` for search-log animation state; `ZoomHint` component removed (#325)
- **Popover stability** — `triggerRef.current` is now snapshotted at effect setup time to prevent null flashes during React 18 ref callback recreation (#324)
- **`CitationDrawer`** replaced `useLayoutEffect` with derived state for keyhole visibility (#325)
- React Compiler esbuild plugin removed from `tsup.config.ts`; components are compatible without it

### Deprecated

- `prepareAttachment()` is deprecated in favor of `prepareAttachments()`. The old method remains as a compatibility alias and will be removed in the next major release.

### Breaking Changes

#### Removed constants (`"deepcitation"`)
- Removed: `NOT_FOUND_VERIFICATION_INDEX` — Use instead: `verification.status === "not_found"`
- Removed: `PENDING_VERIFICATION_INDEX` — Use instead: `verification.status === "pending"`

#### Renamed types
- `OutputImageFormat` → `ImageFormat` (in `src/types/citation.ts`)
- `UrlSourceInfo` → `UrlSource` (in `src/client/types.ts`)
- `VerificationPage` → `PageImage` (in `src/types/verification.ts`)
- Removed: `ExpirationValue` — no replacement
- Removed: `ProofHosting` — no replacement
- Removed: `IVertex` — no replacement

#### Proof URL builders moved
- Before: `import { buildProofUrl, buildProofUrls, buildSnippetImageUrl, ProofUrlOptions } from "deepcitation"`
- After: `import { buildProofUrl, buildProofUrls, buildSnippetImageUrl, ProofUrlOptions } from "deepcitation/rendering/proofUrl"`

#### Verification assets model — field renames
- Before: `verification.document.verificationImageSrc` — After: `verification.evidence.src`
- Before: `verification.document.verificationImageDimensions` — After: `verification.evidence.dimensions`
- Before: `VerificationPage.source` — After: `PageImage.imageUrl`
- Removed: `verification.pages[]` — Page images are now passed separately via the `pageImagesByAttachmentId` prop on `CitationComponent` and `CitationDrawer`

## [0.1.0] - 2026-02-25

First public release of `deepcitation` — deterministic citation verification for AI-generated content. Every claim your LLM makes gets checked against the source document, with visual proof your users can see and trust.

### Highlights

- **Verify, don't detect** — Unlike hallucination detectors that estimate confidence, DeepCitation matches each citation against uploaded source documents and returns a deterministic `found` / `not_found` result. No probabilities, no guessing.
- **Visual proof with progressive disclosure** — Citations start as subtle inline indicators (an underline, a superscript, a chip). Click to see the verification status. Click deeper to see the exact passage on the source page, highlighted and cropped. Users who just want to read can ignore them; users who want to verify can drill all the way down to the source image.
- **Page view with keyhole evidence** — Verified citations show a cropped "keyhole" view of the matching region on the source page, then expand to a full-page view with zoom controls. The goal: build trust without requiring users to leave the conversation and open a PDF.
- **6 display variants** — `linter` (spell-check underlines), `chip` (pill badges), `brackets`, `text`, `superscript` (footnotes), and `badge` (ChatGPT-style source chips). Each tuned for different contexts — long-form research, chat UIs, academic papers, minimal dashboards.
- **Low cognitive load by default** — Verified citations are quiet (subtle green indicator). Only unverified claims demand attention (red wavy underline). The visual hierarchy prioritizes reading flow over verification noise.
- **Works with any LLM** — OpenAI, Anthropic, Google, Mistral, local models. Citation extraction, prompt wrapping, and all rendering work entirely client-side with zero dependencies.
- **Multi-format rendering** — Slack, GitHub, HTML, terminal, and markdown renderers for non-React environments. Same verification data, rendered for each platform.

### What's included

- Citation extraction and parsing from LLM output
- Prompt wrapping utilities (`wrapCitationPrompt`, `wrapSystemCitationPrompt`)
- DeepCitation API client for file upload and verification
- React components: `CitationComponent`, `UrlCitationComponent`, `CitationDrawer`, `SourcesListComponent`
- Composable primitives: `Citation.Root`, `Citation.Trigger`, `Citation.AnchorText`, `Citation.Indicator`
- Platform renderers: Slack, GitHub, HTML, terminal, markdown
- Structured error classes: `AuthenticationError`, `RateLimitError`, `NetworkError`, `ValidationError`, `ServerError`
- Pluggable logger interface for observability (Datadog, Sentry, OpenTelemetry, etc.)
- Dark mode support, mobile-responsive popovers, keyboard navigation
- TypeScript-first with full type exports
- Zero runtime dependencies (React components require React only)

### Migration from `@deepcitation/deepcitation-js`

```diff
- npm install @deepcitation/deepcitation-js
+ npm install deepcitation
```

```diff
- import { DeepCitation } from "@deepcitation/deepcitation-js";
+ import { DeepCitation } from "deepcitation";

- import { CitationComponent } from "@deepcitation/deepcitation-js/react";
+ import { CitationComponent } from "deepcitation/react";
```

The API is identical — only the package name changed. The old package has been deprecated on npm.

## [1.1.53] - 2026-02-12

### Added
- **Search fallback strategies** to improve citation verification success rates (#166)
- **URL caching support** in the DeepCitation client for improved performance (#176)
- **Legal and Medical domain demos**, replacing the previous financial demo (#168)
- **Trademark notice and legal links** added to project documentation (#173)

### Changed
- **Default popover position** changed to `bottom` for better out-of-the-box visibility (#177)
- **Improved copy-paste UX**: Replaced literal quotes with CSS left-border styling to prevent "phantom" characters when copying text (#175)
- **AI Agent Integration**: Enhanced `INTEGRATION.md` with upfront installation guides for agentic workflows (#171)
- **Internal Reorganization**: Moved PRDs and design docs into a dedicated `plans/` folder (#165)

### Fixed
- **Popover & Tooltip stability**: Fixed issues where citation popovers would jump or close unexpectedly during image overlays or while expanding search details (#167, #174, #177)
- **Parsing robustness**: Improved citation parsing logic and simplified internal prompts for better reliability (#170)
- **Display logic**: Fixed `first_word` display issues in search results (#166)

## [1.1.52] - 2026-02-04

### Added
- **Markdown output module** for static citation rendering - generate markdown with citation references (#161)
- **Copy button** in citation popover for easy text copying (#164)
- **View page support** in citation popover - navigate directly to source pages (#164)
- **Page interface** for multi-page document support (#155)
- **Optional expiration dates** for attachments and pages (#156)
- **`sourceLabel` prop** for CitationComponent - display custom source names instead of filenames (#146)
- **Lazy interaction mode** - renamed from 'relaxed' for clearer semantics (#151)
- **Mobile tap-to-expand** logic for citations with click-outside dismiss (#148, #149)
- **Dynamic font-proportional indicator sizing** with simplified X icon (#150)
- **Comprehensive labeling system** for Playwright showcases (#159)

### Changed
- **Citation popover UX improvements** (#164):
  - Unified popover design across all citation types
  - Added copy button for citation text
  - View page navigation support
- **Improved chip/superscript variants** - better UX and popover layout (#162)
- **Human-friendly language** in CitationComponent with better colors and wavy underlines (#160)
- **Simplified citation tooltip UX** with improved verification display (#152)
- **Contained hover styles** within chip/superscript variants with unified search details layout (#158)
- **Citation header UX** - filename truncation, status indicators, URL layout improvements (#142)
- **Terminology update** - renamed "key phrase" to "anchor text" for consistency (#139)
- **Enhanced VerificationLog** with ambiguity warnings, variation labels, and improved search display (#122)
- **Linter variant** - green background now only shows on hover (#121)
- **Auto-detect touch devices** for proper mobile tap behavior (#119)

### Fixed
- Code quality issues in markdown and React components (#163)
- Miss indicator visibility improvements (#132)
- URL citation popover layout (#132, #134)
- Performance optimizations: N+1 queries, concurrency limits, stack overflow prevention (#120)
- Broken links, purple focus rings, and sidebar header spacing in docs (#154)

## [1.1.51] - 2026-01-29

### Added
- **Linter variant** for CitationComponent - displays citations as inline text with semantic underlines (solid for verified, dashed for partial, wavy for not found, dotted for pending) (#107)
- **Badge variant** for UrlCitationComponent with improved status indicators (verified, partial, pending, blocked, error states) (#108)
- **Verification log timeline** in citation tooltip - shows the verification process with timestamps (#104)
- **Detailed search attempt info** in tooltip for failed lookups - helps debug why citations weren't found (#103)
- **Deferred JSON citation format** - optimized format for streaming responses with grouped search attempts UI (#94)
- **Visual showcase tests** for CitationComponent popover/tooltip states with dark mode support (#110)
- **`showIndicator` prop** for CitationComponent - control visibility of status indicators (checkmark, warning, spinner) (#111)
- **Expandable search details** for verified matches - see how matches were found even for successful verifications (#111)

### Changed
- **Citation popover redesign** - shadcn HoverCard aesthetic with cleaner UI (#113):
  - Neutral header backgrounds with colored status icons only
  - GitHub CI/CD-style verification timeline with numbered steps
  - Humanizing messages for failures (e.g., "We couldn't find..." instead of technical errors)
  - User-friendly method names ("Exact location", "Nearby lines" instead of "Exact Line Match")
  - Arrow format for page badges (`Pg 5 → 7`) instead of strikethrough
  - Improved dark mode contrast throughout
- Improved CitationTooltip UX with clearer status values and better visual feedback (#101)
- Renamed `keySpan` to `anchorText` and `startPageKey` to `startPageId` for clarity (#89)
- Optimized citation format: group citations by attachment with shorthand keys (#92)
- **Dark mode improvements** - superscript variant now inherits text color, popover headers use neutral backgrounds with colored icons only (#111)
- **URL citation variants** - chip/inline/bracket variants now use neutral gray colors instead of blue, better spacing with `mr-0.5` (#111)
- **Unexpected location display** - shows arrow format for page mismatch (e.g., `Pg 5 → 7`) (#111)

### Removed
- All deprecated APIs and backwards compatibility shims have been removed (#105):
  - `verifyAll()` - use `verify()` instead
  - `removeCitations()` - use `replaceCitations()` instead
  - Various deprecated type aliases and re-exports

## [1.1.50] - 2026-01-21

This release marks the first comprehensive public release of DeepCitation, consolidating all features developed since the initial v1.0.0 release.

### Core Features

#### Citation Verification System
- **DeepCitation API Client** - Upload documents and verify AI-generated citations against source materials
- **Visual Proof Generation** - Get verification images showing exactly where citations match in source documents
- **Multi-Format Support** - PDF (text & scanned), DOCX, XLSX, PPTX, HTML, images (JPG, PNG, TIFF, WebP, HEIC), and public URLs

#### LLM Prompt Utilities
- **`wrapSystemCitationPrompt()`** - Enhance system prompts with citation instructions
- **`wrapCitationPrompt()`** - Wrap both system and user prompts with citation guidance
- **`CITATION_JSON_OUTPUT_FORMAT`** - JSON schema for structured output LLMs (OpenAI, etc.)
- **`CITATION_REMINDER`** - Short reminder for reinforcement in user prompts
- **Position options**: `append`, `prepend`, `wrap` for optimal instruction placement

#### Citation Parsing
- **`getAllCitationsFromLlmOutput()`** - Extract citations from LLM response text
- **`parseCitation()`** - Parse individual citation tags
- **`normalizeCitation()`** - Normalize citation formats
- **`replaceCitations()`** - Replace or remove citations from text with verification status support
  - `leaveAnchorTextBehind` option to keep descriptive text
  - `showVerificationStatus` option for TUI status indicators (✓, ⚠, ✗, ◌)

### React Components

#### CitationComponent
- **5 Visual Variants**: `brackets` (default), `chip`, `text`, `superscript`, `linter`
- **3 Content Modes**: `anchorText`, `number`, `indicator`
- **Status Indicators**: Pending (spinner), Verified (green ✓), Partial (amber ✓), Not Found (red △)
- **Interactive Popover**: Hover shows verification image, click expands to full-size
- **Customizable Behavior**: `behaviorConfig` prop for custom click/hover handlers

#### URL Citations
- **Unified Citation Model** - Support for both document and URL-based citations
- **URL Citation Fields** - `url`, `domain`, `title`, `description`, `faviconUrl`, `sourceType`, `platform`, `author`, `publishedAt`

#### SourcesListComponent
- **Aggregated Sources Display** - Show all sources in a panel/drawer (like Gemini's "Sources")
- **4 Variants**: `drawer` (mobile-friendly), `modal`, `panel`, `inline`
- **SourcesTrigger** - Button with stacked favicons to open sources list

#### Icons
- `DeepCitationIcon`, `CheckIcon`, `SpinnerIcon`, `WarningIcon` exported from `/react`

### Styling
- **Tailwind CSS v4 Support** - Standalone `styles.css` for non-Tailwind users
- **Tailwind Presets** - Easy integration with existing Tailwind projects
- **shadcn/Radix Popover** - Modern, accessible popover implementation

### Package Structure
- **Granular Exports** - Import only what you need:
  - `deepcitation` - Main entry (parsing, prompts)
  - `deepcitation/client` - API client only
  - `deepcitation/prompts` - Prompt utilities only
  - `deepcitation/react` - React components
  - `deepcitation/types` - TypeScript types only
- **Tree-Shakeable** - ESM and CJS builds with proper exports

### Performance & Reliability
- **Optimized Diff Algorithm** - Custom implementation replacing `diff` npm dependency for Firebase Functions compatibility
- **Robust Citation Parsing** - Handles escaped quotes, HTML entities, Markdown-escaped underscores, unclosed tags
- **Comprehensive Test Suite** - 500+ tests covering parsing, normalization, and component behavior

### Examples
- **basic-verification** - Core 3-step workflow with OpenAI/Gemini
- **nextjs-ai-sdk** - Full-stack Next.js chat application
- **Raw API/curl** - Direct API usage without SDK

### Breaking Changes (from earlier 1.x versions)
- Removed `citation.css` - components now use Tailwind CSS exclusively
- Renamed `verifyCitations()` to `verify()` for cleaner API
- Removed `verifyCitationsFromLlmOutput()` (briefly renamed to `verifyAll()`, now removed)
- Renamed `fileId` to `attachmentId` throughout
- Renamed `PdfSpaceItem` to `SnippetPdfItem`
- `CitationVariant` type: removed `"indicator"` variant (use `content="indicator"` instead)

### Removed
- `removeCitations()` - use `replaceCitations()` instead

## [1.1.26] - 2026-01-15

### Added
- `DeepCitationIcon` component for branding

## [1.1.25] - 2026-01-15

### Added
- Bundled icon components (`CheckIcon`, `SpinnerIcon`, `WarningIcon`)

### Fixed
- Build configuration fixes

## [1.1.24] - 2026-01-14

### Changed
- Replaced `diff` npm dependency with custom implementation for Firebase Functions compatibility
- Improved bundle size and reduced external dependencies

## [1.1.23] - 2026-01-13

### Fixed
- Build error fixes

## [1.1.22] - 2026-01-12

### Changed
- Simplified CitationComponent with shadcn/Radix Popover and Tailwind CSS
- Simplified verification model types

## [1.1.21] - 2026-01-11

### Fixed
- Line ID handling improvements

## [1.1.20] - 2026-01-10

### Changed
- Improved CitationComponent tooltip efficiency for partial matches

## [1.1.19] - 2026-01-09

### Added
- Attachment support for file handling

### Changed
- Renamed `fileId` to `attachmentId` across the codebase

## [1.1.18] - 2026-01-08

### Fixed
- CitationComponent variant styles now properly inherit text color

## [1.1.17] - 2026-01-07

### Changed
- Renamed `displayAnchorText`/`displayBrackets` to `showAnchorText`/`showBrackets`

## [1.1.16] - 2026-01-06

### Changed
- Improved CitationComponent API
- Added `behaviorConfig` for customizing click/hover behavior

## [1.1.15] - 2026-01-05

### Changed
- Refactored CitationComponent: simplified variants
- Added `displayBrackets` prop

## [1.1.14] - 2026-01-04

### Added
- AnchorText support for descriptive citation text

## [1.1.13] - 2026-01-03

### Changed
- Improved demo and parsing preservation

## [1.1.12] - 2026-01-02

### Changed
- Clearer naming conventions throughout the codebase

## [1.1.11] - 2026-01-01

### Changed
- Updated examples to use fast/cheap models
- Added Gemini support in examples

## [1.1.10] - 2025-12-31

### Changed
- Client cleanup and improvements

## [1.1.9] - 2025-12-30

### Added
- AnchorText feature for citation display

## [1.1.8] - 2025-12-29

### Fixed
- Example improvements

## [1.1.7] - 2025-12-28

### Fixed
- npm build configuration

## [1.1.6] - 2025-12-27

### Added
- Initial public release
- Citation parsing and normalization
- LLM prompt utilities (`wrapSystemCitationPrompt`, `CITATION_JSON_OUTPUT_FORMAT`)
- Citation extraction (`getAllCitationsFromLlmOutput`)
- React components (`CitationComponent`, `UrlCitationComponent`)
- DeepCitation API client
- TypeScript support
- Verification image display with popover

[Unreleased]: https://github.com/deepcitation/deepcitation/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/deepcitation/deepcitation/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/deepcitation/deepcitation/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/deepcitation/deepcitation/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/deepcitation/deepcitation/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/deepcitation/deepcitation/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/deepcitation/deepcitation/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/deepcitation/deepcitation/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/deepcitation/deepcitation/compare/v1.1.53...v0.1.0
[1.1.53]: https://github.com/deepcitation/deepcitation/compare/v1.1.52...v1.1.53
[1.1.52]: https://github.com/deepcitation/deepcitation/compare/v1.1.51...v1.1.52
[1.1.51]: https://github.com/deepcitation/deepcitation/compare/v1.1.50...v1.1.51
[1.1.50]: https://github.com/deepcitation/deepcitation/compare/v1.1.26...v1.1.50
[1.1.26]: https://github.com/deepcitation/deepcitation/compare/v1.1.25...v1.1.26
[1.1.25]: https://github.com/deepcitation/deepcitation/compare/v1.1.24...v1.1.25
[1.1.24]: https://github.com/deepcitation/deepcitation/compare/v1.1.22...v1.1.24
[1.1.23]: https://github.com/deepcitation/deepcitation/compare/v1.1.22...v1.1.23
[1.1.22]: https://github.com/deepcitation/deepcitation/compare/v1.1.21...v1.1.22
[1.1.21]: https://github.com/deepcitation/deepcitation/compare/v1.1.20...v1.1.21
[1.1.20]: https://github.com/deepcitation/deepcitation/compare/v1.1.19...v1.1.20
[1.1.19]: https://github.com/deepcitation/deepcitation/compare/v1.1.18...v1.1.19
[1.1.18]: https://github.com/deepcitation/deepcitation/compare/v1.1.17...v1.1.18
[1.1.17]: https://github.com/deepcitation/deepcitation/compare/v1.1.16...v1.1.17
[1.1.16]: https://github.com/deepcitation/deepcitation/compare/v1.1.15...v1.1.16
[1.1.15]: https://github.com/deepcitation/deepcitation/compare/v1.1.14...v1.1.15
[1.1.14]: https://github.com/deepcitation/deepcitation/compare/v1.1.13...v1.1.14
[1.1.13]: https://github.com/deepcitation/deepcitation/compare/v1.1.12...v1.1.13
[1.1.12]: https://github.com/deepcitation/deepcitation/compare/v1.1.11...v1.1.12
[1.1.11]: https://github.com/deepcitation/deepcitation/compare/v1.1.10...v1.1.11
[1.1.10]: https://github.com/deepcitation/deepcitation/compare/v1.1.9...v1.1.10
[1.1.9]: https://github.com/deepcitation/deepcitation/compare/v1.1.8...v1.1.9
[1.1.8]: https://github.com/deepcitation/deepcitation/compare/v1.1.7...v1.1.8
[1.1.7]: https://github.com/deepcitation/deepcitation/compare/v1.1.6...v1.1.7
[1.1.6]: https://github.com/deepcitation/deepcitation/releases/tag/v1.1.6
