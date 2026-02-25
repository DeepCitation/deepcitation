# CitationComponent Product Requirements Document

## Overview

The `CitationComponent` is a React component that displays verifiable citations from AI-generated content. It shows citation text with visual verification status indicators and provides interactive features for viewing verification details.

## Goals

1. **Verification transparency** - Show users whether AI-generated citations are verified against attachments
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
  content?: "anchorText" | "number" | "indicator";
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
  anchorText?: string | number;
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
  verifiedAnchorText?: string | null;
  verifiedMatchSnippet?: string | null;               // ← Shown in popover/diff

  hitIndexWithinPage?: number | null;
  phraseMatchDeepItem?: DeepTextItem;                  // Bounding box for phrase match
  anchorTextMatchDeepItems?: DeepTextItem[];             // Multiple boxes for anchorText (spans multiple items)
  verificationImageBase64?: string | null;            // ← Shown in popover
  verifiedAt?: Date;
}

type SearchStatus =
  | "loading"
  | "pending"                    // Page not ready, still retrying
  | "not_found"
  | "partial_text_found"
  | "found"
  | "found_anchor_text_only"
  | "found_phrase_missed_anchor_text"
  | "found_on_other_page"
  | "found_on_other_line"
  | "first_word_found"
  | "timestamp_wip";
```

### Properties Used by CitationComponent

| Property | Purpose |
|----------|---------|
| `status` | Determines which indicator to show (spinner/check/warning) |
| `searchAttempts` | Array of search attempts with phrases, notes, and trust levels |
| `verifiedMatchSnippet` | Displayed in popover, used for diff comparison |
| `verifiedPageNumber` | Shown in popover, compared with expected page |
| `verifiedLineIds` | Compared with expected line IDs for diff display |
| `verificationImageBase64` | Displayed in popover, click to zoom |

### SearchAttempt Interface

Each `SearchAttempt` in `verification.searchAttempts` contains:

```typescript
interface SearchAttempt {
  method: SearchMethod;           // The search method used
  success: boolean;               // Whether this attempt succeeded

  // What was searched
  searchPhrase: string;           // The primary phrase searched for
  searchVariations?: string[];    // Alternative forms tried (e.g., ["$4.89", "4.89"])
  searchPhraseType?: "full_phrase" | "anchor_text";

  // Where it was searched
  pageSearched?: number;

  // Match details (if success: true)
  matchedVariation?: MatchedVariation;  // Trust level indicator
  matchedText?: string;                  // Actual text found

  // Human-readable note (API-generated)
  note?: string;                  // e.g., "not found on expected page (2)"

  durationMs?: number;            // Performance tracking
}
```

### MatchedVariation and Trust Levels

The `matchedVariation` field indicates which variation matched and determines the trust level:

| MatchedVariation | Trust Level | Indicator Color | Description |
|------------------|-------------|-----------------|-------------|
| `exact_full_phrase` | High | Green | Exact match on fullPhrase |
| `normalized_full_phrase` | High | Green | fullPhrase with whitespace/case normalization |
| `exact_anchor_text` | Medium | Green | anchorText matched, fullPhrase missed |
| `normalized_anchor_text` | Medium | Green | anchorText with normalization |
| `partial_full_phrase` | Low | **Amber** | Partial fullPhrase (tables/columns) |
| `partial_anchor_text` | Low | **Amber** | Partial anchorText match |
| `first_word_only` | Lowest | **Amber** | Only first word matched |

**Important**: Low-trust matches (partial_full_phrase, partial_anchor_text, first_word_only) show amber indicators instead of green, even when `success: true`.

### SearchAttempt Display

Search attempts are **grouped by unique phrase** to provide a cleaner, more informative display. When the same phrase is searched multiple times (e.g., on different pages), it appears once with a summary instead of repeated identical entries.

#### Grouped Display Format

Search attempts use a **compact horizontal layout** optimized for scanning:

1. **Status icon** (left) - Quick visual indicator of success/failure
2. **Phrase** (truncated to ~50 chars) in monospace
3. **Inline badges** showing:
   - `anchor` - Anchor text fallback search
   - `pN` or `pN-M` - Pages searched
   - `+N var` - Number of variations tried
4. **Result line** (optional, below) - Found text or error note

**Default expansion:** Shows first 2 groups (usually fullPhrase + anchorText), with a "+N" button to show more.

#### Example: Before vs After

**Before (8 identical-looking entries):**
```
Searched 8 phrases
"Junior to payment of outstanding indebtedness..." - Not found in any page
"Junior to payment of outstanding indebtedness..." - Not found in any page
"Junior to payment of outstanding indebtedness..." - Not found in any page
... (5 more identical entries)
```

**After (compact grouped display):**
```
2 phrases · 16 attempts                              [+1]
─────────────────────────────────────────────────────────
⚠ "Junior to payment of outstanding indebt…" [p1-8]
    Not found in any page

⚠ "Junior to payment" [anchor] [p1-8] [+2 var]
    Not found in any page
```

#### Compact Row Format

Each search attempt group is displayed in a compact single-row format:

```
[icon] "phrase..." [badge] [badge] [badge]
         optional result line (found text or error)
