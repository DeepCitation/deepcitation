---
layout: default
title: Error Handling
nav_order: 9
description: "Error handling patterns for DeepCitation in production"
commit_sha: "cc9c7aa"
stale_after_commits: 15
watch_paths:
  - src/client/errors.ts
  - src/client/DeepCitation.ts
---

# Error Handling

Production patterns for handling DeepCitation errors gracefully.

---

## Which operations can fail?

| Operation | Can fail? | Common causes | Safe to retry? |
|-----------|-----------|---------------|----------------|
| `new DeepCitation({ apiKey })` | Yes | Missing or empty API key | No -- fix the key |
| `uploadFile()` / `prepareAttachments()` | Yes | Network timeout, file too large, invalid format | Yes |
| `prepareUrl()` | Yes | Network timeout, URL unreachable, blocked by site | Yes (with backoff) |
| `verify()` | Yes | Network timeout, invalid citations, API error | Yes |
| `verifyAttachment()` | Yes | Network timeout, invalid attachment ID | Yes |
| `getAllCitationsFromLlmOutput()` | No | Never throws -- returns `{}` on failure | N/A |
| `wrapCitationPrompt()` | No | Never throws -- returns enhanced prompts | N/A |
| `getCitationStatus()` | No | Never throws -- returns status object | N/A |

---

## Error types

DeepCitation provides structured error classes for programmatic error handling:

{: .note }
`verify({ llmOutput })` is a convenience wrapper — it parses citations from the raw LLM output (via `getAllCitationsFromLlmOutput()`), groups them by attachment, then verifies each group. Use `verifyAttachment(attachmentId, citations)` when you extract and manage citations yourself. See [SDK Reference]({{ site.baseurl }}/sdk-reference/) for full method signatures.

```typescript
import {
  AuthenticationError,
  NetworkError,
  RateLimitError,
  ValidationError,
  ServerError,
  DeepCitationError,
} from "deepcitation";

try {
  const { verifications } = await dc.verify({ llmOutput });
} catch (err) {
  if (err instanceof AuthenticationError) {
    // API key is missing, invalid, or expired
    // Status code: 401 or 403
    // NOT retryable - fix the API key
    console.error("Check your DEEPCITATION_API_KEY:", err.message);
  } else if (err instanceof RateLimitError) {
    // Hit rate limit (429)
    // Retryable after delay
    console.error("Rate limited, retry after delay:", err.message);
  } else if (err instanceof ValidationError) {
    // Bad request: invalid format, file too large, etc.
    // Status codes: 400, 404, 413, etc.
    // NOT retryable - fix the input
    console.error("Validation error:", err.message);
  } else if (err instanceof ServerError) {
    // API returned 5xx error
    // Retryable with backoff
    console.error("Server error, safe to retry:", err.message);
  } else if (err instanceof NetworkError) {
    // Network failure: timeout, DNS, connection refused
    // Retryable with backoff
    console.error("Network error, safe to retry:", err.message);
  }
}
```

All errors extend `DeepCitationError` and include:
- `code` - Machine-readable error code (see table below)
- `isRetryable` - Boolean flag indicating whether the operation can be safely retried
- `statusCode` - HTTP status code if applicable
- `docUrl` - Link to documentation for this error code (e.g., `https://docs.deepcitation.com/errors#DC_AUTH_INVALID`)

### Error Code Reference

