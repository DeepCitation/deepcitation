# Batch Attachment Verification — PRD

## Problem

Today, verifying citations across multiple source documents requires **one API call per attachment**. A medical dashboard with 13 source files needs 13 separate `POST /verifyCitations` requests, each carrying only the citations for that attachment. This creates:

1. **Client complexity** — callers must group citations by `attachmentId`, fan out requests, handle partial failures, and merge responses.
2. **Overhead** — 13 TCP round-trips, 13 auth checks, 13 response envelopes. Latency is dominated by the slowest attachment, but total wall-clock is still higher than necessary.
3. **Skill fragility** — the `/verify` skill's most common bug is incorrect grouping. Agents send all citations in one request with one `attachmentId`, causing cross-attachment citations to silently fail.

## Proposal

Add a **batch mode** to `/verifyCitations` that accepts citations spanning multiple attachments in a single request. The API groups internally, verifies each attachment in parallel, and returns a single merged response.

## API Design

### Request

```jsonc
POST /verifyCitations

// Current (single-attachment) — unchanged
{
  "attachmentId": "abc123",
  "citations": { "key1": { ... } },
  "outputImageFormat": "avif"
}

// New (batch) — attachmentId is per-citation, not top-level
{
  "citations": {
    "key1": {
      "fullPhrase": "HbA1c 5.5 %",
      "anchorText": "5.5",
      "pageNumber": 2,
      "lineIds": [13],
      "attachmentId": "abc123"   // ← each citation carries its own
    },
    "key2": {
      "fullPhrase": "Large left paracentral disc protrusion",
      "anchorText": "disc protrusion",
      "pageNumber": 1,
      "lineIds": [5],
      "attachmentId": "def456"   // ← different attachment
    }
  },
  "outputImageFormat": "avif"
}
```

**Detection**: Batch mode requires an explicit `"mode": "batch"` field at the top level. This avoids silent mode switching if a client accidentally omits the top-level `attachmentId`.

```jsonc
{
  "mode": "batch",   // ← required for batch mode
  "citations": { ... },
  "outputImageFormat": "avif"
}
```

If `mode` is absent or `"single"`, use single-attachment mode (existing behavior, `attachmentId` required at top level). If `mode` is `"batch"` but a top-level `attachmentId` is also present, return `400` with `"Cannot specify both mode:batch and top-level attachmentId"`.

### Response

Identical shape to today — a flat `verifications` object keyed by citation key. The caller doesn't need to know which attachment each result came from:

```jsonc
{
  "verifications": {
    "key1": { "status": "found", "verifiedFullPhrase": "...", ... },
    "key2": { "status": "partial_text_found", ... }
  }
}
```

### Validation

- Every citation in batch mode MUST have an `attachmentId` field. If any citation is missing it, return `400` with `"Every citation must include attachmentId in batch mode"`.
- All referenced `attachmentId` values must exist and belong to the caller. Invalid IDs fail individually (that citation gets `status: "error"`) — the rest succeed.
- Max citations per request: 500 (same limit, whether single or batch).
- Max distinct attachments per batch: 50.

## Internal Processing

```
1. Group citations by attachmentId
2. For each group, dispatch to existing single-attachment verify pipeline (in parallel)
3. Merge all results into one verifications object
4. If any attachment fails entirely (e.g., deleted), set all its citations to status: "error"
5. Return merged response
```

The per-attachment verification logic is unchanged. Batch mode is purely a fan-out/merge layer.

## Billing

Each attachment in the batch is billed as a **separate verification call**, same as today. A batch with 3 attachments and 50 citations costs the same as 3 individual calls. No discount, no surcharge — batch is a convenience feature, not a pricing one.

Billing line items should include the batch request ID so customers can correlate.

## Migration

### Phase 1: Ship batch mode (non-breaking)
- Add batch detection to `/verifyCitations`
- Existing single-attachment callers are unaffected
- Update API docs with batch examples

### Phase 2: Update clients
- Update `deepcitation` npm package's verify function to use batch mode by default
- Update `/verify` skill's Step 3 to send one batch request instead of N requests
- Remove the merge-responses script from SKILL.md

### Phase 3: Deprecate nothing
- Single-attachment mode remains supported indefinitely
- Batch mode is the recommended default for new integrations

## Success Metrics

- **Skill reliability**: Zero "wrong attachmentId" bugs in `/verify` runs (currently ~5% of runs)
- **Latency**: p50 batch verify < 1.2x slowest single-attachment (fan-out overhead only)
- **Adoption**: >80% of verify calls use batch mode within 30 days of SDK update

## Open Questions

1. **Streaming**: Should batch mode support streaming results as each attachment completes? Useful for progress UIs but adds complexity.
2. **Partial retry**: If 1 of 5 attachments fails, should the client retry just that attachment? Or should the API auto-retry internally?
3. **Rate limiting**: Should batch count as 1 request or N requests for rate-limit purposes? Recommendation: count as N (matches billing).