```

**Icons:**
- ✓ (green) - Found with high/medium trust
- ✓ (amber) - Found with low trust
- △ (red) - Not found

**Badges:**
| Badge | Meaning |
|-------|---------|
| `anchor` | This was an anchor text fallback search |
| `p3` | Searched page 3 |
| `p1-8` | Searched pages 1 through 8 |
| `+2 var` | Also tried 2 variations of the phrase |

#### Status Icon Colors

| Status | Icon | Color |
|--------|------|-------|
| Found (high/medium trust) | ✓ | Green |
| Found (low trust) | ✓ | Amber |
| Not found | △ | Red |

#### Page Badge Formatting

Pages are formatted into compact badges:
- Single page: `p3`
- Range: `p1-8` (min to max)
- The component uses `formatPageList()` for readable ranges in expanded views

## Display Variants

| Variant | Output | Description |
|---------|--------|-------------|
| `brackets` | `[anchorText✓]` | Default. Monospace font with brackets. |
| `text` | `anchorText✓` | Inherits parent text styling. |
| `minimal` | `anchorText✓` | No brackets, truncated with ellipsis. |
| `indicator` | `✓` | Only the status indicator icon. |

## Status Indicators

The component derives status from `verification.status`:

| Status | Indicator | Color | Conditions |
|--------|-----------|-------|------------|
| **Pending** | Spinner `◌` | Gray | `null`, `undefined`, `"pending"`, `"loading"` |
| **Verified** | Checkmark `✓` | Green | `"found"`, `"found_anchor_text_only"`, `"found_phrase_missed_anchor_text"` |
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
    "found_anchor_text_only",
    "found_phrase_missed_anchor_text"
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
import { CitationComponent } from "deepcitation/react";

<CitationComponent
  citation={{ citationNumber: 1, anchorText: "25% growth" }}
  verification={verificationResult}
/>
```

### Number Only

```tsx
<CitationComponent
  citation={{ citationNumber: 1, anchorText: "25% growth" }}
  verification={verificationResult}
  content="number"
/>
// Renders: [1✓]
```

### Without Brackets

```tsx
<CitationComponent
  citation={{ citationNumber: 1, anchorText: "25% growth" }}
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

## Enhancement: Improved Diff Display for Partial Matches

### Problem Statement

The current diff display has usability issues:

1. **"Fruit Salad" Problem**: When expected and found text differ significantly, the interleaved red/green word-level diff becomes visually overwhelming and hard to parse. Users struggle to understand what was expected vs. what was found.

2. **Lack of Context**: The inline diff doesn't clearly communicate the relationship between "what the AI claimed" and "what the source actually says."

3. **Partial Match Ambiguity**: For statuses like `found_anchor_text_only`, `partial_text_found`, or `found_on_other_page`, users need clearer visual guidance about *what* matched and *what* didn't.

### Current Behavior

The diff display uses a single inline view with:
- Red background + strikethrough for removed/expected text
- Green background for added/found text
- Word-level diffing that can create many small alternating spans

When `similarity < 0.6` (high variance), it defaults to the "Found" tab, but users must manually switch tabs to compare.

### Proposed Enhancements

#### 1. Split View Mode for Partial Matches

For partial matches and high-variance diffs, show a **two-row layout** instead of inline diff:

```
┌─────────────────────────────────────────────────────────┐
│ Expected: a Change of Control, a Direct Listing or an  │
│           Initial Public Offering                       │
├─────────────────────────────────────────────────────────┤
│ Found:    Change of Control                             │
└─────────────────────────────────────────────────────────┘
```

**Design specifications:**
- "Expected" row: Light red/pink background (`bg-red-50 dark:bg-red-900/20`)
- "Found" row: Light green background (`bg-green-50 dark:bg-green-900/20`)
- Clear labels: "Expected:" and "Found:" prefixes in muted text
- Monospace font for text comparison
- Optional: highlight the matching substring within both rows

#### 2. Smart Display Mode Selection

Auto-select the best display mode based on match characteristics:

| Condition | Display Mode | Rationale |
|-----------|--------------|-----------|
| `similarity >= 0.8` | Inline diff | Minor differences are clear inline |
| `similarity >= 0.6` | Inline diff with toggle | Moderate differences, offer split view |
| `similarity < 0.6` | Split view default | High variance makes inline unreadable |
| `status === 'found_anchor_text_only'` | Split view with anchorText highlight | Show what matched vs full phrase |
| `status === 'partial_text_found'` | Split view | Clear comparison needed |

#### 3. AnchorText Highlighting in Split View

When the verification status is `found_anchor_text_only` or similar partial matches:

```
┌─────────────────────────────────────────────────────────┐
│ Expected: a Change of Control, a Direct Listing or an  │
│           Initial Public Offering                       │
│           ─────────────────────                         │
│           [anchorText highlighted]                         │
├─────────────────────────────────────────────────────────┤
│ Found:    Change of Control                             │
│           ─────────────────                             │
│           [matching portion underlined]                 │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**
- Underline or highlight the `anchorText` within the expected text
- Underline or highlight the `verifiedAnchorText` or matching portion in found text
- Use a subtle blue underline or background to indicate the "key" portion

