# API Migration Plan: Verification Artifacts and Download Policy

## Status

Draft for server/API implementation.

## Scope

This plan is for backend/API teams implementing the breaking response-shape migration.

This plan assumes no backward compatibility.

---

## Goal

Make proof artifacts, rendered pages, and downloadable source files explicit and non-overlapping:

- Proof page URL (interactive) is separate from proof image URL.
- Evidence snippet/image is separate from page renders.
- Downloadable files are grouped under `documentFiles` with explicit origin metadata.

---

## Change History (What Was Done and Why)

This migration came from repeated developer confusion between:

- proof links (`proofUrl`-style fields),
- proof/evidence images,
- page render images,
- and source-file download actions.

The implementation was intentionally reworked to make each intent explicit.

1. Introduced `verification.assets` as the canonical artifact container.
   - Why: proof/page/image artifacts were previously scattered across unrelated fields, which caused UI and API ambiguity.
2. Split proof artifacts into `assets.proofPage` and `assets.proofImage`.
   - Why: an interactive proof page URL and an image URL are different products and should not share naming.
3. Split evidence artifacts into `assets.evidenceSnippet`, `assets.webCapture`, and `assets.pageRenders`.
   - Why: cropped snippet, URL screenshot, and full page render are different evidence shapes with different rendering behavior.
4. Replaced ambiguous top-level `downloadUrl` with `documentFiles`.
   - Why: download targets are now explicit objects, not a single overloaded URL.
5. Added `documentFiles.originalFile` and `documentFiles.verificationPdf` with `verificationPdf.origin`.
   - Why: server and UI must clearly distinguish user-uploaded source files from converted verification PDFs.
6. Renamed page payload keys to match intent:
   - `pages` -> `pageRenders`
   - `pagesGenerationStatus` -> `pageRendersStatus`
   - `SourcePage.source` -> `SourcePage.imageUrl`
   - `SourcePage.thumbnail` -> `SourcePage.thumbnailUrl`
   - Why: "pages" and "source" were too generic and were repeatedly misread by integrators.
7. Added `convertedPdfDownloadPolicy` with default `"url_only"`.
   - Why: desired product behavior is "URL conversions can expose converted PDF by default; Office conversions should not by default."
8. Added override support for `convertedPdfDownloadPolicy` on prepare/convert request flows.
   - Why: server teams and app teams need per-request control without changing global config.
9. Dropped backward compatibility for legacy artifact/download fields.
   - Why: dual-shape support kept recreating ambiguity and made integration logic brittle.

Server implementation should treat this section as normative migration intent, not only field renames.

---

## Breaking Changes Summary

1. Move proof/page/image artifacts into `verification.assets`.
2. Replace `downloadUrl` with `documentFiles`.
3. Rename page arrays/status:
   - `pages` -> `pageRenders`
   - `pagesGenerationStatus` -> `pageRendersStatus`
4. Rename page render fields:
   - `source` -> `imageUrl`
   - `thumbnail` -> `thumbnailUrl`
5. Add `convertedPdfDownloadPolicy` handling on server request inputs.
6. Expand `SearchStatus` and `SearchMethod` enums (see Search Types Migration section).
7. Add `endFileId` billing attribution field to file-related endpoints.
8. Make `Citation.type` required discriminator (`"document" | "url"`).
9. Move document-specific fields (`attachmentId`, `pageNumber`, `lineIds`, `startPageId`, `selection`) from `CitationBase` to `DocumentCitation`.
10. Standardize null convention: `?: T` (optional, no null) across all interfaces.
11. Standardize timestamps to `string` (ISO 8601) — no `Date` objects in wire format.

---

## Old -> New Field Mapping

| Old field | New field |
|:--|:--|
| `verification.proof.proofId` | `verification.assets.proofPage.id` |
| `verification.proof.proofUrl` | `verification.assets.proofPage.url` |
| `verification.proof.proofImageUrl` | `verification.assets.proofImage.url` |
| `verification.pages` | `verification.assets.pageRenders` |
| `verification.document.verificationImageSrc` | `verification.assets.evidenceSnippet.src` |
| `verification.document.verificationImageDimensions` | `verification.assets.evidenceSnippet.dimensions` |
| `verification.url.webPageScreenshotBase64` | `verification.assets.webCapture.src` |
| top-level `downloadUrl` | top-level `documentFiles` |
| `pages` | `pageRenders` |
| `pagesGenerationStatus` | `pageRendersStatus` |
| `SourcePage.source` | `SourcePage.imageUrl` |
| `SourcePage.thumbnail` | `SourcePage.thumbnailUrl` |

