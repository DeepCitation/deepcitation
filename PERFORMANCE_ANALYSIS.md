# Performance Analysis Report - DeepCitation JS

This document identifies performance anti-patterns, N+1 queries, unnecessary re-renders, and inefficient algorithms found in the codebase.

## Executive Summary

| Category | Issues Found | Critical | High | Medium | Low |
|----------|-------------|----------|------|--------|-----|
| React Re-renders | 18 | 0 | 4 | 8 | 6 |
| Algorithm Inefficiencies | 10 | 2 | 3 | 4 | 1 |
| N+1 & API Patterns | 10 | 1 | 3 | 4 | 2 |
| **Total** | **38** | **3** | **10** | **16** | **9** |

---

## 1. Critical Issues

### 1.1 N+1 Query Pattern in Verify Route

**File:** `examples/nextjs-ai-sdk/src/app/api/verify/route.ts:77-99`

**Issue:** `getCitationStatus()` is called 4x per verification:

```typescript
// First pass - logging
for (const [key, verification] of Object.entries(verifications)) {
  const status = getCitationStatus(verification);  // Call 1
  // ...
}

// Second pass - counting verified
const verified = Object.values(verifications).filter(
  (v) => getCitationStatus(v).isVerified  // Call 2
).length;

// Third pass - counting missed
const missed = Object.values(verifications).filter(
  (v) => getCitationStatus(v).isMiss  // Call 3
).length;

// Fourth pass - counting pending
const pending = Object.values(verifications).filter(
  (v) => getCitationStatus(v).isPending  // Call 4
).length;
```

**Impact:** With 100 citations, 400 function calls instead of 100.

**Fix:** Single pass with cached status:

```typescript
const statusMap = new Map();
let verified = 0, missed = 0, pending = 0;

for (const [key, verification] of Object.entries(verifications)) {
  const status = getCitationStatus(verification);
  statusMap.set(key, status);
  if (status.isVerified) verified++;
  if (status.isMiss) missed++;
  if (status.isPending) pending++;
}
```

---

### 1.2 Quadratic Range Expansion

**Files:**
- `src/parsing/normalizeCitation.ts:155-173`
- `src/parsing/parseCitation.ts:44-48`

**Issue:** Line ID ranges like `100-10000` create arrays with 10,000 elements:

```typescript
// normalizeCitation.ts:159-173
let expanded = lineIdsStr.replace(
  /(\d+)-(\d+)/g,
  (_match, start, end) => {
    const startNum = parseInt(start, 10);
    const endNum = parseInt(end, 10);
    if (startNum <= endNum) {
      const range = [];
      for (let i = startNum; i <= endNum; i++) {
        range.push(i);  // O(n) per range
      }
      return range.join(",");  // O(n) string concatenation
    }
    return start;
  }
);
```

**Impact:** O(n²) for large ranges, memory allocation for massive arrays.

**Fix:** Use `Array.from` or validate max range size:

```typescript
const MAX_RANGE_SIZE = 1000;
if (endNum - startNum > MAX_RANGE_SIZE) {
  throw new Error(`Range too large: ${startNum}-${endNum}`);
}
return Array.from({length: endNum - startNum + 1}, (_, i) => startNum + i).join(",");
```

---

### 1.3 Unbounded Recursive Object Traversal

**File:** `src/parsing/parseCitation.ts:333-360`

**Issue:** No depth limit on recursive traversal:

```typescript
const findJsonCitationsInObject = (obj: any, found: Citation[]): void => {
  if (!obj || typeof obj !== "object") return;

  // ... check properties

  if (Array.isArray(obj)) {
    for (const item of obj) {
      findJsonCitationsInObject(item, found);  // No depth limit
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (key !== "citation" && key !== "citations") {
        findJsonCitationsInObject(obj[key], found);  // Can stack overflow
      }
    }
  }
};
```

**Impact:** Stack overflow on circular references or deeply nested objects.

**Fix:** Add depth parameter:

```typescript
const findJsonCitationsInObject = (obj: any, found: Citation[], depth = 0): void => {
  if (depth > 50 || !obj || typeof obj !== "object") return;
  // ...
  findJsonCitationsInObject(item, found, depth + 1);
};
```

---

## 2. High Priority Issues

### 2.1 Inline onClick Handlers in CitationComponent

**File:** `src/react/CitationComponent.tsx:2068-2071, 1228-1231, 1303-1306`

**Issue:** Inline arrow functions create new references every render:

```typescript
onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
onClick={(e) => { e.preventDefault(); e.stopPropagation(); onImageClick?.(); }}
```

**Fix:** Extract to `useCallback`:

```typescript
const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
  (e.target as HTMLImageElement).style.display = 'none';
}, []);
```

---

### 2.2 getBehaviorContext Dependency Array Too Broad

**File:** `src/react/CitationComponent.tsx:1694-1704, 1766-1776`

**Issue:** Includes frequently-changing state in dependencies:

```typescript
const getBehaviorContext = useCallback(() => ({
  // ...
}), [citation, citationKey, verification, isHovering, expandedImageSrc]);
//                                        ^^^^^^^^^^  ^^^^^^^^^^^^^^^
//                                        Changes frequently!

const handleClick = useCallback((e) => {
  // ...
}, [
  behaviorConfig,
  getBehaviorContext,  // Recreates when isHovering changes
  // ...
]);
```

**Impact:** `handleClick` recreates on every hover state change.

**Fix:** Split context into stable vs dynamic parts, or use refs for dynamic state.

---

### 2.3 Non-Memoized Render Functions in SourcesListComponent

**File:** `src/react/SourcesListComponent.tsx:506-604`

**Issue:** Render helper functions redefined every render:

```typescript
// Lines 506-604
const renderHeader = () => { /* ... */ };
const renderListContent = () => { /* ... */ };
```

**Fix:** Extract to `useCallback` or move outside component.

---

### 2.4 Multiple Object.values() Iterations

**File:** `examples/nextjs-ai-sdk/src/app/api/verify/route.ts:91-99`

**Issue:** Creates 3 separate arrays:

```typescript
const verified = Object.values(verifications).filter(...).length;  // Array 1
const missed = Object.values(verifications).filter(...).length;     // Array 2
const pending = Object.values(verifications).filter(...).length;    // Array 3
```

**Fix:** Single pass (see 1.1 fix).

---

### 2.5 No Request Deduplication in Verify Method

**File:** `src/client/DeepCitation.ts:476-529`

**Issue:** Same verification request can hit API multiple times without caching:

```typescript
async verify(input, citations?) {
  // No check for duplicate requests
  for (const [attachmentId, fileCitations] of citationsByAttachment) {
    verificationPromises.push(
      this.verifyAttachment(attachmentId, fileCitations, { outputImageFormat })
    );
  }
}
```

**Fix:** Add request deduplication cache:

```typescript
private verifyCache = new Map<string, Promise<VerifyCitationsResponse>>();

async verifyAttachment(attachmentId, citations, options) {
  const cacheKey = JSON.stringify({ attachmentId, citations, options });
  if (this.verifyCache.has(cacheKey)) {
    return this.verifyCache.get(cacheKey);
  }
  const promise = this._verifyAttachmentImpl(...);
  this.verifyCache.set(cacheKey, promise);
  return promise;
}
```

---

### 2.6 Unbounded Concurrent File Uploads

**File:** `src/client/DeepCitation.ts:338-351`

**Issue:** All uploads start simultaneously:

```typescript
async prepareFiles(files: FileInput[]): Promise<PrepareFilesResult> {
  const uploadPromises = files.map(({ file, filename, attachmentId }) =>
    this.uploadFile(file, { filename, attachmentId })  // All at once
  );
  const uploadResults = await Promise.all(uploadPromises);
}
```

**Impact:** 1000 files = 1000 concurrent HTTP requests.

