# Code Style Guide

This document outlines the coding standards and conventions for the DeepCitation TypeScript/JavaScript codebase.

## Import Ordering

**Automatic Organization:** Import statements are automatically organized by Biome when you save files or run formatting commands. This is configured in `biome.json`:

```json
"assist": {
  "enabled": true,
  "actions": {
    "source": {
      "organizeImports": "on"
    }
  }
}
```

**Organization Rules:**
1. **Built-in modules** (Node.js standard library) come first
2. **External dependencies** (from node_modules) come next
3. **Internal imports** (relative paths) come last
4. Within each group, imports are sorted alphabetically

**Example:**
```typescript
// 1. Built-in modules
import { readFile } from "fs/promises";

// 2. External dependencies
import { describe, expect, it } from "@jest/globals";

// 3. Internal imports (alphabetically)
import { getCitationStatus } from "../../parsing/parseCitation.js";
import { generateCitationKey } from "../../react/utils.js";
import type { Citation } from "../../types/citation.js";
```

**Type-only imports:** Prefer using `import type` for type-only imports to improve tree-shaking and build performance:
```typescript
import type { Citation, Verification } from "../types/citation.js";
```

## Code Conventions

### Loops

**Prefer `while` loops over `for(;;)`** for regex exec loops:

```typescript
// ✓ Good: Clear and idiomatic
let match: RegExpExecArray | null;
while ((match = regex.exec(text)) !== null) {
  // process match
}

// ✗ Avoid: Less clear
for (;;) {
  match = regex.exec(text);
  if (!match) break;
  // process match
}
```

### Regex Patterns

**Use module-level regex directly in `replace()` calls** since `replace()` handles `lastIndex` reset automatically:

```typescript
// Module-level compiled regex
const CITE_TAG_REGEX = /<cite\s+[^>]*?\/>/g;

// ✓ Good: Use directly in replace()
const result = input.replace(CITE_TAG_REGEX, match => {
  // ...
});

// ✗ Avoid: Unnecessary new RegExp for replace()
const regex = new RegExp(CITE_TAG_REGEX.source, CITE_TAG_REGEX.flags);
const result = input.replace(regex, match => {
  // ...
});
```

**Create fresh instances for `exec()` loops** to avoid stateful `lastIndex` issues:

```typescript
// ✓ Good: Fresh instance for exec() loop
const attrRegex = new RegExp(ATTR_REGEX_PATTERN.source, ATTR_REGEX_PATTERN.flags);
let match: RegExpExecArray | null;
while ((match = attrRegex.exec(citeTag)) !== null) {
  // ...
}
```

### Variable Re-exports

**Never re-export variables** (functions, constants, classes). Each symbol should have one canonical location:

```typescript
// ✗ Bad: Re-exporting from another module
export { getCitationStatus } from "../../parsing/parseCitation.js";

// ✓ Good: Import directly from canonical location
import { getCitationStatus } from "../../parsing/parseCitation.js";
```

See CLAUDE.md for the canonical locations table.

## Formatting

Run Biome formatter to automatically format code:

```bash
# Format all files
bun run format

# Check formatting without modifying files
bun run format:check
```

## Linting

Run Biome linter to check for issues:

```bash
# Lint all files
bun run lint

# Auto-fix issues where possible
bun run lint:fix
```

## Testing

All new code should include tests. Run tests with:

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/myfile.test.ts

# Run tests in watch mode
bun test --watch
```

## TypeScript

**Use explicit return types** for public API functions:

```typescript
// ✓ Good
export function parseCiteAttributes(citeTag: string): Record<string, string | undefined> {
  // ...
}

// ✗ Avoid for public APIs
export function parseCiteAttributes(citeTag: string) {
  // ...
}
```

**Prefer interfaces over type aliases** for object shapes:

```typescript
// ✓ Good
interface Citation {
  attachmentId?: string;
  pageNumber?: number;
  // ...
}

// ✗ Avoid
type Citation = {
  attachmentId?: string;
  pageNumber?: number;
  // ...
}
```

## Comments

**Document complex algorithms and non-obvious behavior:**

```typescript
/**
 * Parses a page_id string to extract page number and index.
 * Supports both compact "N_I" format and legacy "page_number_N_index_I" format.
 *
 * Page numbers are 1-indexed (page 1 is the first page). If page_id is "0_0"
 * (both page and index are 0), it will be auto-corrected to page 1, index 0.
 * Other cases like "0_5" are left as-is since they are ambiguous.
 */
function parsePageId(pageId: string): { pageNumber?: number; startPageId?: string } {
  // ...
}
```

**Avoid obvious comments:**

```typescript
// ✗ Bad: Comment states the obvious
// Increment the counter
counter++;

// ✓ Good: No comment needed
counter++;
```

## File Organization

**Group related functionality:**
- Types in `src/types/`
- React components in `src/react/`
- Parsing logic in `src/parsing/`
- Rendering logic in `src/rendering/`
- Tests in `src/__tests__/`

**Keep files focused:**
- Each file should have a single, clear purpose
- Avoid "kitchen sink" utility files
- Split large files (>500 lines) into smaller, focused modules
