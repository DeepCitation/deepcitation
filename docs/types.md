---
layout: default
title: Types
parent: API Reference
nav_order: 1
description: "TypeScript interface definitions for DeepCitation"
commit_sha: "cc9c7aa"
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

DeepCitation supports two citation shapes.

```typescript
interface DocumentCitation {
  type?: "document";
  attachmentId?: string;
  pageNumber?: number | null;
  fullPhrase?: string | null;
  anchorText?: string | null;
  lineIds?: number[] | null;
}

interface UrlCitation {
  type: "url";
  url?: string;
  domain?: string;
  title?: string;
  fullPhrase?: string | null;
  anchorText?: string | null;
}

type Citation = DocumentCitation | UrlCitation;
```

---

## VerifyCitationRequest

Request body for `/verifyCitations`.

```typescript
interface VerifyCitationRequest {
  attachmentId: string;
  citations: { [key: string]: Citation };
  outputImageFormat?: "jpeg" | "png" | "avif";
  apiKey?: string;
}
```

---

## Verification (SDK)

The SDK normalizes backend responses into this shape.

```typescript
interface Verification {
  status?: SearchStatus | null;
  verifiedMatchSnippet?: string | null;
  searchAttempts?: SearchAttempt[];
  attachmentId?: string | null;
  citation?: Citation;

  evidence?: EvidenceImage;
  document?: DocumentVerificationResult;
  url?: UrlVerificationResult;
}

type SearchStatus =
  | "loading"
  | "pending"
  | "not_found"
  | "partial_text_found"
  | "found"
  | "found_anchor_text_only"
  | "found_phrase_missed_anchor_text"
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
  | "anchor_text_fallback"
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
  searchPhraseType?: "full_phrase" | "anchor_text";
  regexPattern?: string;
  pageSearched?: number;
  lineSearched?: number | number[];
  searchScope?: "line" | "page" | "document";
  expectedLocation?: { page: number; line?: number };
  foundLocation?: { page: number; line?: number };
  matchedVariation?:
    | "exact_full_phrase"
    | "normalized_full_phrase"
    | "exact_anchor_text"
    | "normalized_anchor_text"
    | "partial_full_phrase"
    | "partial_anchor_text"
    | "first_word_only";
  matchedText?: string;
  deepTextItems?: DeepTextItem[];
  matchScore?: number;
  matchSnippet?: string;
  note?: string;
  durationMs?: number;
  variationType?: "exact" | "normalized" | "currency" | "date" | "numeric" | "symbol" | "accent";
  occurrencesFound?: number;
  matchedExpectedOccurrence?: boolean;
}
```

---

## Evidence + Page Images (DX Model)

Artifacts are split by purpose so evidence (crop), page images, and source downloads are not conflated.

```typescript
interface EvidenceImage {
  src: string | null;
  dimensions?: { width: number; height: number } | null;
}

interface WebCaptureAsset {
  src?: string | null;
  capturedAt?: Date | string | null;
}

interface PageImage {
  pageNumber: number;
  dimensions: { width: number; height: number };
  imageUrl: string;
  thumbnailUrl?: string;
}
```

---

## Source Downloads

Source downloads are flat fields on each `PreparedAttachment`:

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

interface PreparedAttachment {
  attachmentId: string;
  urlSource?: UrlSource;           // present for URL inputs only
  originalDownload?: FileDownload; // file as received (PDF, DOCX, MP4, …)
  convertedDownload?: FileDownload;// PDF rendition / transcript / URL PDF capture
  pageImages?: PageImage[];
  pageImagesStatus?: PageImagesStatus;
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

`verifyAttachment()` / `verify()` responses contain only verification results.
File download artifacts are on the attachment, not the verification.

```typescript
interface VerifyCitationResponse {
  verifications: { [citationKey: string]: Verification };
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

---

## React Download Policy (`CitationComponent`)

`CitationComponent` separates source-file download behavior from proof/evidence image download behavior.

```typescript
type CitationDownloadPolicy = "original_only" | "original_plus_url_pdf" | "original_plus_all_pdf";
```

Relevant props:

```typescript
interface CitationComponentProps {
  originalDownload?: FileDownload;   // file as received
  convertedDownload?: FileDownload;  // PDF rendition / URL PDF capture
  downloadPolicy?: CitationDownloadPolicy; // default: "original_plus_url_pdf"
  onSourceDownload?: (citation: Citation) => void;
}
```

Default UI behavior:

- `original_plus_url_pdf`: show `originalDownload` when present; for URL inputs (no `originalDownload`), show `convertedDownload`
- `original_plus_all_pdf`: show `originalDownload` when present, else show `convertedDownload`
- `original_only`: show `originalDownload` only, never `convertedDownload`