---

## Named Types

The SDK defines these named types in `src/types/verification.ts`. Server serializers should match.

### `ImageFormat`

Shared image format union used across proof config, proof assets, and output format:

```ts
type ImageFormat = "jpeg" | "png" | "avif" | "webp";
```

One type for all image format fields: proof config, proof assets, and output screenshots.

### `ExpiresAt`

Expiration timestamp type. The `& {}` preserves IDE autocomplete for the `"never"` literal:

```ts
type ExpiresAt = (string & {}) | "never"; // ISO 8601 or "never"
```

Used in: `DownloadLink.expiresAt`, `UploadFileResponse.expiresAt`, `AttachmentResponse.expiresAt`, `ExtendExpirationResponse`.

### `ProofConfig`

Proof URL configuration passed in verifyCitations requests:

```ts
interface ProofConfig {
  access?: "signed" | "workspace" | "public";
  signedUrlExpiry?: "1h" | "24h" | "7d" | "30d" | "90d" | "1y";
  imageFormat?: ImageFormat;
  includeBase64?: boolean;
}
```

### `ProofOptions`

Shared base for proof generation settings (used by `VerifyCitationRequest` and `VerifyCitationsOptions`):

```ts
interface ProofOptions {
  generateProofUrls?: boolean;
  proofConfig?: ProofConfig;
}
```

### `PdfOrigin`

Origin discriminator for verification PDFs:

```ts
type PdfOrigin = "upload_pdf" | "converted_from_office" | "converted_from_url";
```

### `PageRendersStatus`

Status of page image generation. The full 4-value enum applies to all endpoints:

```ts
type PageRendersStatus = "pending" | "generating" | "completed" | "failed";
```

**Per-endpoint notes:**
- `POST /prepareAttachments` (UploadFileResponse): Typically emits `"pending"` or `"completed"`. May emit `"generating"` or `"failed"` in future.
- `POST /getAttachment` (AttachmentResponse): Uses all 4 values (`"pending"`, `"generating"`, `"completed"`, `"failed"`).

Server should use the full enum on all endpoints for forward compatibility. Clients accept all 4 values everywhere.

---

## New Artifact Contract

Each verification now carries artifacts under:

```ts
verification.assets = {
  documentFiles?: {
    originalFile?: {
      origin: "upload";
      filename?: string;
      mimeType: string;
      download?: { url: string; expiresAt?: string | "never" };
    };
    verificationPdf?: {
      origin: PdfOrigin; // "upload_pdf" | "converted_from_office" | "converted_from_url"
      sourceUrl?: string; // required for URL conversions
      filename?: string;
      mimeType: string;
      download?: { url: string; expiresAt?: string | "never" };
    };
  };
  proofPage?: { id?: string; url: string };       // url is REQUIRED when proofPage is present
  proofImage?: { url: string; format?: ImageFormat; width?: number; height?: number }; // url is REQUIRED
  evidenceSnippet?: { src?: string; dimensions?: { width: number; height: number } };
  webCapture?: { src?: string; capturedAt?: string }; // capturedAt is ISO 8601
  pageRenders?: Array<{
    pageNumber: number;
    dimensions: { width: number; height: number };
    imageUrl: string;
    thumbnailUrl?: string;
    isMatchPage?: boolean;
    highlightBox?: { x: number; y: number; width: number; height: number };
    renderScale?: { x: number; y: number };
    textItems?: Array<{ x: number; y: number; width: number; height: number; text?: string }>;
  }>;
};
```

**Wire format note:** All timestamps (`capturedAt`, `crawledAt`, `verifiedAt`, `publishedAt`, `accessedAt`) are ISO 8601 strings. No `Date` objects — JSON serialization is string-only. The `| null` convention has been removed; omit fields rather than sending `null`.

