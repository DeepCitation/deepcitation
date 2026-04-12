---
layout: default
title: Types
parent: API Reference
nav_order: 1
description: "TypeScript interface definitions for DeepCitation"
commit_sha: "31553cd"
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
  /** True when the citation was skipped (e.g. missing attachmentId). Only `status` is set on skipped entries. */
  skipped?: boolean;

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

  // Location precision
  /** True when the citation text was found but the input citation lacked precise location data (no page number or line IDs). */
  isImpreciseLocation?: boolean;

  // Ambiguity detection
  ambiguity?: {
    totalOccurrences: number;
    occurrencesOnExpectedPage: number;
    confidence: "high" | "medium" | "low";
    note: string;
  };

  // LLM search history
  /** History of LLM-level search attempts when iterative verification was used. */
  llmAttempts?: LlmSearchAttempt[];
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

---

## Client Configuration

### `DeepCitationConfig`

Full shape of the constructor options object.

```typescript
interface DeepCitationConfig {
  apiKey: string;                          // Required. Must start with sk-dc-.
  apiUrl?: string;                         // Override API base URL. Must use HTTPS.
  maxRetries?: number;                     // Default: 3. Network retries only (not HTTP errors).
  maxUploadConcurrency?: number;           // Max concurrent file uploads. Default: 5.
  requestSource?: string;                  // Sent as X-Request-Source header.
  endUserId?: string;                      // Instance-level end-user ID for usage attribution.
  endFileId?: string;                      // Instance-level file ID for billing attribution.
  convertedPdfDownloadPolicy?: ConvertedPdfDownloadPolicy;  // Default: "url_only".
  logger?: DeepCitationLogger;             // Custom log sink. See below.
  onLatestVersion?: (latestVersion: string) => void;        // SDK version notification.
  onUsageUpdate?: (remaining: number, limit: number) => void; // Spend budget warnings.
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; // Custom fetch.
}
```

### `DeepCitationLogger`

Logger interface for client observability. All methods are optional.

```typescript
interface DeepCitationLogger {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}
```

Pass `console` to log to stdout, or implement a custom sink for structured logging:

```typescript
const dc = new DeepCitation({
  apiKey: "...",
  logger: {
    info: (msg, meta) => myLogger.info(msg, meta),
    error: (msg, meta) => myLogger.error(msg, meta),
  },
});
```

---

## Prompt Wrapping

### `WrapCitationPromptOptions`

Input to `wrapCitationPrompt()`.

```typescript
interface WrapCitationPromptOptions {
  systemPrompt: string;
  userPrompt: string;
  deepTextPages?: string | string[];                    // Pages for a single attachment.
  deepTextPagesByAttachmentId?: Record<string, string[]>; // Pages keyed by attachmentId.
  isAudioVideo?: boolean;                              // Use AV timestamp format. Default: false.
}
```

### `WrapCitationPromptResult`

Return type of `wrapCitationPrompt()`.

```typescript
interface WrapCitationPromptResult {
  enhancedSystemPrompt: string;  // System prompt with citation instructions prepended and reminder appended.
  enhancedUserPrompt: string;    // User prompt with deepTextPages rendered and reminder prepended (when provided).
}
```

### `WrapSystemPromptOptions`

Input to `wrapSystemCitationPrompt()`.

```typescript
interface WrapSystemPromptOptions {
  systemPrompt: string;
  isAudioVideo?: boolean;  // Use AV timestamp format. Default: false.
}
```

---

## Citation Parsing

### `ParsedCitationResult`

Return type of `parseCitationResponse()`.

```typescript
interface ParsedCitationResult {
  visibleText: string;                    // Text for display — <<<CITATION_DATA>>> block stripped; [N] markers remain.
  citations: CitationRecord;              // Citations keyed by citationKey (16-char hash).
  markerMap: Record<number, string>;      // Maps [N] number → citationKey.
  format: "numeric" | "none";            // Detected citation format.
  splitPattern: RegExp;                   // RegExp for splitting visibleText on [N] markers.
}
```

### `VerifyBatchOptions`

Options for `verifyBatch()`. Alias for `VerifyCitationsOptions`.

```typescript
interface VerifyBatchOptions {
  outputImageFormat?: "avif" | "jpeg" | "png";  // Proof image format. Default: "avif".
  endUserId?: string;                            // End-user identifier for usage attribution.
}
```

---

## Rendering

### `PrepareCitationsOptions`

Options for `prepareCitations()`.

```typescript
interface PrepareCitationsOptions {
  verifications?: VerificationRecord;      // Verification results keyed by citationKey.
  sourceLabels?: Record<string, string>;   // Display labels keyed by attachmentId ("" for URL citations).
}
```

### `CitationIR`

Normalized intermediate representation consumed by rendering adapters. Produce this once with `prepareCitations()`, then pass it to any number of adapters.

```typescript
interface CitationIR {
  readonly segments: ReadonlyArray<TextSegment | CitationSegment>;  // Text and citation segments interleaved.
  readonly citations: ReadonlyArray<ResolvedCitation>;              // All citations with status and resolved labels.
}
```

### `ResolvedCitation`

A citation with verification status and a pre-resolved `sourceLabel`.

```typescript
interface ResolvedCitation extends CitationWithStatus {
  sourceLabel: string;  // Pre-resolved display label from the attachmentId → sourceLabels fallback chain.
}
```

### `CitationAdapter`

A pure function from `CitationIR` + options to any output format. Implement this to render citations in email, PDF, Notion, or any other target.

