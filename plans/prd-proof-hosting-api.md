# PRD: Proof Hosting API

## Status: DRAFT
## Date: 2025-02-09
## Depends on: [Universal Proof Renderers Plan](./plan-universal-renderers.md)

---

## 1. Problem Statement

Today, DeepCitation returns citation proof as **base64-encoded images embedded in the `Verification` object**. This works for React (render inline in a popover) but fails for every other surface:

- **Slack**: Cannot embed images in mrkdwn; needs a URL for link unfurls
- **GitHub**: Cannot embed base64 images in Markdown; needs hosted `https://` image URLs
- **Email/HTML**: Base64 images bloat payload and are blocked by some email clients
- **Terminal**: No image capability at all; needs a URL users can open in a browser
- **Any shared context**: Base64 strings are not shareable, bookmarkable, or auditable

**The core gap:** There is no hosted, URL-addressable proof artifact. Every non-React surface needs one.

---

## 2. Solution Overview

The backend will provide:

1. **Proof IDs** — Stable identifiers returned with verification results, one per citation
2. **Proof page** — A hosted HTML page at `/p/{proof_id}` showing the highlighted snippet, claim text, and status
3. **Proof image endpoint** — Direct image access at `/p/{proof_id}?format=png` for embedding
4. **OG metadata** — Open Graph tags on the proof page for Slack unfurls and social previews
5. **Access control** — Token-based signed URLs with configurable expiry

---

## 3. API Contract

### 3.1 Changes to `POST /verifyCitations` Response

The existing `verifyCitations` endpoint returns a `VerificationRecord` (map of `citationKey → Verification`). This response will be extended with proof metadata.

#### New fields in `Verification`

```typescript
interface Verification {
  // ... existing fields ...

  /**
   * Stable proof identifier assigned by the backend.
   * Used to construct proof page URLs: {proofBaseUrl}/p/{proofId}
   *
   * Format: URL-safe base64, 22 characters (128-bit UUID → base64url)
   * Example: "xK9mPqR2sT4uV6wY8zA1bC"
   */
  proofId?: string;

  /**
   * Pre-built proof page URL.
   * Convenience field — equivalent to `${proofBaseUrl}/p/${proofId}`.
   * Includes signed token if the workspace has access control enabled.
   *
   * Example: "https://proof.deepcitation.com/p/xK9mPqR2sT4uV6wY8zA1bC"
   * With token: "https://proof.deepcitation.com/p/xK9mPqR2sT4uV6wY8zA1bC?token=eyJ..."
   */
  proofUrl?: string;

  /**
   * Direct URL to the proof snippet image (highlighted crop).
   * Can be used in GitHub Markdown ![](url), HTML <img>, etc.
   *
   * Example: "https://proof.deepcitation.com/p/xK9mPqR2sT4uV6wY8zA1bC?format=png&view=snippet"
   */
  proofImageUrl?: string;
}
```

#### New request option

```typescript
interface VerifyCitationRequest {
  // ... existing fields ...

  /**
   * When true, the backend will persist proof artifacts (images, metadata)
   * and return proofId, proofUrl, and proofImageUrl in the response.
   *
   * When false (default for backwards compatibility), behaves as today:
   * returns base64 images inline, no hosted proof.
   *
   * @default false
   */
  generateProofUrls?: boolean;

  /**
   * Proof URL configuration. Only used when generateProofUrls is true.
   */
  proofConfig?: {
    /**
     * Access control for proof URLs.
     * - "signed": URLs include a signed token with expiry (default)
     * - "workspace": Anyone in the workspace can access (no token needed)
     * - "public": No access control (use for public-facing content)
     */
    access?: "signed" | "workspace" | "public";

    /**
     * Expiry duration for signed URLs (only used when access is "signed").
     * @default "7d"
     */
    signedUrlExpiry?: "1h" | "24h" | "7d" | "30d" | "90d" | "1y";

    /**
     * Image format for proof images.
     * @default "png" (most compatible across surfaces)
     */
    imageFormat?: "png" | "jpeg" | "avif" | "webp";

    /**
     * Whether to also return base64 images inline (in addition to URLs).
     * Useful for React clients that want both.
     * @default false (when generateProofUrls is true)
     */
    includeBase64?: boolean;
  };
}
```

