# CLAUDE.md - DeepCitation Package

This file provides guidance to Claude Code when working with the DeepCitation npm package.

## Package Overview

DeepCitation is a citation verification and parsing library that enables AI-generated content to include verifiable references. It provides citation extraction, normalization, verification against attachments, and visual proof generation.

## Key Exports

### Core (main entry)
```typescript
import {
  wrapSystemCitationPrompt,
  wrapCitationPrompt,
  CITATION_JSON_OUTPUT_FORMAT,
  CITATION_REMINDER,
  getAllCitationsFromLlmOutput,
} from "@deepcitation/deepcitation-js";
```

### React Components (/react)
```typescript
import {
  CitationComponent,
  SourcesListComponent,
  SourcesTrigger,
  SourcesListItem,
} from "@deepcitation/deepcitation-js/react";
```

### Types
```typescript
import type {
  Citation, CitationType, Verification, SourceType,
  CitationRecord,      // Record<string, Citation> — NOT an array
  VerificationRecord,  // Record<string, Verification>
} from "@deepcitation/deepcitation-js";
```

`CitationRecord` is an object keyed by citationKey hash. Check emptiness with `Object.keys(citations).length === 0`, not `.length`.

## Package Structure

```
src/
├── index.ts              # Main exports
├── client/               # DeepCitation client
│   └── errors.ts         # Error classes — CANONICAL LOCATION
├── parsing/
│   ├── parseCitation.ts  # getCitationStatus() — CANONICAL LOCATION
│   ├── normalizeCitation.ts
│   └── parseWorkAround.ts
├── prompts/
│   ├── citationPrompts.ts
│   └── promptCompression.ts
├── react/
│   ├── index.ts
│   ├── CitationComponent.tsx   # HOVER_CLOSE_DELAY_MS, REPOSITION_GRACE_PERIOD_MS etc.
│   ├── CitationVariants.tsx    # useCitationEvents(), StatusIndicators
│   ├── SourcesListComponent.tsx
│   ├── UrlCitationComponent.tsx
│   ├── constants.ts      # MISS_WAVY_UNDERLINE_STYLE, DOT_INDICATOR_*_STYLE, isValidProofImageSrc(), getPortalContainer()
│   ├── HighlightedPhrase.tsx # HighlightedPhrase — CANONICAL LOCATION
│   ├── dateUtils.ts      # formatCaptureDate()
│   └── utils.ts          # generateCitationKey() — CANONICAL LOCATION
├── markdown/
│   ├── renderMarkdown.ts
│   ├── markdownVariants.ts  # getIndicator(), toSuperscript(), humanizeLinePosition(), formatPageLocation()
│   └── types.ts             # INDICATOR_SETS, SUPERSCRIPT_DIGITS
├── rendering/            # Slack, GitHub, HTML, Terminal renderers
│   ├── proofUrl.ts       # buildProofUrl(), buildSnippetImageUrl(), buildProofUrls()
│   ├── types.ts          # RenderOptions, RenderedOutput, RenderCitationWithStatus
│   ├── slack/
│   ├── github/
│   ├── html/
│   └── terminal/
├── types/
│   ├── citation.ts
│   ├── verification.ts
│   ├── boxes.ts
│   └── search.ts
└── utils/
    ├── urlSafety.ts      # extractDomain(), isDomainMatch()
    ├── logSafety.ts      # sanitizeForLog(), createLogEntry()
    ├── objectSafety.ts   # isSafeKey(), safeAssign(), safeMerge()
    ├── regexSafety.ts    # safeMatch(), safeReplace(), safeTest()
    └── sha.ts
```

## Example App Models

The Next.js example uses these models (DO NOT CHANGE):
- **OpenAI**: `gpt-5-mini`
- **Google**: `gemini-2.0-flash-lite`

## Important: Security Patterns

This codebase has dedicated security utilities in `src/utils/`. Always use them instead of ad-hoc patterns.

### URL Domain Matching
**NEVER use `url.includes("twitter.com")` or substring matching for domain checks.** This is vulnerable to subdomain spoofing (`twitter.com.evil.com` would match). Always use:

```typescript
import { isDomainMatch } from "../utils/urlSafety.js";
if (isDomainMatch(url, "twitter.com")) { /* safe */ }
```

### Object Property Assignment from Untrusted Input
**NEVER assign untrusted keys directly to objects.** This enables prototype pollution via `__proto__` or `constructor` keys.

```typescript
import { safeAssign } from "../utils/objectSafety.js";
safeAssign(obj, userKey, userValue); // Rejects __proto__, constructor, prototype
```

### Regex on Untrusted Input
**NEVER apply regex with nested quantifiers to unbounded user input.** Use the safe wrappers that validate input length:

```typescript
import { safeMatch, safeReplace } from "../utils/regexSafety.js";
const matches = safeMatch(userInput, /pattern/g); // Throws if input > 100KB
```

### Logging Untrusted Data
**NEVER log user-provided strings directly.** Newlines and ANSI codes can inject fake log entries:

```typescript
import { sanitizeForLog } from "../utils/logSafety.js";
console.log("[API] Input:", sanitizeForLog(userInput));
```

### Image Source Validation
**NEVER render `<img src={...}>` with unvalidated sources.** Use `isValidProofImageSrc()` from `src/react/constants.ts` to block SVG data URIs (which can contain scripts) and untrusted hosts.

## Important: No Variable Re-Exports

**NEVER re-export variables (functions, constants, classes) from a different module.** Re-exporting variables causes bundler issues, circular dependency problems, tree-shaking failures, and makes the dependency graph harder to trace.

### Rules

1. **Every function/constant has ONE canonical location.** That's where it's defined. All consumers import from that location directly.
2. **No barrel re-exports of variables.** Do not create `index.ts` files that `export { X } from "./other.js"` for variables. Type-only re-exports (`export type { X }`) are acceptable.
3. **No alias exports.** Do not create a new variable that just references another (e.g., `export const ALIAS = ORIGINAL`).
4. **No wrapper files.** Do not create files whose sole purpose is to re-export from other modules.
5. **Import from canonical locations.** When you need a function from another module, import directly from the file that defines it.

### Canonical Locations

| Symbol | Canonical file | Notes |
|--------|---------------|-------|
| `getCitationStatus()` | `src/parsing/parseCitation.ts` | Status computation |
| `generateCitationKey()` | `src/react/utils.ts` | Key generation |
| `getIndicator()` | `src/markdown/markdownVariants.ts` | Status → indicator char |
| `INDICATOR_SETS` | `src/markdown/types.ts` | Indicator character sets |
| `SUPERSCRIPT_DIGITS` | `src/markdown/types.ts` | Unicode superscript chars |
| `toSuperscript()` | `src/markdown/markdownVariants.ts` | Number → superscript |
| `humanizeLinePosition()` | `src/markdown/markdownVariants.ts` | LineId → position label |
| `formatPageLocation()` | `src/markdown/markdownVariants.ts` | Page location string |
| `buildProofUrl()` | `src/rendering/proofUrl.ts` | Proof URL construction |
| `MISS_WAVY_UNDERLINE_STYLE` | `src/react/constants.ts` | Wavy underline CSS |
| `DOT_INDICATOR_SIZE_STYLE` | `src/react/constants.ts` | Dot indicator sizing (inline, em-based) |
| `DOT_INDICATOR_FIXED_SIZE_STYLE` | `src/react/constants.ts` | Dot indicator sizing (drawers/wrappers, fixed px) |
| `HighlightedPhrase` | `src/react/HighlightedPhrase.tsx` | Shared fullPhrase highlight component |
| `formatCaptureDate()` | `src/react/dateUtils.ts` | Date formatting for timestamps |
| `extractDomain()`, `isDomainMatch()` | `src/utils/urlSafety.ts` | Safe domain matching (never use `url.includes()`) |
| `sanitizeForLog()`, `createLogEntry()` | `src/utils/logSafety.ts` | Log injection prevention |
| `isSafeKey()`, `safeAssign()`, `safeMerge()` | `src/utils/objectSafety.ts` | Prototype pollution prevention |
| `safeMatch()`, `safeReplace()`, `safeTest()` | `src/utils/regexSafety.ts` | ReDoS prevention (input length validation) |
| `isValidProofImageSrc()` | `src/react/constants.ts` | Image source validation (blocks SVG, untrusted hosts) |
| `getPortalContainer()` | `src/react/constants.ts` | SSR-safe portal container |
| `formatTtc()` | `src/react/timingUtils.ts` | TtC duration formatting |
| `computeTimingMetrics()` | `src/react/timingUtils.ts` | Aggregate TtC metrics |
| `getTtcTier()` | `src/react/timingUtils.ts` | Fast/normal/slow classification |
| `useCitationTiming()` | `src/react/timingUtils.ts` | Core citation lifecycle timing hook |
| `useTtcMetrics()` | `src/react/timingUtils.ts` | Memoized aggregate metrics hook |
| `REVIEW_DWELL_THRESHOLD_MS` | `src/react/timingUtils.ts` | Popover dwell threshold (2s) for review detection |
| `TTC_TEXT_STYLE` | `src/react/constants.ts` | Muted TtC display style (tabular-nums) |
| `TTC_FAST_TEXT_STYLE` | `src/react/constants.ts` | Green-tinted TtC style for fast reviews |