---

## Verification Sub-Objects

In addition to `verification.assets` (artifacts), each verification has type-specific **result** sub-objects. These contain verification *outcomes*, not downloadable artifacts.

> **Note:** The full `Verification` interface also contains existing fields that are **not changing** in this migration and are therefore not exhaustively documented here. These include: `attachmentId`, `label`, `citation`, `status`, `searchAttempts`, `highlightColor`, `verifiedTimestamps`, `verifiedFullPhrase`, `verifiedAnchorText`, `verifiedMatchSnippet`, `verifiedAt`, `timeToCertaintyMs`, and `ambiguity`. See `src/types/verification.ts` for the complete interface. This plan only documents new/restructured fields.

### `verification.document` — `DocumentVerificationResult`

Page-level match metadata for document/PDF citations:

```ts
interface DocumentVerificationResult {
  verifiedPageNumber?: number;
  verifiedLineIds?: number[];
  mimeType?: string;              // e.g. "application/pdf", "image/jpeg"
  totalLinesOnPage?: number;
  hitIndexWithinPage?: number;
  phraseMatchDeepItem?: DeepTextItem;
  anchorTextMatchDeepItems?: DeepTextItem[];
}
```

### `verification.url` — `UrlVerificationResult`

Web crawl and content matching metadata for URL citations:

```ts
interface UrlVerificationResult {
  verifiedUrl?: string;
  resolvedUrl?: string;
  httpStatus?: number;
  urlAccessStatus?: UrlAccessStatus;
  contentMatchStatus?: ContentMatchStatus;
  contentSimilarity?: number;
  verifiedTitle?: string;
  actualContentSnippet?: string;
  crawledAt?: string;               // ISO 8601
  urlVerificationError?: string;
  verifiedDomain?: string;
  verifiedDescription?: string;
  verifiedFaviconUrl?: string;
  verifiedSiteName?: string;
  verifiedAuthor?: string;
  verifiedPublishedAt?: string;     // ISO 8601
  verifiedImageUrl?: string;
  contentType?: string;
}
```

**Null convention:** All optional fields use `?: T` (omit when absent). Do NOT send `null` — omit the field entirely. This eliminates triple-optionality (`undefined | T | null`) and simplifies client checks to `if (field)` or `field ?? fallback`.

### Supporting enums

```ts
type UrlAccessStatus =
  | "accessible" | "redirected" | "redirected_same_domain"
  | "not_found" | "forbidden" | "server_error" | "timeout"
  | "blocked" | "network_error" | "pending" | "unknown";

type ContentMatchStatus =
  | "exact" | "partial" | "mismatch"
  | "not_found" | "not_checked" | "inconclusive";
```

---

## Search Types Migration

The search system was substantially reworked. Server must match the expanded enums.

### `SearchStatus` — old vs new

| Old values | New values (SDK) |
|:--|:--|
| `"pending"` | `"pending"` |
| `"not_found"` | `"not_found"` |
| `"partial_text_found"` | `"partial_text_found"` |
| `"found"` | `"found"` |
| `"found_anchor_text_only"` | `"found_anchor_text_only"` |
| `"found_on_other_page"` | `"found_on_other_page"` |
| `"found_on_other_line"` | `"found_on_other_line"` |
| `"first_word_found"` | `"first_word_found"` |
| *(new)* | `"loading"` |
| *(new)* | `"timestamp_wip"` |
| *(new)* | `"skipped"` |
| *(new)* | `"found_phrase_missed_anchor_text"` |

Full type:
```ts
type SearchStatus =
  | "loading" | "pending" | "not_found" | "partial_text_found"
  | "found" | "found_anchor_text_only" | "found_phrase_missed_anchor_text"
  | "found_on_other_page" | "found_on_other_line" | "first_word_found"
  | "timestamp_wip" | "skipped";
```

### `SearchMethod` — complete rewrite

The old 4 generic values were replaced with 16 granular method identifiers:

```ts
type SearchMethod =
  | "exact_line_match" | "line_with_buffer" | "expanded_line_buffer"
  | "current_page" | "anchor_text_fallback" | "adjacent_pages"
  | "expanded_window" | "regex_search" | "first_word_fallback"
  | "first_half_fallback" | "last_half_fallback"
  | "first_quarter_fallback" | "second_quarter_fallback"
  | "third_quarter_fallback" | "fourth_quarter_fallback"
  | "longest_word_fallback" | "custom_phrase_fallback" | "keyspan_fallback";
```

### `SearchAttempt` — reworked interface

```ts
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
  matchedVariation?: MatchedVariation;
  matchedText?: string;
  deepTextItems?: DeepTextItem[];
  note?: string;
  durationMs?: number;
  variationType?: VariationType;
  occurrencesFound?: number;
  matchedExpectedOccurrence?: boolean;
}

type MatchedVariation =
  | "exact_full_phrase" | "normalized_full_phrase"
  | "exact_anchor_text" | "normalized_anchor_text"
  | "partial_full_phrase" | "partial_anchor_text"
  | "first_word_only";

type VariationType =
  | "exact" | "normalized" | "currency" | "date"
  | "numeric" | "symbol" | "accent";
```

---

## Citation Type Changes

The `Citation` discriminated union is now strict. Server must always include `type` when constructing citations.

### `CitationBase` (shared fields)

```ts
interface CitationBase {
  fullPhrase?: string;
  anchorText?: string;
  citationNumber?: number;
  reasoning?: string;
  timestamps?: { startTime?: string; endTime?: string };
}
```

### `DocumentCitation` (document/PDF citations)

```ts
interface DocumentCitation extends CitationBase {
  type: "document";          // REQUIRED — was optional, now mandatory
  attachmentId?: string;     // moved from CitationBase
  pageNumber?: number;       // moved from CitationBase
  lineIds?: number[];        // moved from CitationBase
  startPageId?: string;      // moved from CitationBase
  selection?: ScreenBox;     // moved from CitationBase
}
```

### `UrlCitation` (web URL citations)

```ts
interface UrlCitation extends CitationBase {
  type: "url";               // REQUIRED
  url?: string;
  title?: string;
  domain?: string;
  faviconUrl?: string;
  publishedAt?: string;      // ISO 8601 (was Date | string)
  accessedAt?: string;       // ISO 8601 (was Date | string)
}
```

### `Citation = DocumentCitation | UrlCitation`

**Key breaking change:** `type` is now required. Server must always set `type: "document"` or `type: "url"` when constructing citations. Document-specific fields (`attachmentId`, `pageNumber`, `lineIds`) are only present on `DocumentCitation` — accessing them on a plain `Citation` requires type narrowing.

---

## Download Policy Rules (Server)

Server must accept `convertedPdfDownloadPolicy` on:

- `POST /prepareAttachments` (multipart + JSON variants)
- `POST /convertFile` (multipart + JSON variants)

Allowed values:

- `"url_only"` (default)
- `"always"`
- `"never"`

Policy behavior:

1. URL conversions:
   - Default (`url_only`) should include `documentFiles.verificationPdf.download`.
2. Office conversions (`.docx/.xlsx/.pptx/...`):
   - Default (`url_only`) should not include converted PDF download URL.
   - Include only when policy is `"always"`.
3. Policy `"never"`:
   - Do not expose converted PDF download URL for any conversion path.
4. `originalFile.download` is independent:
   - If an original upload exists and is downloadable, include it regardless of converted PDF policy.

---

## `documentFiles` Aggregation Semantics

Top-level `documentFiles` appears on both per-attachment responses (`UploadFileResponse`, `AttachmentResponse`) and on `VerifyCitationsResponse`.

**Per-attachment responses:** `documentFiles` is the canonical copy for that single attachment. Unambiguous.

**`verifyCitations` response (multi-attachment):** When the SDK's `verify()` method verifies citations across multiple attachments in parallel, it takes the **last** result's `documentFiles`. This means top-level `documentFiles` in the response is **per-attachment** — it represents a single attachment's files, not an aggregation of all attachments.

**Server requirement:** The `verifyCitations` endpoint operates on a single `attachmentId` per request. The SDK handles multi-attachment by making parallel per-attachment calls. Therefore, `documentFiles` on the verifyCitations response is always for the single requested attachment. No multi-attachment aggregation is needed server-side.