| Code | Error Class | HTTP Status | Retryable | Recovery Action |
|:-----|:------------|:------------|:----------|:----------------|
| `DC_AUTH_INVALID` | `AuthenticationError` | 401, 403 | No | Check API key — rotate at [deepcitation.com/keys](https://deepcitation.com/keys) |
| `DC_NETWORK_ERROR` | `NetworkError` | — | Yes | Retry with exponential backoff — check network connectivity |
| `DC_RATE_LIMITED` | `RateLimitError` | 429 | Yes | Free tier or balance exhausted — add payment method at [deepcitation.com/pricing](https://deepcitation.com/pricing) |
| `DC_VALIDATION_ERROR` | `ValidationError` | 400, 404, 413 | No | Fix the input — check file size (max 100 MB), format, or attachment ID |
| `DC_SERVER_ERROR` | `ServerError` | 5xx | Yes | Retry with exponential backoff — if persistent, check [status.deepcitation.com](https://status.deepcitation.com) |

---

## Retry pattern

Use the `isRetryable` flag to determine which errors are safe to retry:

```typescript
import { DeepCitationError } from "deepcitation";

async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelay = 1000 } = {}
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = attempt === maxRetries;

      // Only retry errors that are marked as retryable
      if (err instanceof DeepCitationError && !err.isRetryable) {
        throw err; // Don't retry auth or validation errors
      }

      if (isLastAttempt) throw err;

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

// Usage
const { verifications } = await withRetry(() =>
  dc.verify({ llmOutput: response.content })
);

// Production guidance:
// - 3 retries is sufficient for transient errors (network blips, 503s)
// - Never retry auth errors (fix the key) or validation errors (fix the input)
// - For 429 billing errors, retrying won't help — add a payment method
// - If you see persistent 5xx errors after 3 retries, check status.deepcitation.com
```

---

## Rate limits

DeepCitation uses **billing-based limits** — there are no per-minute or per-second request caps. You can make as many API calls as your account balance allows. When your free tier ($20/month) or balance is exhausted, the API returns `429 resource-exhausted`.

The retry pattern above handles `429` errors via exponential backoff, but for billing-related 429s you'll need to add a payment method at [deepcitation.com/pricing](https://deepcitation.com/pricing).

If you're processing many documents in parallel, use the built-in concurrency limiter:

```typescript
// The client limits concurrent uploads to 5 by default
const results = await dc.prepareAttachments(manyFiles);
```

---

## File size limits

- **Maximum file size**: Check current limits at [deepcitation.com/pricing](https://deepcitation.com/pricing)
- **Supported formats**: PDF, DOCX, XLSX, PPTX, HTML, JPG, PNG, TIFF, WebP, HEIC
- Files that exceed limits will return a `413` error

---

## Empty citations

If `getAllCitationsFromLlmOutput()` returns an empty object `{}`, check:

1. **Did you wrap the prompt?** Use `wrapCitationPrompt()` to add citation instructions to your LLM call
2. **Is the LLM following the format?** Check the raw LLM output for `<cite ... />` tags or `<<<CITATION_DATA>>>` blocks
3. **Did you pass the `deepTextPages`?** The LLM needs the source text that `wrapCitationPrompt()` renders into citation-ready prompt text

```typescript
const citations = getAllCitationsFromLlmOutput(llmOutput);

if (Object.keys(citations).length === 0) {
  // No citations found -- check the raw output
  console.log("Raw LLM output:", llmOutput);
  console.log("Contains cite tags:", llmOutput.includes("<cite"));
  console.log("Contains deferred block:", llmOutput.includes("<<<CITATION_DATA>>>"));
}
```

---

## Verification returns empty

If `verify()` returns `{ verifications: {} }`, the client found no citations to verify. This is not an error -- it means `getAllCitationsFromLlmOutput()` found nothing in the LLM output. See "Empty citations" above.

---

## Common Mistakes

**"My citations aren't styled"**
You forgot to import the stylesheet. Add `@import "deepcitation/tailwind.css"` to your CSS (Tailwind v4) or `import "deepcitation/styles.css"` in JS. See [Styling]({{ site.baseurl }}/styling/).

**"Verification says not_found but the text is there"**
The LLM likely paraphrased the source. Check if you got a `partial_text_found` or `found_anchor_text_only` status instead. See [Verification Statuses]({{ site.baseurl }}/verification-statuses/) for the full list of partial match statuses.

**"I exposed my API key in the browser"**
Rotate it immediately at [deepcitation.com/keys](https://deepcitation.com/keys). Never prefix your key with `NEXT_PUBLIC_` or expose it in client-side code — all DeepCitation API calls should happen server-side.

**"API key format"**
Keys always start with `dc_live_` (production) or `dc_test_` (test mode). If you're getting authentication errors, check for trailing whitespace or newlines in your environment variable.

---

## Related

- [Getting Started]({{ site.baseurl }}/getting-started/)
- [API Reference]({{ site.baseurl }}/api-reference/)
- [Styling Guide]({{ site.baseurl }}/styling/)