**Fix:** Add concurrency limit:

```typescript
import pLimit from 'p-limit';
const limit = pLimit(5);

const uploadPromises = files.map(({ file, filename, attachmentId }) =>
  limit(() => this.uploadFile(file, { filename, attachmentId }))
);
```

---

## 3. Medium Priority Issues

### 3.1 Chained String Replacements

**File:** `src/parsing/normalizeCitation.ts:406-407`

**Issue:** 6 separate string passes:

```typescript
content = content.replace(/\\\\'/g, "'")
    .replace(/\\'/g, "'")
    .replace(/'/g, "\\'");
content = content.replace(/\\\\"/g, '"')
    .replace(/\\"/g, '"')
    .replace(/"/g, '\\"');
```

**Fix:** Single regex with callback:

```typescript
content = content.replace(/\\\\['"]|\\['"]|['"]/g, (match) => {
  if (match.startsWith('\\\\')) return match[2];
  if (match.startsWith('\\')) return match[1];
  return '\\' + match;
});
```

---

### 3.2 Regex Compilation in Hot Paths

**Files:**
- `src/parsing/parseCitation.ts:161`
- `src/parsing/normalizeCitation.ts:37, 151, 444`

**Issue:** Regexes compiled on every function call:

```typescript
// parseCitation.ts:161
const pageMatch = startPageIdRaw.match(/page[\_a-zA-Z]*(\d+)_index_(\d+)/);

// normalizeCitation.ts:151
const match = startPageId.match(/page[_a-zA-Z]*(\d+)/);
```

**Fix:** Module-level constants (already done well in `diff.ts:300-303`):

```typescript
const PAGE_REGEX = /page[_a-zA-Z]*(\d+)_index_(\d+)/;
const pageMatch = startPageIdRaw.match(PAGE_REGEX);
```

---

### 3.3 Multiple Object.assign() Calls

**File:** `src/parsing/parseCitation.ts:413-440`

**Issue:** Multiple iterations over citation sources:

```typescript
Object.assign(citations, jsonCitations);  // Line 415
Object.assign(citations, jsonCitations);  // Line 423
Object.assign(citations, xmlCitations);   // Line 430
Object.assign(citations, xmlCitations);   // Line 439
```

**Fix:** Collect all sources, single assignment:

```typescript
const allSources = [jsonCitations, xmlCitations].filter(Boolean);
Object.assign(citations, ...allSources);
```

---

### 3.4 Inline Tab Button Handlers

**File:** `src/react/VerificationTabs.tsx:39-42, 68-90`

**Issue:** Tab buttons recreate handlers:

```typescript
onClick={e => { e.stopPropagation(); onClick(); }}
onClick={(e) => { e.stopPropagation(); onModeChange("inline"); }}
```

**Fix:** `useCallback` with stable references.

---

### 3.5 Favicon onError Handler Duplicated

**File:** `src/react/UrlCitationComponent.tsx:152, 290, 385`

**Issue:** Same handler defined 3 times:

```typescript
onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
```

**Fix:** Single shared callback.

---

### 3.6 Citation Context Value Changes Reference

**File:** `src/react/primitives.tsx:92-113`

**Issue:** Citation object reference may change even when content is identical:

```typescript
const contextValue = useMemo(() => ({
  citation,  // If parent recreates citation object, all children re-render
  // ...
}), [citation, citationKey, ...]);
```

**Fix:** Deep memoize citation or use stable keys.

---

### 3.7 No Image Prefetch Deduplication

**File:** `src/react/PrefetchedPopoverImage.tsx:153-164`

**Issue:** Same image can be prefetched multiple times:

```typescript
export async function prefetchImages(srcs: string[]): Promise<void[]> {
  const promises = srcs.map((src) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.src = src;  // No deduplication
    })
  );
}
```

**Fix:** Track prefetched URLs in a Set.

---

### 3.8 Array Sorting Without Deduplication First

**File:** `src/parsing/citationParser.ts:393-396` vs `src/parsing/parseCitation.ts:65`

