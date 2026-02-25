# Next.js AI SDK Example Improvements

## Overview

The `examples/nextjs-ai-sdk/` example serves as the foundation/template for new examples (including the upcoming AG-UI example). This plan addresses critical bugs, security gaps, and quality issues that would otherwise propagate to every example built on top of it.

**Priority**: Must complete before building `examples/agui-chat/`.

## Key Changes

### 1. Fix Auto-Scroll Bug (Critical UX)

**File**: `src/app/page.tsx` (line ~140)

The scroll-to-bottom effect only runs once on mount due to an empty dependency array. Chat doesn't scroll as new messages stream in.

```typescript
// BEFORE — runs once on mount only
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, []);

// AFTER — scrolls whenever messages change
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);
```

### 2. Disable Input During Verification (Critical — Race Condition)

**File**: `src/app/page.tsx` (line ~259)

Input is only disabled while `isLoading`, not while `isVerifying`. Users can fire another message mid-verification, causing race conditions and orphaned verification requests.

```typescript
// BEFORE
disabled={isLoading}

// AFTER
disabled={isLoading || isVerifying}
```

Also disable the model selector and submit button during both states.

### 3. Surface Verification Errors to User (Critical UX)

**File**: `src/app/page.tsx` (lines ~62-79)

The `.catch()` on the verification fetch silently logs errors. Users see a spinner forever with no indication of failure.

**Changes**:
- Add `verificationError` state: `Record<string, string>`
- In the catch handler, set the error for the message ID
- Display error state in the UI (red banner below message or in VerificationPanel)
- Add retry button for failed verifications

### 4. Add Server-Side File Validation in Upload Route (Security)

**File**: `src/app/api/upload/route.ts`

No server-side file size limit or MIME type validation. Client-side `accept` attribute is easily bypassed.

**Changes**:
```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Validate file size
if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json(
    { error: `File too large. Maximum size is 50MB.` },
    { status: 413 }
  );
}

// Validate MIME type
const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "image/webp",
];
if (!ALLOWED_TYPES.includes(file.type)) {
  return NextResponse.json(
    { error: `Unsupported file type: ${file.type}` },
    { status: 400 }
  );
}
```

### 5. Add JSON Parsing Error Handling in API Routes (Stability)

**Files**: All three API routes (`chat/route.ts`, `upload/route.ts`, `verify/route.ts`)

`await req.json()` throws if the body is malformed JSON. Currently unhandled — returns a 500 with a stack trace.

**Pattern for each route**:
```typescript
let body;
try {
  body = await req.json();
} catch {
  return NextResponse.json(
    { error: "Invalid JSON in request body" },
    { status: 400 }
  );
}
```

### 6. Fix VerificationPanel TypeScript Types (Code Quality)

**File**: `src/components/VerificationPanel.tsx` (lines 5-15)

Props use `Record<string, any>` instead of proper types from deepcitation-js.

```typescript
// BEFORE
citations: Record<string, any>;
verifications: Record<string, any>;

// AFTER
import type { Citation, Verification } from "@deepcitation/deepcitation-js";

citations: Record<string, Citation>;
verifications: Record<string, Verification>;
```

### 7. Wrap CitationComponent in CitationErrorBoundary (Stability)

**File**: `src/components/ChatMessage.tsx`

If one CitationComponent throws, the entire message crashes. DeepCitation exports `CitationErrorBoundary` for exactly this purpose.

```typescript
import { CitationErrorBoundary, CitationComponent } from "@deepcitation/deepcitation-js/react";

// In processContentWithCitations:
elements.push(
  <CitationErrorBoundary key={`citation-${citationKey}`}>
    <CitationComponent citation={citation} verification={verification} />
  </CitationErrorBoundary>,
);
```

### 8. Add Provider Validation in Chat Route (Security)

**File**: `src/app/api/chat/route.ts` (line ~17)

No validation of the `provider` parameter. Arbitrary strings pass through.

```typescript
const VALID_PROVIDERS = ["openai", "gemini"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

const provider: Provider = VALID_PROVIDERS.includes(body.provider)
  ? body.provider
  : "openai";
```

### 9. Remove `allow-same-origin` from Showcase Iframe (Security)

**File**: `src/app/showcase/renderers/page.tsx` (line ~189)

The HTML renderer preview uses `sandbox="allow-same-origin"` which allows injected HTML to access the parent frame's origin.

```typescript
// BEFORE
<iframe srcDoc={htmlOutput.full} sandbox="allow-same-origin" ... />

// AFTER
<iframe srcDoc={htmlOutput.full} sandbox="" ... />
```

### 10. Disable Model Selector During Loading (UX)

**File**: `src/app/page.tsx` (line ~164)

Users can switch the model mid-stream, which is confusing.

```typescript
<select disabled={isLoading || isVerifying} ...>
```

## Files Modified

| File | Changes |
|------|---------|
| `src/app/page.tsx` | #1 scroll fix, #2 disable input, #3 error state, #10 model selector |
| `src/app/api/upload/route.ts` | #4 file validation, #5 JSON handling |
| `src/app/api/chat/route.ts` | #5 JSON handling, #8 provider validation |
| `src/app/api/verify/route.ts` | #5 JSON handling |
| `src/components/VerificationPanel.tsx` | #6 TypeScript types |
| `src/components/ChatMessage.tsx` | #7 CitationErrorBoundary |
| `src/app/showcase/renderers/page.tsx` | #9 iframe sandbox |

## What's NOT in Scope

These are real issues but lower priority — don't block the AG-UI example:

- Mobile responsiveness (layout breaks < 768px) — follow-up
- Session persistence (messages lost on refresh) — follow-up
- Full test suite for API routes — follow-up
- Virtualized citation list for 100+ citations — follow-up
- ARIA labels and keyboard navigation improvements — follow-up
- Rate limiting on API routes — follow-up (needs external dependency)

## Verification

1. `cd examples/nextjs-ai-sdk && npm run build` — no TypeScript errors
2. `npm run dev` → upload PDF → ask question → verify:
   - Chat scrolls to new messages as they stream
   - Input disabled during verification
   - Model selector disabled during loading
   - Upload of >50MB file rejected with clear error
   - Invalid JSON POST to routes returns 400
3. If verification fails, error is displayed (not silent)
4. If CitationComponent throws, error boundary catches it gracefully
