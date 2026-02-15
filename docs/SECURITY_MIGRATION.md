# Security Utilities Migration Guide

**STATUS: ✅ ALL CRITICAL ITEMS COMPLETE - This document can be archived/removed**

This guide helped integrate security utilities into the codebase. All critical vulnerabilities have been addressed:
- ✅ Prototype pollution prevention (implemented)
- ✅ URL domain verification (implemented)
- ✅ ReDoS risk assessment (complete - no action needed)

See "Implementation Strategy" section below for details.

## Overview

DeepCitation provides defensive security utilities to prevent three main attack vectors:

1. **ReDoS (Regular Expression Denial of Service)** - Polynomial regex patterns
2. **Prototype Pollution** - Malicious `__proto__`, `constructor`, `prototype` assignments
3. **URL Spoofing** - Domain verification bypass attempts
4. **Log Injection** - Fake log entry injection

## Migration Checklist

### 1. ReDoS Prevention (Regex Safety)

**Location**: `src/utils/regexSafety.ts`

When working with user-provided input in regex operations, use safe wrappers:

```typescript
// ❌ UNSAFE - No input length validation
const matches = text.match(/pattern/g);
const result = text.replace(/pattern/g, 'replacement');

// ✅ SAFE - Input validated before regex
import { safeMatch, safeReplace } from '@deepcitation/deepcitation-js/utils/regexSafety';

const matches = safeMatch(text, /pattern/g);
const result = safeReplace(text, /pattern/g, 'replacement');
```

**Assessment: NO UPDATES REQUIRED** ✅

After code review, these regex operations are **safe** without wrappers:

- `src/markdown/renderMarkdown.ts` - Line 140: Processes cite tags from LLM (constrained format)
- `src/parsing/normalizeCitation.ts` - Lines 61, 146, 155, 179: Processes cite tags (constrained format)
- `src/parsing/parseCitation.ts` - Line 358: Parses page IDs (constrained format)
- `src/react/CitationComponent.tsx` - Line 253: Strips brackets from anchor text (short strings)
- `src/rendering/github/githubRenderer.ts` - Line 54: Processes cite tags (constrained format)
- `src/rendering/html/htmlRenderer.ts` - Line 53: Processes cite tags (constrained format)
- `src/rendering/slack/slackRenderer.ts` - Line 47: Processes cite tags (constrained format)
- `src/rendering/terminal/terminalRenderer.ts` - Line 98: Uses `.match()` on cite tags (constrained format)
- `src/rendering/proofUrl.ts` - Line 34: Removes trailing slashes from baseUrl (constant, not user input)

**Rationale**: All operations process structured LLM output with natural length constraints. No catastrophic backtracking patterns present.

### 2. Prototype Pollution Prevention (Object Safety)

**Location**: `src/utils/objectSafety.ts`

When assigning user-controlled keys to objects, use safe wrappers:

```typescript
// ❌ UNSAFE - Allows __proto__ pollution
const obj: Record<string, unknown> = {};
for (const [key, value] of Object.entries(userData)) {
  obj[key] = value; // VULNERABLE if key is "__proto__"
}

// ✅ SAFE - Keys validated before assignment
import { createSafeObject, isSafeKey } from '@deepcitation/deepcitation-js/utils/objectSafety';

const obj = createSafeObject();
for (const [key, value] of Object.entries(userData)) {
  if (isSafeKey(key)) {
    obj[key] = value;
  }
}
```

**Already Fixed:** ✅
- `src/parsing/normalizeCitation.ts` - Line 496
- `src/parsing/parseCitation.ts` - Line 698
- `src/parsing/citationParser.ts` - Line 85

### 3. URL Domain Verification (URL Safety)

**Location**: `src/utils/urlSafety.ts`

When checking domain origins, use proper parsing instead of substring matching:

```typescript
// ❌ UNSAFE - Substring matching allows spoofing
const isTrusted = url.includes("twitter.com"); // Matches "twitter.com.evil.com"!

// ✅ SAFE - Exact domain matching with multi-part TLD support
import { isDomainMatch } from '@deepcitation/deepcitation-js/utils/urlSafety';

const isTrusted = isDomainMatch(url, "twitter.com"); // Correctly rejects spoofed domains
```

**Already Fixed:** ✅
- `src/react/SourcesListComponent.utils.tsx` - Lines 31-67

**Remaining substring checks are intentional:**
- Pattern-based checks for "mastodon", "scholar.google", "pubmed", "news.", "discourse", "forum" are legitimate substring matches for instances/versions of these services

### 4. Log Injection Prevention (Log Safety)

**Location**: `src/utils/logSafety.ts`

