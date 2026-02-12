# Implemented: Citation & Verification Discriminated Union Refactor + CitationPage[]

## Goal

Refactor `Citation` and `Verification` from flat optional-everything interfaces into proper TypeScript discriminated unions / sub-organized interfaces, and add `CitationPage[]` to Verification for returning page data for user inspection.

---

## Part 1: Citation Discriminated Union

### New Type Structure (in `src/types/citation.ts`)

```typescript
// Common fields shared by all citation types
interface CitationBase {
  fullPhrase?: string | null;
  anchorText?: string | null;
  citationNumber?: number;
  reasoning?: string | null;
  beforeCite?: string;
  timestamps?: { startTime?: string; endTime?: string };
}

// Document-specific fields
interface DocumentCitation extends CitationBase {
  type?: "document";  // optional for backward compat (undefined = document)
  attachmentId?: string;
  pageNumber?: number | null;
  lineIds?: number[] | null;
  startPageId?: string | null;
  selection?: ScreenBox | null;
}

// URL-specific fields
interface UrlCitation extends CitationBase {
  type: "url";  // REQUIRED — the discriminator
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  faviconUrl?: string;
  sourceType?: SourceType;
  platform?: string;
  siteName?: string;
  author?: string;
  publishedAt?: Date | string;
  imageUrl?: string;
  accessedAt?: Date | string;
}

// The union type
type Citation = DocumentCitation | UrlCitation;
```

### Key Design Decisions

- **`DocumentCitation.type`** is `"document" | undefined` — backward compatible with all existing code that creates `{ attachmentId: "...", pageNumber: 1 }` without specifying `type`
- **`UrlCitation.type`** is always `"url"` — required discriminator
- Narrowing: `citation.type === "url"` gives `UrlCitation`, everything else gives `DocumentCitation`
- All common fields (`fullPhrase`, `anchorText`, etc.) accessible without narrowing

### isUrlCitation Type Guard Update (in `src/react/utils.ts`)

```typescript
// Before: returns boolean, checks citation.url fallback
export function isUrlCitation(citation: Citation): boolean

// After: returns type predicate, clean discriminator only
export function isUrlCitation(citation: Citation): citation is UrlCitation {
  return citation.type === "url";
}
```

Remove the `typeof citation.url === "string"` fallback — with proper types, URL citations must have `type: "url"`.

---

## Part 2: Verification Sub-Organization

### New Sub-Interfaces (in `src/types/verification.ts`)

```typescript
/** Document-specific verification results */
interface DocumentVerificationResult {
  verifiedPageNumber?: number | null;
  verifiedLineIds?: number[] | null;
  totalLinesOnPage?: number | null;
  hitIndexWithinPage?: number | null;
  phraseMatchDeepItem?: DeepTextItem;
  anchorTextMatchDeepItems?: DeepTextItem[];
  verificationImageBase64?: string | null;
  verificationImageDimensions?: { width: number; height: number } | null;
}

/** URL-specific verification results */
interface UrlVerificationResult {
  verifiedUrl?: string | null;
  resolvedUrl?: string | null;
  httpStatus?: number | null;
  urlAccessStatus?: UrlAccessStatus | null;
  contentMatchStatus?: ContentMatchStatus | null;
  contentSimilarity?: number | null;
  verifiedTitle?: string | null;
  actualContentSnippet?: string | null;
  webPageScreenshotBase64?: string | null;
  crawledAt?: Date | string | null;
  urlVerificationError?: string | null;
  verifiedDomain?: string | null;
  verifiedDescription?: string | null;
  verifiedFaviconUrl?: string | null;
  verifiedSiteName?: string | null;
  verifiedAuthor?: string | null;
  verifiedPublishedAt?: Date | string | null;
  verifiedImageUrl?: string | null;
  contentType?: string | null;
}

/** Proof hosting fields (populated when generateProofUrls is true) */
interface VerificationProof {
  proofId?: string;
  proofUrl?: string;
  proofImageUrl?: string;
}
```

### Updated Verification Interface

