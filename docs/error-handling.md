---
layout: default
title: Error Handling
parent: Getting Started
nav_order: 5
description: "Error handling patterns for DeepCitation in production"
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
- `code` - Machine-readable error code (e.g., `"DC_AUTH_INVALID"`, `"DC_RATE_LIMITED"`)
- `isRetryable` - Boolean flag indicating whether the operation can be safely retried
- `statusCode` - HTTP status code if applicable

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
```

---

## Rate limits

The DeepCitation API enforces rate limits. When exceeded, you'll receive a `429` status code. The retry pattern above handles this automatically via exponential backoff.

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
3. **Did you pass the `deepTextPromptPortion`?** The LLM needs the source text with line IDs to cite

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

## Related

- [Getting Started](./getting-started.md)
- [API Reference](./api-reference.md)
- [Styling Guide](./styling.md)