---

## Billing Attribution: `endFileId`

`endFileId` is a developer-supplied file identifier for billing attribution, mirroring `endUserId`. It travels alongside the system `attachmentId` and is stored for usage metering dashboards.

**Constraints:** Same as `endUserId` — max 128 characters, no control characters.

**Resolution:** Per-request override wins over instance-level default (set in `DeepCitationConfig`).

Server must accept `endFileId?: string` on:

- `POST /prepareAttachments` (multipart: form field; JSON: body field)
- `POST /convertFile` (multipart: form field; JSON: body field)

Server should store `endFileId` alongside `endUserId` and `attachmentId` in the usage record.

---

## Endpoint Migration Requirements

### `POST /prepareAttachments`

Request:

- Accept `convertedPdfDownloadPolicy?: "url_only" | "always" | "never"`.
- Accept `endUserId?: string` (billing attribution — user).
- Accept `endFileId?: string` (billing attribution — file).

Response:

- Return `documentFiles?`.
- Return `pageRenders?` and `pageRendersStatus?: PageRendersStatus`.
- Do not return `downloadUrl`, `pages`, or `pagesGenerationStatus`.

### `POST /verifyCitations`

Request:

The server must accept the following request body (wrapped in `data`):

```ts
{
  data: {
    attachmentId: string;
    citations: Record<string, Citation>;
    outputImageFormat?: ImageFormat;
    endUserId?: string;
    generateProofUrls?: boolean;
    proofConfig?: ProofConfig;  // Only used when generateProofUrls is true
  }
}
```

`ProofConfig` fields:
- `access?: "signed" | "workspace" | "public"` — access control for proof URLs
- `signedUrlExpiry?: "1h" | "24h" | "7d" | "30d" | "90d" | "1y"` — only used when access is `"signed"`
- `imageFormat?: "png" | "jpeg" | "avif" | "webp"` — image format for proof images
- `includeBase64?: boolean` — whether to also return base64 images inline

Response:

- Return `verifications: Record<string, Verification>`.
- For each verification, populate:
  - `verification.document` and/or `verification.url` (result sub-objects)
  - `verification.assets` (artifact sub-object)
- If `generateProofUrls=true`, populate:
  - `verification.assets.proofPage`
  - `verification.assets.proofImage`
- Optional top-level `documentFiles` (for the single requested attachment).

### `POST /getAttachment`

Response:

- Return `pageRenders` + `pageRendersStatus: PageRendersStatus` (not legacy names).
- Return `verifications[*].assets`.
- Return `documentFiles?` at attachment level.

### `POST /convertFile`

Request:

- Accept `convertedPdfDownloadPolicy` for both JSON (URL) and multipart (file upload) inputs.
- Accept `endUserId?: string` (billing attribution — user).
- Accept `endFileId?: string` (billing attribution — file).

Response:

- Existing conversion response can remain, but downstream `prepareAttachments/getAttachment/verifyCitations` must reflect policy in `documentFiles`.

---

## Minimal Example: New `verifyCitations` Response

```json
{
  "verifications": {
    "c1": {
      "status": "found",
      "document": {
        "verifiedPageNumber": 3,
        "verifiedLineIds": [41, 42],
        "mimeType": "application/pdf",
        "totalLinesOnPage": 85,
        "hitIndexWithinPage": 0
      },
      "url": null,
      "assets": {
        "proofPage": { "id": "p_abc", "url": "https://proof.deepcitation.com/p/p_abc" },
        "proofImage": { "url": "https://proof.deepcitation.com/p/p_abc?format=avif&view=snippet", "format": "avif" },
        "evidenceSnippet": {
          "src": "data:image/avif;base64,...",
          "dimensions": { "width": 1140, "height": 360 }
        },
        "pageRenders": [
          {
            "pageNumber": 3,
            "dimensions": { "width": 1700, "height": 2200 },
            "imageUrl": "https://cdn.deepcitation.com/attachments/a1/pages/3.avif",
            "thumbnailUrl": "https://cdn.deepcitation.com/attachments/a1/pages/3-thumb.avif",
            "isMatchPage": true
          }
        ]
      },
      "searchAttempts": [
        {
          "method": "exact_line_match",
          "success": true,
          "searchPhrase": "Revenue grew 23% year-over-year",
          "searchPhraseType": "full_phrase",
          "pageSearched": 3,
          "matchedVariation": "exact_full_phrase",
          "durationMs": 12
        }
      ]
    }
  },
  "documentFiles": {
    "originalFile": {
      "origin": "upload",
      "filename": "report.docx",
      "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "download": { "url": "https://api.deepcitation.com/download/original/..." }
    },
    "verificationPdf": {
      "origin": "converted_from_office",
      "filename": "report.pdf",
      "mimeType": "application/pdf"
    }
  }
}
```