#### 4. Diff Legend

Add a collapsible legend explaining the diff colors (shown on first use or hover):

```
┌─────────────────────────────────────────┐
│ ℹ️ Diff Legend                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Expected  Text the AI claimed           │
│ Found     Text actually in source       │
│ strikethrough  Not found in source      │
│ highlighted    Found in source          │
└─────────────────────────────────────────┘
```

#### 5. Match Quality Indicator

Add a visual indicator showing match quality:

```tsx
// In the popover header area
<MatchQualityBar similarity={0.65} />

// Renders:
// ████████░░ 65% match
```

**Design:**
- Green fill for high match (>80%)
- Amber fill for partial match (40-80%)
- Red fill for poor match (<40%)
- Optional: show as a small horizontal progress bar under the status badge

#### 6. Contextual Status Messages

Improve status messages to be more descriptive:

| Status | Current Message | Proposed Message |
|--------|-----------------|------------------|
| `found_anchor_text_only` | "Partial Match" | "Anchor text found, full context differs" |
| `partial_text_found` | "Partial Match" | "Partial text match found" |
| `found_on_other_page` | "Partial Match" | "Found on page X (expected page Y)" |
| `found_on_other_line` | "Partial Match" | "Found on different line" |
| `first_word_found` | "Partial Match" | "Only first word matched" |

#### 7. Collapsed Diff for Long Text

When expected or found text exceeds 200 characters:

```
┌─────────────────────────────────────────────────────────┐
│ Expected: "Dissolution" means (i) a voluntary terminat…│
│           [Show full text ▼]                            │
├─────────────────────────────────────────────────────────┤
│ Found:    "Dissolution" means (i) a voluntary terminat…│
│           [Show full text ▼]                            │
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
- Truncate at ~150 characters with ellipsis
- "Show full text" expands inline
- Diff highlighting still applies to visible portion

### Component API Changes

```typescript
interface DiffDisplayProps {
  expected: string;
  actual: string;
  label?: string;
  className?: string;
  sanitize?: (text: string) => string;

  // NEW PROPS
  mode?: "auto" | "inline" | "split";  // Default: "auto"
  showLegend?: boolean;                // Default: false
  showMatchQuality?: boolean;          // Default: true for partial matches
  maxCollapsedLength?: number;         // Default: 200
  anchorTextExpected?: string;            // Highlight this substring in expected
  anchorTextFound?: string;               // Highlight this substring in found
}

interface VerificationTabsProps {
  expected: string;
  actual: string;
  label?: string;
  renderCopyButton?: (text: string, position: "expected" | "found") => React.ReactNode;
  emptyText?: string;

  // NEW PROPS
  status?: SearchStatus;               // For contextual status messages
  anchorText?: string;                    // Expected anchorText for highlighting
  verifiedAnchorText?: string;            // Found anchorText for highlighting
  defaultMode?: "auto" | "inline" | "split";
}
```

### Visual Design Specifications

#### Split View Layout

```
┌──────────────────────────────────────────────────────────────┐
│ DIFF                                                    [≡] │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Expected:                                                │ │
│ │ ┌────────────────────────────────────────────────────┐   │ │
│ │ │ a Change of Control, a Direct Listing or an        │   │ │
│ │ │ Initial Public Offering                             │   │ │
│ │ └────────────────────────────────────────────────────┘   │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Found:    ✓                                              │ │
│ │ ┌────────────────────────────────────────────────────┐   │ │
│ │ │ Change of Control                                   │   │ │
│ │ └────────────────────────────────────────────────────┘   │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

#### Color Scheme

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Expected row bg | `bg-red-50` | `bg-red-900/20` |
| Expected label | `text-red-600` | `text-red-400` |
| Found row bg | `bg-green-50` | `bg-green-900/20` |
| Found label | `text-green-600` | `text-green-400` |
| AnchorText underline | `border-b-2 border-blue-400` | `border-blue-500` |
| Match bar (good) | `bg-green-500` | `bg-green-400` |
| Match bar (partial) | `bg-amber-500` | `bg-amber-400` |
| Match bar (poor) | `bg-red-500` | `bg-red-400` |

### Implementation Priority

1. **P0 - Split View Mode**: Implement the two-row Expected/Found layout
2. **P0 - Auto Mode Selection**: Smart switching based on similarity score
3. **P1 - AnchorText Highlighting**: Underline matching portions
4. **P1 - Contextual Status Messages**: Better descriptions for each status
5. **P2 - Match Quality Indicator**: Visual similarity bar
6. **P2 - Collapsed Long Text**: Truncation with expand
7. **P3 - Diff Legend**: Help tooltip for first-time users

### Success Metrics

- Reduced user confusion (measured via user feedback)
- Faster comprehension of partial matches
- Decreased support questions about "what does this diff mean"

---

## Testing

- Unit tests with `@testing-library/react`
- Component tests with Playwright
- All 339 unit tests must pass

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires React 17+ for portal support
- No IE11 support