#### Example request

```json
{
  "data": {
    "attachmentId": "att-abc123",
    "citations": {
      "a1b2c3d4e5f67890": {
        "pageNumber": 5,
        "lineIds": [12, 13],
        "fullPhrase": "Revenue increased by 15% in Q4.",
        "anchorText": "increased by 15%"
      }
    },
    "outputImageFormat": "png",
    "generateProofUrls": true,
    "proofConfig": {
      "access": "signed",
      "signedUrlExpiry": "7d",
      "imageFormat": "png"
    }
  }
}
```

#### Example response

```json
{
  "verifications": {
    "a1b2c3d4e5f67890": {
      "status": "found",
      "verifiedPageNumber": 5,
      "verifiedLineIds": [12, 13],
      "verifiedFullPhrase": "Revenue increased by 15% in Q4.",
      "verifiedAnchorText": "increased by 15%",
      "label": "Q4_Report.pdf",

      "proofId": "xK9mPqR2sT4uV6wY8zA1bC",
      "proofUrl": "https://proof.deepcitation.com/p/xK9mPqR2sT4uV6wY8zA1bC?token=eyJhbGciOiJIUzI1NiJ9...",
      "proofImageUrl": "https://proof.deepcitation.com/p/xK9mPqR2sT4uV6wY8zA1bC?format=png&view=snippet&token=eyJhbGciOiJIUzI1NiJ9...",

      "phraseMatchDeepItem": { "x": 120, "y": 340, "width": 380, "height": 20 },
      "verificationImageDimensions": { "width": 1200, "height": 1600 }
    }
  }
}
```

---

### 3.2 Proof Page Endpoint

```
GET /p/{proof_id}
```

Serves an HTML page displaying the proof for a single citation.

#### Query parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `view` | `snippet \| context \| page` | `snippet` | What to show |
| `format` | `html \| png \| jpeg \| avif \| webp` | `html` | Response format |
| `theme` | `light \| dark` | `light` | Color scheme |
| `pad` | integer | `40` | Extra padding around snippet (pixels) |
| `token` | string | — | Signed access token |

#### Response by format

**`format=html` (default)** — Returns a full HTML page:

```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: private, max-age=3600

<!DOCTYPE html>
<html>
<head>
  <title>✓ Verified — Q4_Report.pdf, p.5</title>
  <meta property="og:title" content="✓ Verified — Q4_Report.pdf, p.5" />
  <meta property="og:description" content="&quot;Revenue increased by 15% in Q4.&quot;" />
  <meta property="og:image" content="https://proof.deepcitation.com/p/xK9mPqR2sT4uV6wY8zA1bC?format=png&view=snippet" />
  <meta property="og:image:width" content="600" />
  <meta property="og:image:height" content="200" />
  <meta property="og:type" content="article" />
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="✓ Verified — Q4_Report.pdf, p.5" />
  <meta name="twitter:description" content="&quot;Revenue increased by 15% in Q4.&quot;" />
  <meta name="twitter:image" content="https://proof.deepcitation.com/p/xK9mPqR2sT4uV6wY8zA1bC?format=png&view=snippet" />
</head>
<body>
  <!-- Proof page UI -->
</body>
</html>
```

**`format=png|jpeg|avif|webp`** — Returns the proof image directly:

```
HTTP/1.1 200 OK
Content-Type: image/png
Cache-Control: private, max-age=86400
Content-Disposition: inline

<binary image data>
```

#### Views

| View | Description | Image content |
|------|-------------|--------------|
| `snippet` | Tight crop around the highlighted phrase | Just the match + 40px padding |
| `context` | Wider crop showing surrounding content | Match + 200px padding (configurable via `pad`) |
| `page` | Full page render | Entire page with highlight overlay |

#### Page structure (above the fold)

