# CitationComponent Product Requirements Document

## Overview

The `CitationComponent` is a React component that displays verifiable citations from AI-generated content. It shows citation text with visual verification status indicators and provides interactive features for viewing verification details.

## Goals

1. **Verification transparency** - Show users whether AI-generated citations are verified against source documents
2. **Copy/paste friendly** - Follow shadcn patterns so developers can easily customize the component
3. **Minimal dependencies** - Use optional peer dependencies so consumers only install what they need
4. **Dark mode support** - Work seamlessly in light and dark themes via Tailwind CSS
5. **Accessible** - Proper ARIA labels and keyboard navigation

## Dependencies

All dependencies are optional peer dependencies:

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | `>=17.0.0` | Core React |
| `react-dom` | `>=17.0.0` | Portal rendering for overlays |
| `@radix-ui/react-popover` | `^1.0.0` | Popover primitive (shadcn-style) |
| `diff` | `^8.0.0` | Word-level diff highlighting |

## Component API

### Props

```typescript
interface CitationComponentProps {
  // Required
  citation: Citation;

  // Verification
  verification?: Verification | null;

  // Display
  variant?: "chip" | "brackets" | "text" | "superscript" | "minimal";
  content?: "keySpan" | "number" | "indicator";
  fallbackDisplay?: React.ReactNode;
  className?: string;

  // Popover
  popoverPosition?: "top" | "bottom" | "hidden";
  renderPopoverContent?: (props: PopoverRenderProps) => React.ReactNode;

  // Custom rendering
  renderIndicator?: (status: CitationStatus) => React.ReactNode;
  renderContent?: (props: CitationRenderProps) => React.ReactNode;

  // Behavior
  behaviorConfig?: CitationBehaviorConfig;
  eventHandlers?: CitationEventHandlers;
  isMobile?: boolean;

  // Children (rendered before citation)
  children?: React.ReactNode;
}
```

### Citation Type

```typescript
interface Citation {
  citationNumber?: number;
  keySpan?: string | number;
  fullPhrase?: string;
  pageNumber?: number;
  lineIds?: string[];
}
```

### Verification Type

The full `Verification` interface from the package. The CitationComponent uses the highlighted properties:

```typescript
interface Verification {
  attachmentId?: string | null;
  label?: string | null;                              // e.g. "Invoice"
  citation?: Citation;                                // Expected values from LLM

  // Search status - USED BY COMPONENT
  status?: SearchStatus | null;                       // ← Component reads this

  searchAttempts?: SearchAttempt[];                   // Debug info about search attempts
  highlightColor?: string | null;

  // Verified results (actual values found) - USED BY COMPONENT
  verifiedPageNumber?: number | null;                 // ← Shown in popover
  verifiedLineIds?: number[] | null;                  // ← Shown in diff details
  verifiedTimestamps?: { startTime?: string; endTime?: string } | null;
  verifiedFullPhrase?: string | null;
  verifiedKeySpan?: string | null;
  verifiedMatchSnippet?: string | null;               // ← Shown in popover/diff

  hitIndexWithinPage?: number | null;
  pdfSpaceItem?: PdfSpaceItem;                        // Bounding box coordinates
  verificationImageBase64?: string | null;            // ← Shown in popover
  verifiedAt?: Date;
}

type SearchStatus =
  | "loading"
  | "pending"                    // Page not ready, still retrying
  | "not_found"
  | "partial_text_found"
  | "found"
  | "found_key_span_only"
  | "found_phrase_missed_value"
  | "found_on_other_page"
  | "found_on_other_line"
  | "first_word_found"
  | "timestamp_wip";
```

### Properties Used by CitationComponent

| Property | Purpose |
|----------|---------|
| `status` | Determines which indicator to show (spinner/check/warning) |
| `verifiedMatchSnippet` | Displayed in popover, used for diff comparison |
| `verifiedPageNumber` | Shown in popover, compared with expected page |
| `verifiedLineIds` | Compared with expected line IDs for diff display |
| `verificationImageBase64` | Displayed in popover, click to zoom |

## Display Variants

| Variant | Output | Description |
|---------|--------|-------------|
| `brackets` | `[keySpan✓]` | Default. Monospace font with brackets. |
| `text` | `keySpan✓` | Inherits parent text styling. |
| `minimal` | `keySpan✓` | No brackets, truncated with ellipsis. |
| `indicator` | `✓` | Only the status indicator icon. |

## Status Indicators

The component derives status from `verification.status`:

| Status | Indicator | Color | Conditions |
|--------|-----------|-------|------------|
| **Pending** | Spinner `◌` | Gray | `null`, `undefined`, `"pending"`, `"loading"` |
| **Verified** | Checkmark `✓` | Green | `"found"`, `"found_key_span_only"`, `"found_phrase_missed_value"` |
| **Partial** | Checkmark `✓` | Amber | `"found_on_other_page"`, `"found_on_other_line"`, `"partial_text_found"`, `"first_word_found"` |
| **Not Found** | Warning `△` | Red | `"not_found"` |

### Status Derivation Logic

```typescript
function getStatusFromVerification(verification: Verification | null): CitationStatus {
  const status = verification?.status;

  if (!verification || !status) {
    return { isPending: true, isVerified: false, isPartialMatch: false, isMiss: false };
  }

  const isMiss = status === "not_found";
  const isPending = status === "pending" || status === "loading";

  const isPartialMatch = [
    "partial_text_found",
    "found_on_other_page",
    "found_on_other_line",
    "first_word_found"
  ].includes(status);

  const isVerified = [
    "found",
    "found_key_span_only",
    "found_phrase_missed_value"
  ].includes(status) || isPartialMatch;

  return { isVerified, isMiss, isPartialMatch, isPending };
}
```

