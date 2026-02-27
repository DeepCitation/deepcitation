# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Deprecated

- `prepareAttachment()` is deprecated in favor of `prepareAttachments()`. The old method remains as a compatibility alias and will be removed in the next major release.

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
- Zero runtime dependencies (React components require React + `@radix-ui/react-popover`)

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

[Unreleased]: https://github.com/deepcitation/deepcitation/compare/v0.1.0...HEAD
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