---

## Attachment-Level Asset Hoisting

**What changed (SDK v0.3.11+):** `pageImages`, `originalDownload`, and `convertedDownload` are removed from individual `Verification` objects. They now live in a top-level `attachments` map keyed by `attachmentId` on `VerifyCitationResponse`.

**Why:** These fields are per-attachment, not per-citation. A 100-page doc with 10 citations was duplicating the full `pageImages` array 10x in the response.

**New response shape:**
```json
{
  "verifications": {
    "c1": { "status": "found", "attachmentId": "att_abc", ... },
    "c2": { "status": "found", "attachmentId": "att_abc", ... }
  },
  "attachments": {
    "att_abc": {
      "pageImages": [...],
      "originalDownload": { "filename": "report.pdf", "mimeType": "application/pdf", "link": { "url": "..." } }
    }
  }
}
```

**SDK bridge:** The SDK's `normalizeVerifyResponse()` handles backward compatibility — if the server still sends assets per-verification, the SDK extracts them into the `attachments` map. Once the server migrates, this bridge becomes a no-op passthrough.

**Server migration:** When ready, move `pageImages`, `originalDownload`, `convertedDownload` from each verification object to a top-level `attachments: Record<string, AttachmentAssets>` map. The SDK already expects both formats.

---

## Rollout Checklist (Server Team)

1. Update response serializers to emit `verification.assets.*`.
2. Remove legacy artifact fields from API responses.
3. Rename page payload fields to `pageRenders` / `pageRendersStatus` and `imageUrl` / `thumbnailUrl`.
4. Add `documentFiles` builder with `originalFile` and `verificationPdf`.
5. Implement `convertedPdfDownloadPolicy` defaulting to `"url_only"` when omitted.
6. Ensure URL conversions set `verificationPdf.origin = "converted_from_url"` and `sourceUrl`.
7. Ensure Office conversions set `verificationPdf.origin = "converted_from_office"`.
8. Populate `verification.document` and `verification.url` sub-objects with full result shapes.
9. Use expanded `SearchStatus` (12 values) and `SearchMethod` (18 values) enums.
10. Serialize `SearchAttempt` with the reworked interface (see Search Types Migration).
11. Accept `endFileId` on prepareAttachments and convertFile endpoints.
12. Accept `proofConfig` on verifyCitations when `generateProofUrls=true`.
13. Use `PageRendersStatus` (4-value enum) on all endpoints that return `pageRendersStatus`.
14. Serialize all timestamps (`capturedAt`, `crawledAt`, `verifiedAt`, `publishedAt`, `accessedAt`) as ISO 8601 strings.
15. Never send `null` for optional fields — omit the field entirely.
16. Always set `type: "document"` or `type: "url"` on every Citation object.
17. Only include document-specific fields (`attachmentId`, `pageNumber`, `lineIds`, `startPageId`, `selection`) on `type: "document"` citations.
18. Always include `url` (required) on `proofPage` and `proofImage` when those objects are present.
19. Use `ExpiresAt` (`string | "never"`) for all expiration fields.
20. Add endpoint tests covering all three download policy values.
21. Verify SDK/React flows:
    - source download button behavior
    - proof image/page display
    - page drawer rendering from `assets.pageRenders`.
22. Hoist `pageImages`, `originalDownload`, `convertedDownload` from per-verification to top-level `attachments` map keyed by `attachmentId`.