```typescript
interface Verification {
  // Identity
  attachmentId?: string | null;
  label?: string | null;
  citation?: Citation;

  // Search
  status?: SearchStatus | null;
  searchAttempts?: SearchAttempt[];
  highlightColor?: string | null;

  // Shared verified text results
  verifiedTimestamps?: { startTime?: string; endTime?: string } | null;
  verifiedFullPhrase?: string | null;
  verifiedAnchorText?: string | null;
  verifiedMatchSnippet?: string | null;
  verifiedAt?: Date;

  // Type-specific results (NEW sub-objects)
  document?: DocumentVerificationResult;
  url?: UrlVerificationResult;
  proof?: VerificationProof;

  // Ambiguity detection (unchanged)
  ambiguity?: { ... } | null;

  // NEW: Pages for user inspection
  pages?: CitationPage[];

  // DEPRECATED flat fields (kept for backward compat, marked @deprecated)
  /** @deprecated Use document?.verifiedPageNumber */
  verifiedPageNumber?: number | null;
  /** @deprecated Use document?.verifiedLineIds */
  verifiedLineIds?: number[] | null;
  /** @deprecated Use document?.totalLinesOnPage */
  totalLinesOnPage?: number | null;
  // ... (all existing flat fields kept with @deprecated)
  /** @deprecated Use proof?.proofId */
  proofId?: string;
  /** @deprecated Use proof?.proofUrl */
  proofUrl?: string;
  /** @deprecated Use proof?.proofImageUrl */
  proofImageUrl?: string;
}
```

### Why NOT a discriminated union for Verification

Verification uses composition (sub-objects) instead of a union because:
1. The backend returns a single object — consumers shouldn't need to discriminate
2. A verification could have both document and URL results in the future
3. `verification.document?.verifiedPageNumber` is cleaner than type guards everywhere
4. Flat deprecated fields mean zero breaking changes

---

## Part 3: CitationPage[] on Verification

### New Type (in `src/types/verification.ts`)

```typescript
/**
 * A page returned from verification for user inspection.
 * Extends the existing Page type from boxes.ts with verification-specific metadata.
 */
interface CitationPage extends Page {
  /** Whether this page contains the verified citation match */
  isMatchPage?: boolean;
  /** Highlighted region on this page (if match found) */
  highlightBox?: ScreenBox;
}
```

The existing `Page` type already has `pageNumber`, `dimensions`, `source` (image URL), `thumbnail`, and `expiresAt`. `CitationPage` adds verification context on top.

Added as `pages?: CitationPage[]` on the main `Verification` — not nested under `document` because URL verifications could also return page screenshots in the future.

---

## Part 4: Files to Change

### Core type definitions
1. **`src/types/citation.ts`** — Define `CitationBase`, `DocumentCitation`, `UrlCitation`; change `Citation` to union type; export all new interfaces
2. **`src/types/verification.ts`** — Define `DocumentVerificationResult`, `UrlVerificationResult`, `VerificationProof`, `CitationPage`; add sub-objects + deprecated flat fields to `Verification`; update `BLANK_VERIFICATION`

### Export updates
3. **`src/types/index.ts`** — Export new types
4. **`src/index.ts`** — Export new types from main entry

### Type guard
5. **`src/react/utils.ts`** — Update `isUrlCitation()` to type predicate; remove url-field fallback

### Consumer code (fix TS errors from union narrowing)
6. **`src/react/CitationComponent.tsx`** — Wrap URL-field accesses in `isUrlCitation()` guards where missing
7. **`src/react/CitationDrawer.tsx`** — Same
8. **`src/react/CitationDrawer.utils.tsx`** — Same
9. **`src/react/VerificationLog.tsx`** — Same
10. **`src/react/SourcesListComponent.utils.tsx`** — Same
11. **`src/rendering/html/htmlRenderer.ts`** — Wrap `citation.title` access
12. **`src/rendering/github/githubRenderer.ts`** — Same
13. **`src/rendering/terminal/terminalRenderer.ts`** — Same
14. **`src/rendering/slack/slackRenderer.ts`** — Same
15. **`src/markdown/markdownVariants.ts`** — Wrap `citation.attachmentId` access
16. **`src/parsing/parseCitation.ts`** — Wrap `citation.attachmentId` access
17. **`src/client/DeepCitation.ts`** — Wrap `citation.attachmentId` access
18. **`src/react/utils.ts`** — `generateCitationKey()` needs narrowing for url-specific key parts

### Tests (add `type: "url"` where missing on URL citation fixtures)
19. Test files with URL citation fixtures need `type: "url"` added to pass TS

---

## Part 5: Execution Order

1. Define new sub-interfaces in `citation.ts` (`CitationBase`, `DocumentCitation`, `UrlCitation`) and make `Citation` a union
2. Define new sub-interfaces in `verification.ts` (`DocumentVerificationResult`, `UrlVerificationResult`, `VerificationProof`, `CitationPage`) and add to `Verification` with deprecated flat fields
3. Update `isUrlCitation()` to type predicate
4. Update exports in `types/index.ts` and `src/index.ts`
5. Run `tsc --noEmit` and fix all TS errors in consumers
6. Update `BLANK_VERIFICATION` constant
7. Run tests to verify no regressions