## Interaction Behavior

### Default Behavior

| Interaction | Action |
|-------------|--------|
| **Hover** | Shows popover with verification image/details |
| **Click** | Opens full-size image overlay (zoom) |
| **Escape** | Closes image overlay |
| **Click overlay** | Closes image overlay |

### Custom Behavior

```typescript
interface CitationBehaviorConfig {
  onClick?: (context: CitationBehaviorContext, event: MouseEvent) => CitationBehaviorActions | false | void;
  onHover?: {
    onEnter?: (context: CitationBehaviorContext) => void;
    onLeave?: (context: CitationBehaviorContext) => void;
  };
}

interface CitationBehaviorContext {
  citation: Citation;
  citationKey: string;
  verification: Verification | null;
  isTooltipExpanded: boolean;
  isImageExpanded: boolean;
  hasImage: boolean;
}

interface CitationBehaviorActions {
  setImageExpanded?: boolean | string;
}
```

**Key principle**: When `onClick` is provided in `behaviorConfig`, the default click behavior is disabled.

## Popover Content

### Default Popover

When `verification.verificationImageBase64` exists:
- Shows clickable image (max 700x500px)
- Click image to open full-size overlay
- Shows diff details for partial matches or misses

When no image:
- Shows status label (Verified, Partial Match, Not Found, Verifying...)
- Shows match snippet if available
- Shows page number if available
- Shows diff details for partial matches or misses

### Diff Details

For partial matches and misses, shows:

1. **Text diff** (when text differs):
   - Word-level highlighting using `diff` library
   - Removed text: red background with strikethrough
   - Added text: green background
   - High-variance fallback: side-by-side display when >40% different

2. **Location diff** (when page/line differs):
   - Shows expected → actual page number
   - Shows expected → actual line IDs

## Styling

### Tailwind Classes

The component uses Tailwind CSS with dark mode variants (`dark:`):

```typescript
// Status colors
"text-green-600 dark:text-green-500"  // Verified
"text-amber-600 dark:text-amber-500"  // Partial match
"text-red-500 dark:text-red-400"      // Not found
"text-gray-400 dark:text-gray-500"    // Pending

// Hover state
"hover:bg-blue-500/10 dark:hover:bg-blue-400/10"

// Popover
"bg-white dark:bg-gray-900"
"border-gray-200 dark:border-gray-700"
```

### CSS Requirements

- Tailwind CSS must be configured in the consuming project
- The component does not include its own CSS file
- All animations use Tailwind's `animate-*` utilities

## Popover Component

The component uses a shadcn-style Popover built on Radix UI:

```typescript
// src/react/Popover.tsx
import * as PopoverPrimitive from "@radix-ui/react-popover";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverContent = /* styled content with portal */;
```

### Popover Features

- **Portal rendering** - Escapes `overflow:hidden` containers
- **Positioning** - Automatic flip/shift to stay in viewport
- **Animation** - Fade and zoom transitions
- **Dark mode** - Adapts to theme

## Image Overlay

Full-screen overlay for zoomed verification images:

- Fixed position with backdrop blur
- Max 95vw x 95vh dimensions
- Click anywhere to close
- Press Escape to close
- Uses `createPortal` to render at document body

## Accessibility

- `aria-label` on citation trigger with display text
- `role="tooltip"` on popover
- `role="dialog"` and `aria-modal="true"` on image overlay
- Keyboard navigation (Escape to close)
- `aria-hidden="true"` on decorative indicator icons

## Usage Examples

### Basic Usage

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

<CitationComponent
  citation={{ citationNumber: 1, keySpan: "25% growth" }}
  verification={verificationResult}
/>
```

### Number Only

```tsx
<CitationComponent
  citation={{ citationNumber: 1, keySpan: "25% growth" }}
  verification={verificationResult}
  content="number"
/>
// Renders: [1✓]
```

### Without Brackets

```tsx
<CitationComponent
  citation={{ citationNumber: 1, keySpan: "25% growth" }}
  verification={verificationResult}
  hideBrackets={true}
/>
// Renders: 25% growth✓
```

### Indicator Only

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  variant="indicator"
/>
// Renders: ✓
```

### Custom Click Behavior

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  behaviorConfig={{
    onClick: (context) => {
      console.log('Clicked:', context.citationKey);
      // Return actions or false to prevent default
      return { setImageExpanded: true };
    }
  }}
/>
```

### Custom Indicator

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  renderIndicator={(status) =>
    status.isVerified ? <MyCheckIcon /> : <MySpinner />
  }
/>
```

### Disabled Popover

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  popoverPosition="hidden"
/>
```

## File Structure

```
src/react/
├── CitationComponent.tsx   # Main component
├── Popover.tsx             # shadcn-style Popover
├── icons.tsx               # CheckIcon, WarningIcon
├── types.tsx               # TypeScript interfaces
├── utils.tsx               # Helper functions
└── useSmartDiff.ts         # Diff hook using diff library
```

## Testing

- Unit tests with `@testing-library/react`
- Component tests with Playwright
- All 339 unit tests must pass

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires React 17+ for portal support
- No IE11 support
