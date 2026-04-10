---
layout: default
title: Types
parent: API Reference
nav_order: 1
description: "TypeScript interface definitions for DeepCitation"
commit_sha: "80dfecd"
stale_after_commits: 10
watch_paths:
  - src/types/citation.ts
  - src/types/verification.ts
  - src/types/search.ts
  - src/types/index.ts
  - src/index.ts
---

# Type Definitions

TypeScript interfaces for the DeepCitation SDK and React components.

---

## Citation Types

DeepCitation supports three citation shapes, discriminated by `type`.

```typescript
interface CitationBase {
  attachmentId?: string;
  pageNumber?: number;
  lineIds?: number[];
  startPageId?: string;
  sourceContext?: string;
  sourceMatch?: string;
  citationNumber?: number;
  reasoning?: string;
}

interface DocumentCitation extends CitationBase {
  type: "document";
}

interface UrlCitation extends CitationBase {
  type: "url";
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  faviconUrl?: string;
  sourceType?: SourceType;
  platform?: string;
  siteName?: string;
  author?: string;
  publishedAt?: string;
  imageUrl?: string;
  accessedAt?: string;
}

interface AudioVideoCitation extends CitationBase {
  type: "audio" | "video";
  timestamps?: { startTime?: string; endTime?: string };
}

type Citation = DocumentCitation | UrlCitation | AudioVideoCitation;

type SourceType =
  | "web" | "pdf" | "document" | "social" | "video"
  | "news" | "academic" | "code" | "forum" | "commerce"
  | "reference" | "unknown";
```

---

## VerifyCitationRequest

Request body for `/verifyCitations`.

```typescript
interface VerifyCitationRequest {
  attachmentId?: string;
  sha256?: string;
  citations: { [key: string]: Citation };
  outputImageFormat?: "jpeg" | "png" | "avif" | "webp";
  apiKey?: string;
  endUserId?: string;
}
```

---

## Verification (SDK)

The SDK normalizes backend responses into this shape. Access the status directly as `verification.status`, not via a nested `searchState` object.

```typescript
interface Verification {
  // Identity
  attachmentId?: string | null;
  label?: string;
  citation?: Citation;

  // Search results
  status?: SearchStatus;
  searchAttempts?: SearchAttempt[];
  highlightColor?: string;

  // Verified text
  verifiedSourceContext?: string;
  verifiedSourceMatch?: string;
  sourceSnippet?: string;
  verifiedTimestamps?: { startTime?: string; endTime?: string };
  verifiedAt?: string;

  // Type-specific results
  document?: DocumentVerificationResult;
  url?: UrlVerificationResult;

  // Evidence image (keyhole crop)
  evidence?: EvidenceImage;

  // Timing
  timeToCertaintyMs?: number;

  // Ambiguity detection
  ambiguity?: {
    totalOccurrences: number;
    occurrencesOnExpectedPage: number;
    confidence: "high" | "medium" | "low";
    note: string;
  };
}

type SearchStatus =
  | "loading"
  | "pending"
  | "not_found"
  | "partial_text_found"
  | "found"
  | "found_source_match_only"
  | "found_context_missed_source_match"
  | "found_on_other_page"
  | "found_on_other_line"
  | "first_word_found"
  | "timestamp_wip"
  | "skipped";

type SearchMethod =
  | "exact_line_match"
  | "line_with_buffer"
  | "expanded_line_buffer"
  | "current_page"
  | "source_match_fallback"
  | "adjacent_pages"
  | "expanded_window"
  | "regex_search"
  | "first_word_fallback"
  | "first_half_fallback"
  | "last_half_fallback"
  | "first_quarter_fallback"
  | "second_quarter_fallback"
  | "third_quarter_fallback"
  | "fourth_quarter_fallback"
  | "longest_word_fallback"
  | "custom_phrase_fallback"
  | "keyspan_fallback";

interface SearchAttempt {
  method: SearchMethod;
  success: boolean;
  searchPhrase: string;
  searchPhraseType?: "source_context" | "source_match";
  regexPattern?: string;
  pageSearched?: number;
  lineSearched?: number | number[];
  searchScope?: "line" | "page" | "document";
  expectedLocation?: { page: number; line?: number };
  foundLocation?: { page: number; line?: number };
  matchedVariation?: MatchedVariation;
  matchedText?: string;
  deepTextItems?: DeepTextItem[];
  note?: string;
  durationMs?: number;
  variationType?: "exact" | "normalized" | "currency" | "date" | "numeric" | "symbol" | "accent";
  occurrencesFound?: number;
  matchedExpectedOccurrence?: boolean;
}

type MatchedVariation =
  | "exact_source_context"
  | "normalized_source_context"
  | "exact_source_match"
  | "normalized_source_match"
  | "partial_source_context"
  | "partial_source_match"
  | "first_word_only";
```