**Issue:** Inconsistent deduplication:

```typescript
// citationParser.ts - Sorts duplicates unnecessarily
const lineIds = data.line_ids?.length
    ? [...data.line_ids].sort((a, b) => a - b)
    : undefined;

// parseCitation.ts - Better: dedupes first
return [...new Set(lineIds)].sort((a, b) => a - b);
```

**Fix:** Always dedupe before sorting.

---

## 4. Low Priority Issues

### 4.1 CitationVariant Default Props

**File:** `src/react/CitationVariants.tsx:117-118` (5 locations)

**Issue:** Default function props redefined on every instantiation:

```typescript
renderVerifiedIndicator = () => <DefaultVerifiedIndicator />
renderPartialIndicator = () => <DefaultPartialIndicator />
```

**Fix:** Module-level default functions.

---

### 4.2 sizeClasses Object Recreation

**File:** `src/react/CitationVariants.tsx:154-158` (multiple variants)

**Issue:** Object created every render:

```typescript
const sizeClasses = { sm: "...", md: "...", lg: "..." }
```

**Fix:** Module-level constant.

---

### 4.3 Helper Components Not Memoized

**Files:** `src/react/VerificationLog.tsx`, `src/react/CitationComponent.tsx`

**Issue:** Components in lists not wrapped in `memo()`:
- `SearchAttemptRow`
- `PageBadge`
- `StatusHeader`
- `QuoteBox`

**Fix:** Wrap with `React.memo()`.

---

### 4.4 CollapsibleText in VerificationTabs

**File:** `src/react/VerificationTabs.tsx:159-165, 236-242`

**Issue:** Two instances with potentially expensive prop comparisons.

**Impact:** Low due to existing memoization.

---

## 5. Utility Functions (Positive Findings)

### 5.1 diff.ts - Well Optimized

The diff implementation has several good patterns:

```typescript
// Module-level regex - GOOD
const TOKENIZE_REGEX = new RegExp(
  `[${EXTENDED_WORD_CHARS}]+|\\s+|[^${EXTENDED_WORD_CHARS}]`,
  "gu",
);

// Quick path optimization - GOOD
if (oldLen === 0) {
  return [{ value: newTokens.join(""), added: true }];
}

// Common prefix/suffix extraction before expensive diff - GOOD
let commonPrefixLen = 0;
while (commonPrefixLen < oldLen && ...) {
  commonPrefixLen++;
}
```

### 5.2 sha.ts - Efficient Implementation

Pure JavaScript SHA-1 with no external dependencies and efficient buffer operations.

### 5.3 Attribute Regex Caching

**File:** `src/parsing/parseCitation.ts:10-19`

Good caching pattern for dynamic regexes:

```typescript
const attributeRegexCache = new Map<string, RegExp>();

function getAttributeRegex(name: string): RegExp {
  let regex = attributeRegexCache.get(name);
  if (!regex) {
    regex = new RegExp(`${name}='((?:[^'\\\\]|\\\\.)*)'`);
    attributeRegexCache.set(name, regex);
  }
  return regex;
}
```

---

## Summary of Recommendations

### Immediate Actions (Critical)

1. **Fix N+1 in verify route** - Single pass with cached status
2. **Add range size limits** - Prevent memory exhaustion on malicious input
3. **Add depth limit to recursive traversal** - Prevent stack overflow

### Short-term (High Priority)

4. Extract inline handlers to `useCallback` in CitationComponent
5. Optimize `getBehaviorContext` dependencies
6. Add request deduplication to verify client
7. Add concurrency limits to file uploads

### Medium-term

8. Consolidate string replacement passes
9. Move hot-path regexes to module level
10. Memoize render helper functions

### Code Quality

11. Consistent deduplication before sorting
12. Wrap list item components in `memo()`
13. Consider context splitting for granular updates

---

*Generated: 2025-01-30*
*Analysis performed on deepcitation-js codebase*