```
┌─────────────────────────────────────────────┐
│ ✓ Verified                                  │
│ ─────────────────────────────────────────── │
│                                             │
│ "Revenue increased by 15% in Q4."           │  ← claim text
│                                             │
│ Source: Q4_Report.pdf — Page 5              │  ← source info
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ │  [highlighted snippet image]            │ │  ← proof image
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Snippet]  [Context]  [Full Page]           │  ← view toggles
│                                             │
│ ─────────────────────────────────────────── │
│ Retrieved: 2025-02-09T14:30:00Z             │
│ Content hash: sha256:a1b2c3...              │
│ Verified at: 2025-02-09T14:30:05Z           │
└─────────────────────────────────────────────┘
```

---

### 3.3 Proof Object (Backend Data Model)

Each proof is persisted with:

```typescript
interface ProofObject {
  // Identity
  proofId: string;                    // URL-safe base64, 22 chars
  citationKey: string;                // 16-char SHA1 hash (from client)

  // Ownership
  workspaceId: string;
  userId: string;
  attachmentId: string;

  // Citation data
  claimText: string;                  // fullPhrase or anchorText
  pageNumber: number;
  lineIds: number[];

  // Verification result
  status: "verified" | "partial" | "not_supported";
  searchStatus: SearchStatus;         // raw status from verifier
  verifiedFullPhrase?: string;
  verifiedAnchorText?: string;
  confidence?: number;                // 0-1 if available
  caveats?: string[];                 // e.g., "text found on different page"

  // Source metadata
  source: {
    title: string;                    // filename or URL title
    type: "pdf" | "html" | "image" | "csv" | "docx" | "pptx" | "xlsx";
    location: string;                 // "Page 5" or "Section 3"
    originalUrl?: string;             // if source was a URL
  };

  // Images (stored in object storage)
  snippetImageKey: string;            // S3/R2 key for snippet crop
  contextImageKey: string;            // S3/R2 key for context crop
  pageImageKey: string;               // S3/R2 key for full page
  imageFormat: "png" | "jpeg" | "avif" | "webp";

  // Highlight coordinates (for interactive viewers)
  highlightBox: { x: number; y: number; width: number; height: number };
  pageDimensions: { width: number; height: number };

  // Integrity
  contentHash: string;                // SHA256 of source content at verification time
  snapshotId?: string;                // reference to source content snapshot

  // Timestamps
  createdAt: Date;
  retrievedAt: Date;                  // when source was fetched/uploaded
  verifiedAt: Date;
  expiresAt?: Date;                   // when proof page becomes inaccessible

  // Access control
  visibilityScope: "workspace" | "org" | "public";
}
```

---

### 3.4 Access Control

#### Signed URLs (default)

Proof URLs include a JWT token as a query parameter:

```
https://proof.deepcitation.com/p/{proofId}?token={jwt}
```

**JWT payload:**

```json
{
  "sub": "proof:{proofId}",
  "wid": "workspace-123",
  "exp": 1739145600,
  "iat": 1738540800,
  "scope": "proof:read"
}
```

**Validation flow:**

```
1. Extract token from ?token= query param
2. Verify JWT signature (HMAC-SHA256 with workspace signing key)
3. Check expiry (exp claim)
4. Check proofId matches sub claim
5. If valid → serve proof page/image
6. If invalid/expired → 403 with clean "Access expired" page
```

#### Workspace-level access

When `access: "workspace"`, no token needed. The proof page checks:

```
1. User must be authenticated (session cookie or Bearer token)
2. User must belong to the workspace that created the proof
3. If valid → serve
4. If not → 403 with "Sign in to view this proof" page
```

#### Public access

When `access: "public"`, no authentication required. The proof page is accessible to anyone with the URL. Suitable for public repos, blog posts, open-source documentation.

#### Unauthorized response

```
HTTP/1.1 403 Forbidden
Content-Type: text/html

<!DOCTYPE html>
<html>
<head><title>Proof Access Denied</title></head>
<body>
  <h1>This proof link has expired or requires authentication.</h1>
  <p>If you received this link, ask the sender for an updated link.</p>
</body>
</html>
```

For image requests (`format=png`), return a 1x1 transparent PNG with `403` status (prevents broken image icons from showing private content).

---

### 3.5 Proof Status Mapping

The backend maps internal `SearchStatus` values to user-facing proof statuses:

```typescript
function mapToProofStatus(searchStatus: SearchStatus): "verified" | "partial" | "not_supported" {
  switch (searchStatus) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "verified";

    case "found_on_other_page":
    case "found_on_other_line":
    case "partial_text_found":
    case "first_word_found":
      return "partial";

    case "not_found":
      return "not_supported";

    default:
      return "not_supported";
  }
}
```

#### Status display on proof page

| Proof Status | Icon | Label | Color | Description shown |
|-------------|------|-------|-------|-------------------|
| `verified` | ✓ | Verified | Green | "This claim is directly supported by the source document." |
| `partial` | ⚠ | Partial Match | Amber | "This claim is partially supported. {caveat details}" |
| `not_supported` | ✗ | Not Supported | Red | "This claim could not be verified in the source document." |

---

## 4. Client SDK Changes

### 4.1 New types

```typescript
// types/verification.ts — add to Verification interface
interface Verification {
  // ... existing ...
  proofId?: string;
  proofUrl?: string;
  proofImageUrl?: string;
}
```

### 4.2 Updated client method

```typescript
// client/DeepCitation.ts
class DeepCitation {
  async verifyCitations(
    citations: CitationRecord,
    attachmentId: string,
    options?: VerifyCitationsOptions
  ): Promise<VerifyCitationsResponse>;
}

// client/types.ts — extended options
interface VerifyCitationsOptions {
  outputImageFormat?: "jpeg" | "png" | "avif";

  // NEW
  generateProofUrls?: boolean;
  proofConfig?: {
    access?: "signed" | "workspace" | "public";
    signedUrlExpiry?: "1h" | "24h" | "7d" | "30d" | "90d" | "1y";
    imageFormat?: "png" | "jpeg" | "avif" | "webp";
    includeBase64?: boolean;
  };
}
```

### 4.3 Proof URL builder (client-side)

For cases where the client knows the `proofBaseUrl` and wants to construct URLs without calling the backend:

```typescript
import { buildProofUrl, buildSnippetImageUrl } from "deepcitation";

// From verification response
const verification = verifications["a1b2c3d4e5f67890"];
const proofPageUrl = verification.proofUrl; // pre-built by backend

// Or build manually from proofId
const url = buildProofUrl(verification.proofId!, {
  baseUrl: "https://proof.deepcitation.com",
  view: "snippet",
});

// Direct image URL for embedding
const imageUrl = buildSnippetImageUrl(verification.proofId!, {
  baseUrl: "https://proof.deepcitation.com",
  format: "png",
});
```

---

## 5. Image Generation & Storage

### 5.1 Image types

The backend generates three image crops from the verified page:

| Image | Description | Typical size | Use case |
|-------|-------------|-------------|----------|
| **Snippet** | Tight crop around highlighted phrase + 40px padding | 600x100-300px | OG image, inline preview, Slack unfurl |
| **Context** | Wider crop showing surrounding content | 600x400-800px | "Show more" on proof page |
| **Page** | Full page render with highlight overlay | 600x800-1200px | Full audit view |

### 5.2 Highlight rendering

The snippet/context images should include:

- A semi-transparent highlight rectangle over the matched text (yellow by default, configurable)
- A subtle border/outline around the highlight for clarity
- The rest of the page rendered at normal contrast
- For "not found" status: show the nearest match with a red "expected" ghost highlight

### 5.3 Storage

Images are stored in object storage (S3/R2/GCS):

```
proofs/
├── {workspace_id}/
│   ├── {proof_id}/
│   │   ├── snippet.png
│   │   ├── context.png
│   │   └── page.png
```

**Retention:** Images follow the same expiry as the parent attachment. When an attachment expires, its proof images are garbage collected.

**Caching:**
- Non-public proofs: `Cache-Control: private, max-age=3600` for pages, `private, max-age=86400` for images (browser-only caching, no CDN)
- Public proofs: `Cache-Control: public, max-age=86400` with CDN caching using `proof_id` as cache key (immutable content)

---

## 6. OG Metadata for Slack Unfurls

When a proof URL is posted in Slack (or any platform that reads OG tags), the proof page's `<head>` provides OG metadata. **Important:** OG content is fetched and cached by third-party platforms indefinitely, so non-public proofs must not expose claim text or snippet images in OG tags.

#### Public proofs (`access: "public"`)

