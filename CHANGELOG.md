# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.50] - 2025-01-21

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
  - `leaveKeySpanBehind` option to keep descriptive text
  - `showVerificationStatus` option for TUI status indicators (✓, ⚠, ✗, ◌)

### React Components

#### CitationComponent
- **5 Visual Variants**: `brackets` (default), `chip`, `text`, `superscript`, `minimal`
- **3 Content Modes**: `keySpan`, `number`, `indicator`
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
  - `@deepcitation/deepcitation-js` - Main entry (parsing, prompts)
  - `@deepcitation/deepcitation-js/client` - API client only
  - `@deepcitation/deepcitation-js/prompts` - Prompt utilities only
  - `@deepcitation/deepcitation-js/react` - React components
  - `@deepcitation/deepcitation-js/types` - TypeScript types only
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
- Renamed `verifyCitationsFromLlmOutput()` to `verifyAll()`
- Renamed `fileId` to `attachmentId` throughout
- Renamed `PdfSpaceItem` to `SnippetPdfItem`
- `CitationVariant` type: removed `"indicator"` variant (use `content="indicator"` instead)

### Deprecated
- `removeCitations()` - use `replaceCitations()` instead (still works for backward compatibility)

## [1.1.26] - 2025-01-15

### Added
- `DeepCitationIcon` component for branding

## [1.1.25] - 2025-01-15

### Added
- Bundled icon components (`CheckIcon`, `SpinnerIcon`, `WarningIcon`)

### Fixed
- Build configuration fixes

## [1.1.24] - 2025-01-14

### Changed
- Replaced `diff` npm dependency with custom implementation for Firebase Functions compatibility
- Improved bundle size and reduced external dependencies

## [1.1.23] - 2025-01-13

### Fixed
- Build error fixes

## [1.1.22] - 2025-01-12

### Changed
- Simplified CitationComponent with shadcn/Radix Popover and Tailwind CSS
- Simplified verification model types

## [1.1.21] - 2025-01-11

### Fixed
- Line ID handling improvements

## [1.1.20] - 2025-01-10

### Changed
- Improved CitationComponent tooltip efficiency for partial matches

## [1.1.19] - 2025-01-09

### Added
- Attachment support for file handling

### Changed
- Renamed `fileId` to `attachmentId` across the codebase

## [1.1.18] - 2025-01-08

### Fixed
- CitationComponent variant styles now properly inherit text color

## [1.1.17] - 2025-01-07

### Changed
- Renamed `displayKeySpan`/`displayBrackets` to `showKeySpan`/`showBrackets`

## [1.1.16] - 2025-01-06

### Changed
- Improved CitationComponent API
- Added `behaviorConfig` for customizing click/hover behavior

## [1.1.15] - 2025-01-05

### Changed
- Refactored CitationComponent: simplified variants
- Added `displayBrackets` prop

## [1.1.14] - 2025-01-04

### Added
- KeySpan support for descriptive citation text

## [1.1.13] - 2025-01-03

### Changed
- Improved demo and parsing preservation

## [1.1.12] - 2025-01-02

### Changed
- Clearer naming conventions throughout the codebase

## [1.1.11] - 2025-01-01

### Changed
- Updated examples to use fast/cheap models
- Added Gemini support in examples

## [1.1.10] - 2024-12-31

### Changed
- Client cleanup and improvements

## [1.1.9] - 2024-12-30

### Added
- KeySpan feature for citation display

## [1.1.8] - 2024-12-29

### Fixed
- Example improvements

## [1.1.7] - 2024-12-28

### Fixed
- npm build configuration

## [1.1.6] - 2024-12-27

### Added
- Initial public release
- Citation parsing and normalization
- LLM prompt utilities (`wrapSystemCitationPrompt`, `CITATION_JSON_OUTPUT_FORMAT`)
- Citation extraction (`getAllCitationsFromLlmOutput`)
- React components (`CitationComponent`, `UrlCitationComponent`)
- DeepCitation API client
- TypeScript support
- Verification image display with popover

[Unreleased]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.50...HEAD
[1.1.50]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.26...v1.1.50
[1.1.26]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.25...v1.1.26
[1.1.25]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.24...v1.1.25
[1.1.24]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.22...v1.1.24
[1.1.23]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.22...v1.1.23
[1.1.22]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.21...v1.1.22
[1.1.21]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.20...v1.1.21
[1.1.20]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.19...v1.1.20
[1.1.19]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.18...v1.1.19
[1.1.18]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.17...v1.1.18
[1.1.17]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.16...v1.1.17
[1.1.16]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.15...v1.1.16
[1.1.15]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.14...v1.1.15
[1.1.14]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.13...v1.1.14
[1.1.13]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.12...v1.1.13
[1.1.12]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.11...v1.1.12
[1.1.11]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.10...v1.1.11
[1.1.10]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.9...v1.1.10
[1.1.9]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.8...v1.1.9
[1.1.8]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.7...v1.1.8
[1.1.7]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.6...v1.1.7
[1.1.6]: https://github.com/deepcitation/deepcitation-js/releases/tag/v1.1.6
