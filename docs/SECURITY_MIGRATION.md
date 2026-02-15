# Security Utilities Migration Guide

This guide helps you integrate the new security utilities into your code to prevent common vulnerabilities.

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

**Files to Update:**
- `src/markdown/renderMarkdown.ts` - Line 140
- `src/parsing/normalizeCitation.ts` - Lines 57, 145, 166, 178
- `src/parsing/parseCitation.ts` - Line 357
- `src/react/CitationComponent.tsx` - Line 253
- `src/rendering/github/githubRenderer.ts` - Line 54
- `src/rendering/html/htmlRenderer.ts` - Line 53
- `src/rendering/slack/slackRenderer.ts` - Line 47
- `src/rendering/terminal/terminalRenderer.ts` - Line 98
- `src/rendering/proofUrl.ts` - Line 34

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

### Phase 1: Critical Security (Current)
✅ **Prototype Pollution** - Fixed in parsing layer
✅ **URL Domain Verification** - Fixed in SourcesListComponent
⏳ **ReDoS Prevention** - Ready for integration

### Phase 2: Comprehensive Coverage (Future PR)
- [ ] Integrate regex safety wrappers in rendering modules
- [ ] Add integration tests for vulnerable patterns
- [ ] Performance benchmarking

### Phase 3: Advanced Defense
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