```html
<meta property="og:type" content="article" />
<meta property="og:title" content="✓ Verified — Q4_Report.pdf, p.5" />
<meta property="og:description" content="&quot;Revenue increased by 15% in Q4.&quot;" />
<meta property="og:image" content="https://proof.deepcitation.com/p/{proofId}?format=png&view=snippet" />
<meta property="og:image:width" content="600" />
<meta property="og:image:height" content="200" />
<meta property="og:url" content="https://proof.deepcitation.com/p/{proofId}" />
<meta property="og:site_name" content="DeepCitation" />
```

#### Non-public proofs (`access: "signed"` or `"workspace"`)

```html
<meta property="og:type" content="article" />
<meta property="og:title" content="DeepCitation Proof — Sign in to view" />
<meta property="og:description" content="This proof requires authentication to view." />
<meta property="og:image" content="https://proof.deepcitation.com/assets/og-placeholder.png" />
<meta property="og:image:width" content="600" />
<meta property="og:image:height" content="200" />
<meta property="og:url" content="https://proof.deepcitation.com/p/{proofId}" />
<meta property="og:site_name" content="DeepCitation" />
```

**Title format by status (public proofs only):**

| Status | OG Title |
|--------|---------|
| Verified | `✓ Verified — {source_title}, {location}` |
| Partial | `⚠ Partial Match — {source_title}, {location}` |
| Not Supported | `✗ Not Supported — {source_title}, {location}` |

**OG Image requirements (public proofs only):**
- Minimum 200x200px (Slack requirement)
- Recommended 600x300px for large unfurl cards
- PNG format for sharpness
- Include the highlight on the snippet
- Add a thin status-colored border at the top (green/amber/red)

---

## 7. Endpoint Summary

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/verifyCitations` | Verify citations (existing, extended) | API key |
| `GET` | `/p/{proofId}` | Proof page (HTML) | Token / workspace / public |
| `GET` | `/p/{proofId}?format=png` | Proof snippet image | Token / workspace / public |
| `GET` | `/p/{proofId}?format=png&view=context` | Proof context image | Token / workspace / public |
| `GET` | `/p/{proofId}?format=png&view=page` | Full page image | Token / workspace / public |
| `DELETE` | `/p/{proofId}` | Delete a single proof and its images | API key |
| `DELETE` | `/proofs?attachmentId={id}` | Delete all proofs for an attachment | API key |

---

## 8. Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Proof page TTFB | < 200ms | Static HTML, CDN-cached |
| Snippet image load | < 500ms | Pre-generated, CDN-cached |
| OG unfurl response | < 300ms | Slack fetches OG tags with timeout |
| Proof generation (during verify) | +100-300ms over current | Image cropping + storage upload |
| Signed URL verification | < 10ms | JWT validation, no DB lookup |

---

## 9. Backwards Compatibility

### No breaking changes to existing API

- `verifyCitations` continues to work exactly as before when `generateProofUrls` is not set or is `false`
- `verificationImageBase64` continues to be returned by default
- When `generateProofUrls: true`, base64 images are omitted by default (to reduce payload) but can be re-enabled with `includeBase64: true`
- The `Verification` interface gains 3 optional fields (`proofId`, `proofUrl`, `proofImageUrl`) — all optional, no existing code breaks

### Migration path for existing clients

```typescript
// Before (React only)
const verifications = await client.verifyCitations(citations, attachmentId);
// verifications["key"].verificationImageBase64 → base64 string