---

## Evidence + Page Images (DX Model)

Artifacts are split by purpose so evidence (crop), page images, and source downloads are not conflated.

```typescript
interface EvidenceImage {
  src: string;
  dimensions?: { width: number; height: number };
  textItems?: DeepTextItem[];
}

interface PageImage {
  pageNumber: number;
  dimensions: { width: number; height: number };
  imageUrl: string;
  thumbnailUrl?: string;
  expiresAt?: string;
  isMatchPage?: boolean;
  highlightBox?: ScreenBox;
  renderScale?: { x: number; y: number };
  textItems?: DeepTextItem[];
}
```

---

## Source Downloads

Attachment-level assets (page images, downloads) are grouped in `AttachmentAssets`:

```typescript
interface DownloadLink {
  url: string;
  expiresAt?: string | "never";
}

interface FileDownload {
  filename?: string;
  mimeType?: string;
  link: DownloadLink;
}

interface AttachmentAssets {
  pageImages?: PageImage[];
  pageImagesStatus?: PageImagesStatus;
  originalDownload?: FileDownload; // file as received (PDF, DOCX, MP4, …)
  convertedDownload?: FileDownload;// PDF rendition / transcript / URL PDF capture
}

interface PreparedAttachment extends AttachmentAssets {
  attachmentId: string;
  deepTextPages?: string[];
  urlSource?: UrlSource;           // present for URL inputs only
}
```

| Input type | `urlSource` | `originalDownload` | `convertedDownload` |
|---|---|---|---|
| Document (PDF) | absent | ✓ (PDF) | absent |
| Document (DOCX) | absent | ✓ (DOCX) | ✓ (PDF rendition) |
| URL | ✓ | absent | ✓ (PDF capture) |
| Audio/Video | absent | ✓ (MP4/MP3) | ✓ (transcript) |

---

## Verify Response

`verifyAttachment()` / `verify()` responses contain verification results.
Attachment-level assets are in a separate `attachments` map keyed by `attachmentId`, avoiding per-citation duplication.

```typescript
interface VerifyCitationResponse {
  verifications: { [citationKey: string]: Verification };
  attachments?: { [attachmentId: string]: AttachmentAssets };
}
```

---

## Converted PDF Download Policy (Client)

Controls when converted verification PDF download links are exposed.

```typescript
type ConvertedPdfDownloadPolicy = "url_only" | "always" | "never";
```

Default behavior:

- `"url_only"` (default): converted PDF download links are returned for URL-based conversions, not Office conversions
- `"always"`: converted PDF download links are returned for URL and Office conversions
- `"never"`: converted PDF download links are never returned

Set globally:

```typescript
new DeepCitation({
  apiKey: "...",
  convertedPdfDownloadPolicy: "url_only",
});
```

Override per request on:

- `uploadFile(options)`
- `prepareUrl(options)`
- `convertToPdf(input)`
- `prepareConvertedFile(options)`
- `prepareAttachments([{ ... }])`