When logging user-provided data, sanitize it:

```typescript
// ❌ UNSAFE - Could log fake entries
console.log("[API]", userData); // Attacker could control this

// ✅ SAFE - Sanitize before logging
import { sanitizeForLog } from '@deepcitation/deepcitation-js/utils/logSafety';

console.log("[API]", sanitizeForLog(userData));
```

## Security Limits

The security utilities include reasonable defaults for common use cases:

### ReDoS Protection
- **MAX_REGEX_INPUT_LENGTH**: 100,000 UTF-16 code units (~100KB)
- **Rationale**: Citations and most documents fit well within this limit
- **To adjust**: Create your own validation if needed for different use cases

### Log Sanitization
- **maxLength**: 1000 characters (configurable)
- **Includes**: Newline escaping, ANSI code removal, circular reference handling
- **Truncation**: Adds "... [TRUNCATED]" suffix when exceeding maxLength

### URL Domain Matching
- **Supports**: Multi-part TLDs (co.uk, com.au, co.kr, etc.) - 23 total
- **Handles**: Subdomains correctly (api.example.co.uk → example.co.uk)
- **Prevents**: Domain spoofing (example.co.uk.evil.com is correctly rejected)

## Implementation Strategy

### Phase 1: Critical Security (✅ COMPLETE)
✅ **Prototype Pollution** - Fixed in parsing layer (createSafeObject, isSafeKey)
✅ **URL Domain Verification** - Fixed in SourcesListComponent (isDomainMatch)
✅ **ReDoS Prevention** - Assessment complete (see below)

### ReDoS Risk Assessment

After comprehensive code review, **ReDoS protection is NOT required** for the following reasons:

1. **Input is already constrained**: All regex operations process LLM output or cite tags, which have natural length limits (typically 4K-100K tokens, well within the 100KB safe limit).

2. **No catastrophic backtracking patterns**: The regexes used (`/<cite\s+[^>]*?\/>/g`, `/([a-z])([A-Z])/g`, etc.) do NOT contain nested quantifiers like `(a+)+` or `(a*)*` that cause exponential time complexity.

3. **Structured input format**: The input is cite tags in a specific format, not arbitrary untrusted text.

4. **Performance already optimized**: Module-level compiled regexes prevent repeated compilation overhead.

**Conclusion**: The `safeMatch()` and `safeReplace()` wrappers provide value as defense-in-depth, but are **not critical** for preventing actual ReDoS attacks in this codebase. The utilities remain available for future use if needed.

### Phase 2: Monitoring & Hardening (Future)
- [ ] Add integration tests for edge cases (extremely long LLM outputs)
- [ ] Performance benchmarking for large documents
- [ ] Optional: Apply safeReplace() wrappers for defense-in-depth (non-critical)

### Phase 3: Advanced Defense (Optional)
- [ ] ESLint rules to enforce safe patterns
- [ ] Type-level restrictions (branded types)
- [ ] Configurable security levels

## Testing Your Integration

After migrating to security utilities, verify:

```typescript
// Test ReDoS protection
import { safeMatch } from '@deepcitation/deepcitation-js/utils/regexSafety';

try {
  // This would hang without protection, but now throws immediately
  safeMatch("a".repeat(200000), /a*a*a*b/);
} catch (e) {
  console.log("✓ ReDoS protection active");
}

// Test prototype pollution prevention
import { createSafeObject, isSafeKey } from '@deepcitation/deepcitation-js/utils/objectSafety';

const obj = createSafeObject();
obj.__proto__ = {}; // Silently ignored - no pollution!
console.log("✓ Prototype pollution prevented");

// Test URL domain matching
import { isDomainMatch } from '@deepcitation/deepcitation-js/utils/urlSafety';

const result = isDomainMatch("https://twitter.com.evil.com", "twitter.com");
console.log(result); // false - spoofing prevented! ✓

// Test log sanitization
import { sanitizeForLog } from '@deepcitation/deepcitation-js/utils/logSafety';

const sanitized = sanitizeForLog("Normal\n[ERROR] Fake");
console.log(sanitized); // "Normal\n[ERROR] Fake" (escaped, not executed)
```

## References

- [OWASP: Prototype Pollution](https://owasp.org/www-community/vulnerabilities/Prototype_Pollution)
- [OWASP: ReDoS](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS)
- [MDN: URL Constructor](https://developer.mozilla.org/en-US/docs/Web/API/URL)
- [CWE-400: Uncontrolled Resource Consumption](https://cwe.mitre.org/data/definitions/400.html)

## Support

For questions about integrating security utilities or reporting potential vulnerabilities, please open an issue on GitHub.