### Example

```typescript
// WRONG — re-exporting a variable from another module
export { getCitationStatus } from "../../parsing/parseCitation.js"; // ❌ DO NOT

// WRONG — creating an alias
export const BROKEN_WAVY_UNDERLINE_STYLE = MISS_WAVY_UNDERLINE_STYLE; // ❌ DO NOT

// CORRECT — import directly from canonical location
import { getCitationStatus } from "../../parsing/parseCitation.js"; // ✓
import { generateCitationKey } from "../../react/utils.js";         // ✓
import { getIndicator } from "../../markdown/markdownVariants.js";   // ✓
```

## Important: Type Safety

### Discriminated Unions Must Be Complete

When a type uses a discriminator field (e.g., `type: "url" | "document"`), **every function that creates instances of that type must set the discriminator**. After adding or modifying a discriminator field, grep for all constructors, factories, and parsing functions that produce that type and ensure they set the field correctly.

```typescript
// WRONG — parseCitation creates a Citation but never sets type
return { pageNumber, lineIds, fullPhrase }; // ❌ Missing type: "document"

// CORRECT
return { type: "document", pageNumber, lineIds, fullPhrase }; // ✓
```

### No Unsafe Casts

**Avoid `as unknown as T` casts.** Use type guards instead:

```typescript
// WRONG
const doc = citation as unknown as DocumentCitation; // ❌

// CORRECT
if (isDocumentCitation(citation)) {
  // TypeScript now knows citation is DocumentCitation
}
```

If a cast is truly unavoidable, add a comment explaining why it's safe.

### Export Verification

When adding new public types or functions, verify they are exported from the appropriate index file:
- Core types/functions → `src/index.ts`
- React components → `src/react/index.ts`

Missing exports have required follow-up fix PRs in the past. Check before submitting.

## Important: Internal vs External Data

### Line IDs are Internal Only

**Do NOT expose `lineIds` to end users.** Line IDs are internal identifiers used by the verification system and do not correspond directly to visible line numbers in documents.

- **Internal use**: `lineIds` are used for verification matching and stored in `Citation.lineIds`
- **User-facing display**: Show only `pageNumber` (e.g., "Page 3") — never show line IDs
- **Markdown output**: Reference sections should show page numbers only

```typescript
`Page 3, Lines 12-15`  // ❌ Confusing - these aren't visible line numbers
`Page 3`               // ✓ Clear and verifiable
```

### Humanizing Line Position (Acceptable)

You **can** humanize line IDs into relative positions for location mismatch context:

```typescript
`Page 3 (expected early, found middle)`  // ✓ Helpful context without exposing internals
`Page 3, Lines 12-15`                    // ❌ Raw line IDs
```
