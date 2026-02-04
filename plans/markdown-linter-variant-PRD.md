# Plan: Add Styled Underline Support to Markdown Citation Output

## Summary

Add a new `"linter"` variant to the markdown output module that renders citations with HTML `<span>` tags containing styled underlines (solid, dashed, wavy) based on verification status, mirroring the React CitationComponent linter variant.

## Current State

The markdown module (`src/markdown/`) outputs plain markdown text with 6 variants:
- `inline`, `brackets`, `superscript`, `footnote`, `academic`, `minimal`

None support styled underlines. The React component (`src/react/CitationComponent.tsx:2534-2615`) has a `linter` variant that uses semantic underlines via CSS `text-decoration`:
- **Verified**: solid green underline
- **Partial**: dashed amber underline
- **Not Found**: wavy red underline
- **Pending**: dotted gray underline

## Implementation Plan

### 1. Add `"linter"` to `MarkdownVariant` type

**File**: `src/markdown/types.ts:8-14`

Add `"linter"` to the union type:
```typescript
export type MarkdownVariant =
  | "inline"
  | "brackets"
  | "superscript"
  | "footnote"
  | "academic"
  | "minimal"
  | "linter";    // HTML spans with semantic underlines
```

### 2. Add underline style configuration options

**File**: `src/markdown/types.ts:43-77`

Add new options to `RenderMarkdownOptions`:
```typescript
export interface RenderMarkdownOptions {
  // ... existing options ...

  /**
   * Underline style mapping for linter variant (status -> CSS style).
   * Defaults match React CitationComponent linter variant.
   */
  underlineStyles?: {
    verified?: UnderlineConfig;
    partial?: UnderlineConfig;
    notFound?: UnderlineConfig;
    pending?: UnderlineConfig;
  };
}

/** Configuration for a single underline style */
export interface UnderlineConfig {
  /** CSS text-decoration-style: "solid" | "dashed" | "wavy" | "dotted" | "none" */
  style?: "solid" | "dashed" | "wavy" | "dotted" | "none";
  /** CSS color value (e.g., "#16a34a", "green", "var(--my-color)") */
  color?: string;
  /** CSS text-decoration-thickness (e.g., "2px", "auto") */
  thickness?: string;
  /** CSS text-underline-offset (e.g., "3px") */
  offset?: string;
}
```

### 3. Add default underline style constants

**File**: `src/markdown/types.ts` (new constant)

```typescript
/** Default underline styles matching React linter variant */
export const DEFAULT_UNDERLINE_STYLES = {
  verified: { style: "solid", color: "#16a34a", thickness: "2px", offset: "3px" },
  partial: { style: "dashed", color: "#f59e0b", thickness: "2px", offset: "3px" },
  notFound: { style: "wavy", color: "#ef4444", thickness: "auto", offset: "2px" },
  pending: { style: "dotted", color: "#9ca3af", thickness: "2px", offset: "3px" },
} as const;
```

### 4. Implement `renderLinterVariant` function

**File**: `src/markdown/markdownVariants.ts`

Add a new function that generates HTML `<span>` with inline styles:

```typescript
/**
 * Render a citation in linter variant (HTML span with styled underline).
 */
export function renderLinterVariant(
  citationWithStatus: CitationWithStatus,
  options: RenderMarkdownOptions
): string {
  const { citation, status, citationNumber } = citationWithStatus;
  const { indicatorStyle = "check", linkStyle = "anchor", underlineStyles = {} } = options;

  const indicator = getIndicator(status, indicatorStyle);
  const text = getInlineFallbackText(citation, citationNumber);

  // Determine which style config to use based on status
  const styleConfig = status.isMiss
    ? { ...DEFAULT_UNDERLINE_STYLES.notFound, ...underlineStyles.notFound }
    : status.isPartialMatch
    ? { ...DEFAULT_UNDERLINE_STYLES.partial, ...underlineStyles.partial }
    : status.isVerified
    ? { ...DEFAULT_UNDERLINE_STYLES.verified, ...underlineStyles.verified }
    : { ...DEFAULT_UNDERLINE_STYLES.pending, ...underlineStyles.pending };

  // Build inline style string
  const styleAttr = [
    `text-decoration: underline`,
    styleConfig.style !== "none" && `text-decoration-style: ${styleConfig.style}`,
    styleConfig.color && `text-decoration-color: ${styleConfig.color}`,
    styleConfig.thickness && `text-decoration-thickness: ${styleConfig.thickness}`,
    styleConfig.offset && `text-underline-offset: ${styleConfig.offset}`,
  ].filter(Boolean).join("; ");

  // Build the span element
  const content = `${text}${indicator}`;
  if (linkStyle === "anchor") {
    return `<a href="#ref-${citationNumber}" style="${styleAttr}">${content}</a>`;
  }
  return `<span style="${styleAttr}">${content}</span>`;
}
```

### 5. Update `renderCitationVariant` to handle linter

**File**: `src/markdown/markdownVariants.ts:167-217`

Add case for `"linter"` in the switch statement:

```typescript
case "linter": {
  return renderLinterVariant(citationWithStatus, options);
}
```

### 6. Update exports

**File**: `src/markdown/index.ts`

Export new types and constants:
```typescript
export type { UnderlineConfig } from "./types.js";
export { DEFAULT_UNDERLINE_STYLES } from "./types.js";
```

## Files to Modify

1. `src/markdown/types.ts` - Add types and constants
2. `src/markdown/markdownVariants.ts` - Add linter rendering logic
3. `src/markdown/index.ts` - Export new types
4. `src/__tests__/renderMarkdown.test.ts` - Add tests for linter variant
5. `src/markdown/testing/MarkdownShowcase.tsx` - Add linter variant to showcase

## Usage Examples

```typescript
import { toMarkdown, DEFAULT_UNDERLINE_STYLES } from "@deepcitation/deepcitation-js";

// Default styling (matches React linter variant)
const md = toMarkdown(llmOutput, {
  variant: "linter",
  verifications,
});
// Output: <span style="text-decoration: underline; text-decoration-style: solid; ...">Revenue grew 45%✓</span>

// Custom styling
const md = toMarkdown(llmOutput, {
  variant: "linter",
  verifications,
  underlineStyles: {
    verified: { style: "solid", color: "green", thickness: "3px", offset: "5px" },
    notFound: { style: "wavy", color: "red" },
  },
});
```

## Verification

1. Run existing tests: `bun test src/__tests__/renderMarkdown.test.ts`
2. Add new tests for linter variant covering all status states
3. Test in MarkdownShowcase component visually
4. Run Playwright tests: `bun playwright test`