// After (multi-surface)
const verifications = await client.verifyCitations(citations, attachmentId, {
  generateProofUrls: true,
  proofConfig: { access: "signed", signedUrlExpiry: "7d" },
});
// verifications["key"].proofUrl → "https://proof.deepcitation.com/p/..."
// verifications["key"].proofImageUrl → "https://proof.deepcitation.com/p/...?format=png"
// verifications["key"].verificationImageBase64 → undefined (unless includeBase64: true)
```

---

## 10. Rollout Plan

### Phase 1: Proof storage + URL generation (3-4 days)

- Proof ID generation during verification
- Image cropping (snippet, context, page) and storage to object storage
- `proofId`, `proofUrl`, `proofImageUrl` fields in verification response
- Signed URL generation and validation

### Phase 2: Proof page (2-3 days)

- `/p/{proofId}` HTML page with above-the-fold proof display
- View switching (snippet/context/page)
- OG metadata for Slack unfurls
- Image format endpoint (`format=png`)
- Access control (signed/workspace/public)

### Phase 3: Production hardening (1-2 days)

- CDN configuration and cache headers
- Rate limiting on proof page
- Monitoring and analytics (view counts, click-throughs)
- Garbage collection for expired proofs
- Error pages (404, 403, expired)

---

## 11. Analytics Events

| Event | Properties | When |
|-------|-----------|------|
| `proof.generated` | `proofId, status, source_type, access_level` | During verifyCitations |
| `proof.page_viewed` | `proofId, view, format, surface, referrer` | GET /p/{proofId} |
| `proof.image_served` | `proofId, view, format, surface` | GET /p/{proofId}?format=png |
| `proof.access_denied` | `proofId, reason (expired/unauthorized)` | 403 response |
| `proof.view_changed` | `proofId, from_view, to_view` | User switches snippet→context→page |

**Surface detection:** The `surface` property is inferred from the `Referer` header:
- `slack` if referrer contains `slack.com` or `app.slack.com`
- `github` if referrer contains `github.com`
- `email` if no referrer (direct link from email client)
- `web` for all other referrers

---

## 12. Security Considerations

### Signed URL tokens

- JWT signed with workspace-specific HMAC-SHA256 key
- Tokens are scoped to a single proofId (cannot be reused for other proofs)
- Expiry is enforced server-side (not just client-side)
- Tokens cannot be refreshed — new ones must be generated via the API
- **Token leakage risk:** JWT tokens in query strings (`?token=`) are exposed in browser history, server/CDN access logs, and `Referer` headers when users navigate away from the proof page. Mitigations:
  - Set `Referrer-Policy: no-referrer` on proof pages to prevent token leakage via `Referer` headers
  - Consider a token-exchange flow: client `POST`s the token, receives a short-lived session cookie, then loads the proof page without the token in the URL
  - At minimum, keep signed URL expiry short and document that tokens should be treated as secrets
- **JWT payload is not encrypted:** Anyone with a proof URL can base64-decode the JWT and read the payload (`wid`, `proofId`, timing). This is not a secret leak per se, but exposes workspace structure. Consider opaque tokens (random strings mapped server-side) or JWE (encrypted JWTs) if this is a concern.

### Content leakage prevention

- Proof images are served with `Cache-Control: private` (no CDN caching of private content)
- CDN caching (with `proof_id` as cache key) is only enabled for `access: "public"` proofs. Non-public proofs must not be CDN-cached.
- `X-Frame-Options: DENY` on proof pages (prevent iframe embedding)
- `Content-Security-Policy: frame-ancestors 'none'` reinforcement
- `X-Content-Type-Options: nosniff` on all proof responses (prevents MIME-sniffing)
- No indexing: `<meta name="robots" content="noindex, nofollow" />`
- For `access: "public"`, these restrictions are relaxed

### OG metadata and third-party caching

When a proof URL is shared in Slack, Twitter, or similar platforms, those platforms fetch and **cache OG metadata (title, description, image) on their own servers**. This cached content persists indefinitely on the third-party platform, even after the signed URL expires or the proof is deleted. This effectively makes the claim text and snippet image public for any non-public proof that gets shared.

**Mitigation:** For `access: "signed"` and `"workspace"` proofs, serve genericized OG metadata:

```html
<!-- Non-public proofs: generic OG tags -->
<meta property="og:title" content="DeepCitation Proof — Sign in to view" />
<meta property="og:description" content="This proof requires authentication to view." />
<meta property="og:image" content="https://proof.deepcitation.com/assets/og-placeholder.png" />
```

Only populate real claim text and snippet images in OG tags for `access: "public"` proofs.

### Proof images as content copies

Proof images (snippet, context, page) are extracted copies of source document content stored in a separate object storage bucket. This creates a second copy of potentially confidential content accessible via a different auth model (token vs. API key).

- Proof image storage must inherit the same encryption-at-rest and access controls as source attachments
- The `page` view serves an entire page of the source document — consider whether this is necessary at launch or if `snippet` and `context` are sufficient
- When an attachment is deleted, all associated proof images must be garbage-collected immediately (not just on expiry)

### Rate limiting

- Proof page: 100 requests/minute per IP
- Proof image: 200 requests/minute per IP (images are fetched multiple times by previews)
- verifyCitations with `generateProofUrls`: same limits as existing endpoint

---

## 13. Privacy & Compliance

### Data contained in proofs

Each proof object contains potentially sensitive data:
- `claimText` — excerpt from the source document
- `userId`, `workspaceId` — organizational identifiers
- Snippet/context/page images — visual copies of document content
- `contentHash` — cryptographic proof that specific content existed at a specific time (may have legal/discovery implications)

### Right to erasure (GDPR Article 17 / CCPA)

Users and workspaces must be able to delete proof data on demand. Required endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `DELETE` | `/p/{proofId}` | Delete a single proof and its images |
| `DELETE` | `/proofs?attachmentId={id}` | Delete all proofs for an attachment |
| `DELETE` | `/proofs?workspaceId={id}` | Delete all proofs for a workspace |

Deletion must:
- Remove the proof metadata from the database
- Remove all associated images from object storage
- Invalidate any CDN-cached copies (purge by cache key)
- Return `404` for subsequent requests to the proof URL

**Note:** Deletion cannot recall OG content already cached by third-party platforms (Slack, Twitter). This is mitigated by serving generic OG tags for non-public proofs (see section 12).

### Data residency

Proof data (metadata and images) should be stored in the same region as the source attachment. For enterprise customers with data residency requirements, proof storage must respect workspace-level region configuration.

### Analytics and tracking disclosure

The analytics events in section 11 track proof page views with `surface` and `referrer` data inferred from the `Referer` header. This constitutes user activity tracking and must be:
- Disclosed in the privacy policy
- Limited to the bucketed `surface` value (do not store raw `Referer` URLs)
- Respectful of `DNT` (Do Not Track) headers where applicable

### Retention

- Proof data follows the same retention/expiry as the parent attachment
- When an attachment is deleted, all associated proofs are deleted (cascade)
- Expired proofs are garbage-collected and return `404`

---

## 14. Open Questions

> Section 13 recommendations are approved as-is.

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Should proof pages be a separate service or part of the main API? | Separate service with its own domain (`proof.deepcitation.com`) vs. path on main API (`api.deepcitation.com/p/`) | Separate subdomain — cleaner OG previews, independent scaling, CDN-friendly |
| 2 | Should we support proof "bundles" (multiple citations in one page)? | Single proof per page vs. bundle view | Start with single, add bundle later. Single is simpler and each proof URL is self-contained. |
| 3 | How long should proof images persist? | Same as attachment vs. independent expiry | Same as attachment expiry. Proofs are meaningless without the source. |
| 4 | Should we support custom branding on proof pages? | Generic vs. workspace-branded | Start generic. Add workspace logo/colors in Phase 2 if requested. |
| 5 | Should the proof page include a "verify yourself" button to re-run verification? | Yes/No | No for Phase 1. The proof is a snapshot, not a live check. Add later if needed. |

---

## 15. Definition of Done

1. `verifyCitations` with `generateProofUrls: true` returns `proofId`, `proofUrl`, and `proofImageUrl` for each citation
2. `GET /p/{proofId}` returns an HTML proof page with claim, status, snippet image, and view toggles
3. `GET /p/{proofId}?format=png&view=snippet` returns a highlighted snippet image suitable for OG previews
4. OG metadata on proof pages causes meaningful Slack unfurls (title, description, image)
5. Non-public proofs serve genericized OG metadata (no claim text or snippet image in OG tags)
6. Signed URLs with expiry prevent unauthorized access to private proofs
7. Proof pages set `Referrer-Policy: no-referrer` to prevent token leakage
8. `DELETE /p/{proofId}` removes proof metadata and images from storage
9. Attachment deletion cascades to delete all associated proofs
10. Unauthorized requests get clean error pages, not raw errors
11. Snippet image loads fast enough for chat usage (< 500ms)
12. No existing API behavior changes when `generateProofUrls` is not set
