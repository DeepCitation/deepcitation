# Plan: Verification Stats + Better Error Surfacing

## Context

The existing `verify()` method works well but has two gaps:
1. Returns raw verifications with no aggregate stats — developers must compute success rates themselves
2. Common failure modes (missing attachmentId, empty output) produce silent skips or unhelpful errors

Both improvements are backward-compatible additions. No breaking changes.

---

## 1. Verification Stats

Add a `computeVerificationStats()` utility and include stats in `verify()` response.

### Stats Shape

```typescript
interface VerificationStats {
  total: number;
  verified: number;   // "found", "found_phrase_missed_anchor_text"
  partial: number;    // "found_anchor_text_only", "partial_text_found", "found_on_other_page", "found_on_other_line", "first_word_found"
  notFound: number;   // "not_found"
  pending: number;    // "loading", "pending", null, undefined
  skipped: number;    // "skipped"
  successRate: number; // (verified + partial) / (total - pending - skipped), or 0 if denominator is 0
}
```

Categories align exactly with existing `getCitationStatus()` in `src/parsing/parseCitation.ts:146-166`.

### Changes

**`src/parsing/parseCitation.ts`** — Add `computeVerificationStats()`:
```typescript
export function computeVerificationStats(
  verifications: Record<string, Verification>
): VerificationStats {
  // Uses getCitationStatus() for each verification to categorize
  // successRate = (verified + partial) / (total - pending - skipped)
}
```

This goes in `parseCitation.ts` alongside `getCitationStatus()` since it's the canonical location for status computation. It's a pure function — takes verifications, returns stats.

**`src/client/types.ts`** — Extend `VerifyCitationsResponse`:
```typescript
export interface VerifyCitationsResponse {
  verifications: Record<string, Verification>;  // unchanged
  stats: VerificationStats;                      // NEW
}
```

**`src/client/DeepCitation.ts`** — Compute stats in `verify()` (line ~763, after aggregating all verifications):
```typescript
import { computeVerificationStats } from "../parsing/parseCitation.js";
// ...
return { verifications: allVerifications, stats: computeVerificationStats(allVerifications) };
```

Also add stats in `verifyAttachment()` response (line ~658, after receiving backend response).

**`src/index.ts`** — Export `computeVerificationStats` and `VerificationStats` type.

### Test

**`src/__tests__/verificationStats.test.ts`** — New test file:
- All verified → `{ successRate: 1.0, verified: N, partial: 0, notFound: 0 }`
- Mixed results → correct categorization
- All pending → `successRate: 0` (no denominator)
- Empty verifications → `{ total: 0, successRate: 0 }`
- Skipped citations excluded from successRate denominator

---

## 2. Better Error Surfacing

### 2a. Missing attachmentId warning

**Current** (`DeepCitation.ts:748-750`): `this.logger.warn?.(...)` + silent `{ status: "skipped" }`.

**Improved**: Keep existing behavior (no breaking change) but enrich the skipped verification with a `reason` field:
```typescript
allVerifications[key] = {
  status: "skipped",
  verifiedMatchSnippet: "Citation missing attachmentId. Ensure deepTextPromptPortion was included in the LLM prompt and the LLM followed citation format.",
};
```

Uses `verifiedMatchSnippet` (existing field on `Verification`, type `string | null`) to carry the explanation. No type changes needed — just a more helpful value.

### 2b. Empty llmOutput

**Current**: `verify({ llmOutput: "" })` returns `{ verifications: {} }` silently.

**Improved**: Log a debug message. No error — empty input → empty output is correct behavior. Just make it visible:
```typescript
if (!llmOutput || llmOutput.trim().length === 0) {
  this.logger.debug?.("verify() called with empty llmOutput");
  return { verifications: {}, stats: computeVerificationStats({}) };
}
```

### 2c. Improved logging for skipped citations

**Current**: `"${skippedCount} citation(s) skipped: missing attachmentId"`.

**Improved**: Include which citation numbers were skipped so the developer can debug:
```typescript
const skippedKeys = Object.keys(fileCitations);
const skippedNumbers = Object.values(fileCitations)
  .map(c => c.citationNumber)
  .filter(Boolean);
this.logger.warn?.("Citations skipped: missing attachmentId", {
  skippedCount,
  citationNumbers: skippedNumbers,
  hint: "Ensure deepTextPromptPortion is included in the LLM prompt",
});
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/parsing/parseCitation.ts` | Add `computeVerificationStats()` function |
| `src/client/types.ts` | Add `VerificationStats` interface, add `stats` to `VerifyCitationsResponse` |
| `src/client/DeepCitation.ts` | Import and call `computeVerificationStats()` in both `verify()` and `verifyAttachment()`. Improve skipped citation messages. |
| `src/index.ts` | Export `computeVerificationStats` and `VerificationStats` type |
| `src/__tests__/verificationStats.test.ts` | New test file for stats computation |
| `src/__tests__/client.test.ts` | Update existing tests to expect `stats` in verify responses |

---

## Verification

1. `bun test src/__tests__/verificationStats.test.ts` — new stats tests pass
2. `bun test src/__tests__/client.test.ts` — existing tests updated and pass
3. `node /mnt/c/Users/Ben/workspace/mono-repo/node_modules/typescript/bin/tsc --noEmit --project /mnt/c/Users/Ben/workspace/mono-repo/packages/deepcitation-js/tsconfig.json` — types check
4. Verify `stats` appears in response when calling `verify()` against a real LLM output
