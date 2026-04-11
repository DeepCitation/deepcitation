---
layout: default
title: Verification Statuses
parent: API Reference
nav_order: 2
description: "Understanding verification result statuses"
commit_sha: "31553cd"
stale_after_commits: 10
watch_paths:
  - src/types/verification.ts
  - src/types/search.ts
  - src/types/citation.ts
---

# Understanding Verification Results

Learn how to interpret the `searchState.status` field in verification responses.

{: .note }
This page documents the **raw REST API response shape** (`searchState.status`). If you're using the TypeScript SDK, the status is normalized to `verification.status` — no `searchState` wrapper. See [Types]({{ site.baseurl }}/types/) for the SDK interface.

---

## Search Status Values

The `searchState.status` field indicates the verification result:

### found

Exact match found in the document. The citation is verified.

```json
{
  "searchState": {
    "status": "found"
  }
}
```

---

### partial_text_found

Some of the citation text was found, but not an exact match. This often occurs when:
- The LLM paraphrased the source text
- Minor word differences exist
- The citation is a close approximation

```json
{
  "searchState": {
    "status": "partial_text_found"
  }
}
```

---

### found_source_match_only

The short value/sourceMatch was found, but the full phrase was not. This indicates the key information exists but the surrounding context differs.

```json
{
  "searchState": {
    "status": "found_source_match_only"
  }
}
```

---

### found_on_other_page

Citation found, but on a different page than specified. The content exists but the page reference was incorrect.

```json
{
  "searchState": {
    "status": "found_on_other_page",
    "expectedPage": 1,
    "actualPage": 3
  }
}
```

---

### found_on_other_line

Citation found on the correct page, but on a different line than expected.

```json
{
  "searchState": {
    "status": "found_on_other_line",
    "expectedLineIds": [5, 6],
    "actualLineIds": [12, 13]
  }
}
```

---

### first_word_found

Only the first word of the phrase was found. This may indicate a partial match or incorrect citation.

---

### found_context_missed_source_match

The source context was found in the document, but the source match (short value) was not a valid substring match within it. This typically means the LLM chose a source match that doesn't appear verbatim in the context.

```json
{
  "searchState": {
    "status": "found_context_missed_source_match"
  }
}
```

---

### loading

Initial client-side state before the verification request is sent. You will only see this status if you are rendering citations before verification completes.

---

### timestamp_wip

Timestamp-based verification is still in progress. This applies to audio/video citations where start/end timestamps are being matched.

---

### skipped

Verification was intentionally skipped for this citation (e.g., the citation was marked as not requiring verification, or the attachment could not be resolved).

---

### not_found

Citation could not be verified - text not found in document. This may indicate:
- A hallucination by the LLM
- Incorrect attachment ID
- Citation from a different source

```json
{
  "searchState": {
    "status": "not_found"
  }
}
```

---

### pending

Verification is still in progress. Wait and retry.

```json
{
  "searchState": {
    "status": "pending"
  }
}
```

---

## Verification Image

When a citation is found, the `evidence.src` field contains a cropped image of the source document showing the matched text. This provides visual proof for users.

### Format

The image is base64-encoded and includes the data URI prefix:

```
data:image/avif;base64,AAAAIGZ0eXBhdmlm...
```

### Supported Formats

| Format | Description |
|:-------|:------------|
| `avif` | Default, smallest file size |
| `jpeg` | Wide compatibility |
| `png` | Lossless, larger files |

Specify the format in the verification request with `outputImageFormat`.

---

## Status Grouping for UI

When displaying citations, group statuses by user impact:

| Group | Statuses | UI Treatment |
|:------|:---------|:-------------|
| **Verified** | `found`, `found_context_missed_source_match` | Green checkmark, blue text |
| **Partial** | `partial_text_found`, `found_source_match_only`, `found_on_other_page`, `found_on_other_line`, `first_word_found` | Orange indicator, blue text |
| **Not Found** | `not_found`, `skipped` | Gray text, strikethrough optional |
| **Loading** | `pending`, `loading`, `timestamp_wip` | Spinner or skeleton |