```typescript
type CitationAdapter<TOptions, TOutput> = (ir: CitationIR, options?: TOptions) => TOutput;
```

---

## Display Types

### `CitationWithStatus`

A citation bundled with its resolved verification status and display text. Used as the base for `ResolvedCitation`.

```typescript
interface CitationWithStatus {
  citation: Citation;
  citationKey: string;
  verification: Verification | null;
  status: CitationStatus;     // { isVerified, isPartialMatch, isMiss, isPending }
  displayText: string;
  citationNumber: number;
}
```

### `IndicatorSet`

Four-character set mapping verification states to display symbols.

```typescript
interface IndicatorSet {
  verified: string;
  partial: string;
  notFound: string;
  pending: string;
}
```

### `IndicatorStyle`

Controls which predefined `IndicatorSet` from `INDICATOR_SETS` is used.

```typescript
type IndicatorStyle =
  | "check"      // ✓ ⚠ ✗ ◌  (default)
  | "semantic"   // ✓ ~ ✗ …
  | "circle"     // ● ◐ ○ ◌
  | "square"     // ■ ▪ □ ▫
  | "letter"     // V P X ?
  | "word"       // ✓verified ⚠partial ✗missed ◌pending
  | "none";      // No indicator
```

### `LinePosition`

Humanized position of a citation within a page. Returned by `humanizeLinePosition()`.

```typescript
type LinePosition = "start" | "early" | "middle" | "late" | "end";
```

---

## Verification Sub-types

### `ContentMatchStatus`

Result of comparing web page content against a cited claim.

```typescript
type ContentMatchStatus =
  | "exact"
  | "partial"
  | "mismatch"
  | "not_found"
  | "not_checked"
  | "inconclusive";
```

### `UrlAccessStatus`

HTTP access outcome when fetching a URL citation for verification.

```typescript
type UrlAccessStatus =
  | "accessible"
  | "redirected"
  | "redirected_same_domain"
  | "not_found"
  | "forbidden"
  | "server_error"
  | "timeout"
  | "blocked"
  | "network_error"
  | "pending"
  | "unknown";
```

### `PageImagesStatus`

Status of page image generation for an attachment.

```typescript
type PageImagesStatus = "pending" | "generating" | "completed" | "failed";
```

---

## Performance Timing

### `TimingMetrics`

Aggregate Time-to-Certainty (TtC) metrics across a set of citations. Computed client-side from individual `Verification.timeToCertaintyMs` values.

```typescript
interface TimingMetrics {
  avgTtcMs: number;              // Average TtC across resolved citations.
  minTtcMs: number;              // Fastest verification.
  maxTtcMs: number;              // Slowest verification.
  medianTtcMs: number;           // Median TtC.
  resolvedCount: number;         // Citations that have reached terminal state.
  totalCount: number;            // Total citations including pending.
  totalSearchDurationMs: number; // Sum of all search attempt durations from the API.
}
```

### `CitationTimingEvent`

A single telemetry event in the citation review lifecycle. Receive these via the `onTimingEvent` callback.

```typescript
interface CitationTimingEvent {
  event: "citation_seen" | "evidence_ready" | "popover_opened" | "popover_closed" | "citation_reviewed";
  citationKey: string;
  timestamp: number;               // Wall-clock ms epoch.
  elapsedSinceSeenMs: number | null;
  verificationStatus?: SearchStatus | null;
  popoverDurationMs?: number;      // For popover_closed: how long the popover was open.
  timeToCertaintyMs?: number;      // For evidence_ready: system TtC.
  userTtcMs?: number;              // For citation_reviewed: full user TtC.
}
```

---

## Primitive Geometry

### `ScreenBox`

A rectangular region with position and dimensions. Used for bounding boxes, highlights, and selection regions in document space.

```typescript
interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### `DeepTextItem`

A positioned text fragment with a bounding box. Used for OCR text items, phrase matches, and annotation overlays.

```typescript
interface DeepTextItem extends ScreenBox {
  text?: string;
}
```

---

## Compression

### `CompressedResult<T>`

Return type of `compressPromptIds()`. Pass `prefixMap` to `decompressPromptIds()` to restore full IDs.

```typescript
interface CompressedResult<T> {
  compressed: T;
  prefixMap: Record<string, string>;  // Maps minimal prefix → full ID.
}
```

---

## Type Guards

The following type guard functions narrow the `Citation` union to a specific subtype. Import from `deepcitation`.

```typescript
import { isDocumentCitation, isUrlCitation, isAudioVideoCitation } from "deepcitation";

function describeCitation(c: Citation): string {
  if (isDocumentCitation(c)) {
    // c is DocumentCitation — has attachmentId, pageNumber, lineIds
    return `Page ${c.pageNumber ?? "?"} of ${c.attachmentId}`;
  }

  if (isUrlCitation(c)) {
    // c is UrlCitation — has url, domain, title, faviconUrl, etc.
    return c.url ?? "Unknown URL";
  }

  if (isAudioVideoCitation(c)) {
    // c is AudioVideoCitation — has timestamps.startTime / endTime
    const { startTime, endTime } = c.timestamps ?? {};
    return `${startTime ?? "?"} → ${endTime ?? "?"}`;
  }

  return "Unknown citation type";
}
```

| Guard | Narrows to | Check |
|:------|:-----------|:------|
| `isDocumentCitation(c)` | `DocumentCitation` | `c.type === "document"` |
| `isUrlCitation(c)` | `UrlCitation` | `c.type === "url"` |
| `isAudioVideoCitation(c)` | `AudioVideoCitation` | `c.type === "audio" \| "video"` |

