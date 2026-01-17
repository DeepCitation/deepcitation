# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New `content` prop for CitationComponent to control what text is displayed (`keySpan`, `number`, `indicator`)
- New `chip` variant for pill/badge style citations with background colors
- New `superscript` variant for footnote-style citations
- Granular package exports: `/client`, `/prompts`, `/types` for better tree-shaking
- `UrlCitationVariant` type for URL citation components
- Icons now exported from `/react`: `DeepCitationIcon`, `CheckIcon`, `SpinnerIcon`, `WarningIcon`
- New `replaceCitations()` function with verification status support
  - `leaveKeySpanBehind` option to keep key_span text
  - `verifications` option to pass verification results
  - `showVerificationStatus` option to display status indicators (✓, ⚠, ✗, ◌)
- Environment variable overrides for `SYSTEM_PROMPT` and `USER_PROMPT` in basic-verification examples

### Changed
- **Breaking**: Removed `citation.css` - components now use Tailwind CSS exclusively
- **Breaking**: `CitationVariant` type updated: removed `"indicator"` variant (use `content="indicator"` instead)
- **Breaking**: Renamed `verifyCitations()` to `verify()` for cleaner API
- **Breaking**: Renamed `verifyCitationsFromLlmOutput()` to `verifyAll()` for cleaner API
- Separated visual style (`variant`) from content display (`content`) in CitationComponent API
- Default content per variant: `chip`→`keySpan`, `brackets`→`number`, `text`→`keySpan`, `superscript`→`number`, `minimal`→`number`
- Missing citation numbers now default to `"1"` instead of empty string
- Moved `DeepCitationIcon` from main export to `/react` only (prevents React in non-React builds)
- Updated Playwright tests to use data attributes instead of CSS class selectors
- `replaceCitations()` now handles any attribute ordering in cite tags (flexible parsing)

### Fixed
- Package.json: removed incorrect `directory` field from repository config
- Package.json: added `homepage` and `bugs` fields for npm discoverability
- `verify()` and `verifyAll()` now return empty `{ verifications: {} }` when no citations provided (avoids unnecessary API calls)

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

[Unreleased]: https://github.com/deepcitation/deepcitation-js/compare/v1.1.26...HEAD
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
