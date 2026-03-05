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
} from "deepcitation";
```

### React Components (/react)
```typescript
import {
  CitationComponent,
  SourcesListComponent,
  SourcesTrigger,
  SourcesListItem,
  // i18n
  DeepCitationI18nProvider,
  useTranslation,
} from "deepcitation/react";
```

### Types
```typescript
import type {
  Citation, CitationType, Verification, SourceType,
  CitationRecord,      // Record<string, Citation> — NOT an array
  VerificationRecord,  // Record<string, Verification>
} from "deepcitation";
```

`CitationRecord` is an object keyed by citationKey hash. Check emptiness with `Object.keys(citations).length === 0`, not `.length`.

## Package Structure

```
src/
├── index.ts              # Main exports
├── client/               # DeepCitation client
├── parsing/              # parseCitation.ts (getCitationStatus), normalizeCitation, parseWorkAround
├── prompts/              # citationPrompts.ts, promptCompression.ts
├── react/
│   ├── index.ts          # Public API types + consumer-facing exports
│   ├── i18n.tsx          # i18n infrastructure (all i18n symbols)
│   ├── locales/          # Locale JSON files (en, es, fr, …)
│   ├── Citation.tsx      # Document + URL citation components (popover wiring)
│   ├── DefaultPopoverContent.tsx  # Three-zone popover (success/partial/miss)
│   ├── EvidenceTray.tsx  # Evidence display, keyhole viewer, InlineExpandedImage
│   ├── constants.ts      # Shared style constants, isValidProofImageSrc(), getPortalContainer()
│   ├── hooks/            # Extracted hooks (import directly, not via index.ts)
│   └── utils.ts          # generateCitationKey()
├── markdown/             # renderMarkdown, markdownVariants, types
├── rendering/            # Slack, GitHub, HTML, Terminal renderers (proofUrl.ts)
├── types/                # citation.ts, verification.ts, boxes.ts, search.ts
└── utils/                # urlSafety, logSafety, objectSafety, regexSafety, fileSafety, sha
```

For canonical file locations of all exports, see `docs/agents/canonical-exports.md`.

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

For the full canonical locations table and import examples, see `docs/agents/canonical-exports.md`.

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

## Important: Popover Positioning — No Collision Avoidance

No flip/shift middleware. Side is locked once on open via `useLockedPopoverSide`. Overflow is handled by a three-layer defense (primary positioning → hook offsets → CSS guard). `EXPANDED_POPOVER_HEIGHT` must be a fixed `calc(100vh - 2rem)`, never dynamic.

For the full positioning architecture, three-layer defense table, and hook details, see `docs/agents/react-citation-ui.md`.

## Important: Accessibility Patterns

Key constraints (CitationComponent handles focus/a11y, not the custom popover):
- **NEVER** set `inert` on `document.body` — popover portals into body, so this makes the popover itself inert. Use `<main>` or skip the portal's container.
- **Conditional focus return**: keyboard-opened → return focus to trigger; mouse/touch-opened → suppress focus return (`e.preventDefault()`) to avoid scroll-jump.
- **Always render `aria-live` containers** (even when empty). Conditional render misses the first announcement. Clear announcement text on re-enter pending.
- **Keep `AnimatedHeightWrapper` DOM** on reduced motion — pass `0` duration, never return a Fragment (0ms transitions don't fire `transitionend`).

For full code examples, focus trap patterns, and arrow-key panning details, see `docs/agents/a11y-patterns.md`.

## Important: Internationalization (i18n)

**No hardcoded user-facing strings or aria-labels in React components.** All text must use i18n keys via `useTranslation()` → `t("key")`. New keys go in `defaultMessages` (`src/react/i18n.tsx`) and all locale files (`src/react/locales/`). CI enforces locale key parity via `src/__tests__/i18nLocales.test.ts`.

For full usage patterns, key naming conventions, and code review checklist, see `docs/agents/i18n-policy.md`.
