# CLAUDE.md - DeepCitation Package

This file provides guidance to Claude Code when working with the DeepCitation npm package.

## Package Overview

DeepCitation is a citation verification and parsing library that enables AI-generated content to include verifiable references. It provides citation extraction, normalization, verification against attachments, and visual proof generation.

## Key Exports

### Core (main entry)
```typescript
import {
  wrapSystemCitationPrompt,
  wrapCitationPrompt,
  CITATION_JSON_OUTPUT_FORMAT,
  CITATION_REMINDER,
  getAllCitationsFromLlmOutput,
} from "deepcitation";
```

### React Components (/react)
```typescript
import {
  CitationComponent,
  SourcesListComponent,
  SourcesTrigger,
  SourcesListItem,
} from "deepcitation/react";
```

### Types
```typescript
import type {
  Citation, CitationType, Verification, SourceType,
  CitationRecord,      // Record<string, Citation> — NOT an array
  VerificationRecord,  // Record<string, Verification>
} from "deepcitation";
```

`CitationRecord` is an object keyed by citationKey hash. Check emptiness with `Object.keys(citations).length === 0`, not `.length`.

## Package Structure

```
src/
├── index.ts              # Main exports
├── client/               # DeepCitation client
│   └── errors.ts         # Error classes — CANONICAL LOCATION
├── parsing/
│   ├── parseCitation.ts  # getCitationStatus() — CANONICAL LOCATION
│   ├── normalizeCitation.ts
│   └── parseWorkAround.ts
├── prompts/
│   ├── citationPrompts.ts
│   └── promptCompression.ts
├── react/
│   ├── index.ts              # Public API types + consumer-facing exports
│   ├── Citation.tsx       # Document citation (popover wiring) + URL citation (UrlCitationComponent, MemoizedUrlCitationComponent)
│   ├── CitationContentDisplay.tsx  # Variant rendering (chip, superscript, badge, etc.)
│   ├── CitationErrorBoundary.tsx   # Error boundary for citation components
│   ├── CitationStatusIndicator.tsx # Status indicators (verified/partial/miss/pending dots & icons)
│   ├── CitationVariants.tsx        # useCitationEvents(), StatusIndicators
│   ├── DefaultPopoverContent.tsx   # Three-zone popover content (success/partial/miss)
│   ├── EvidenceTray.tsx            # Evidence display, keyhole viewer, InlineExpandedImage (expanded page + zoom + arrow-key pan)
│   ├── SearchAnalysisSummary.tsx   # Search attempt display
│   ├── SourcesListComponent.tsx
│   ├── citationStatus.ts          # Status derivation, isPartialSearchStatus(), getTrustLevel()
│   ├── citationVariants.cva.ts    # Variant class resolvers, status styles
│   ├── constants.ts      # MISS_WAVY_UNDERLINE_STYLE, DOT_INDICATOR_*_STYLE, CARET_INDICATOR_SIZE_STYLE, CARET_PILL_STYLE, isValidProofImageSrc(), getPortalContainer()
│   ├── expandedWidthPolicy.ts  # EXPANDED_POPOVER_MID_WIDTH, getExpandedPopoverWidth()
│   ├── imageUtils.ts     # handleImageError() — shared image error handler
│   ├── outcomeLabel.ts            # deriveOutcomeLabel() — shared outcome label logic
│   ├── urlAccessExplanation.ts    # URL access failure mapping (getUrlAccessExplanation)
│   ├── HighlightedPhrase.tsx # HighlightedPhrase — CANONICAL LOCATION
│   ├── dateUtils.ts      # formatCaptureDate()
│   ├── scrollLock.ts     # acquireScrollLock(), releaseScrollLock() — ref-counted body scroll lock
│   ├── hooks/             # Extracted hooks (import directly, not via index.ts)
│   │   ├── useDrawerDragToClose.ts  # Drag-to-close gesture for bottom-sheet drawer
│   │   ├── usePopoverDismiss.ts     # Platform-aware outside-click dismiss
│   │   ├── usePopoverPosition.ts    # Expanded-page side offset calculation
│   │   ├── useCitationTelemetry.ts  # Popover timing + spinner staging
│   │   ├── useZoomControls.ts       # Zoom state with clamping and steps
│   │   ├── useCitationData.ts       # Citation key, instance ID, status
│   │   ├── useCitationEvents.ts     # Click/hover/keyboard event handlers
│   │   ├── useExpandedPageSideOffset.ts # Expanded-page popover vertical offset
│   │   ├── usePopoverAlignOffset.ts # Horizontal viewport clamping (replaces shift middleware)
│   │   ├── useViewportBoundaryGuard.ts # Hard viewport boundary guard (Layer 3 safety net)
│   │   ├── useAnimatedHeight.ts      # Imperative height animation for viewState transitions
│   │   ├── useAnimationState.ts     # Enter/exit animation lifecycle
│   │   └── useWheelZoom.ts          # Wheel/trackpad zoom with gesture anchor
│   └── utils.ts          # generateCitationKey() — CANONICAL LOCATION
├── markdown/
│   ├── renderMarkdown.ts
│   ├── markdownVariants.ts  # getIndicator(), toSuperscript(), humanizeLinePosition(), formatPageLocation()
│   └── types.ts             # INDICATOR_SETS, SUPERSCRIPT_DIGITS
├── rendering/            # Slack, GitHub, HTML, Terminal renderers
│   ├── proofUrl.ts       # buildProofUrl(), buildSnippetImageUrl(), buildProofUrls()
│   ├── types.ts          # RenderOptions, RenderedOutput, RenderCitationWithStatus
│   ├── slack/
│   ├── github/
│   ├── html/
│   └── terminal/
├── types/
│   ├── citation.ts
│   ├── verification.ts
│   ├── boxes.ts
│   └── search.ts
└── utils/
    ├── urlSafety.ts      # extractDomain(), isDomainMatch()
    ├── logSafety.ts      # sanitizeForLog(), createLogEntry()
    ├── objectSafety.ts   # isSafeKey(), safeAssign(), safeMerge()
    ├── regexSafety.ts    # safeMatch(), safeReplace(), safeTest()
    ├── fileSafety.ts     # validateFileMagicBytes(), validateUploadFile()
    └── sha.ts
```

## Example App Models

The Next.js example uses these models (DO NOT CHANGE):
- **OpenAI**: `gpt-5-mini`
- **Google**: `gemini-2.0-flash-lite`

## Important: Security Patterns

This codebase has dedicated security utilities in `src/utils/`. Always use them instead of ad-hoc patterns.

### URL Domain Matching
**NEVER use `url.includes("twitter.com")` or substring matching for domain checks.** This is vulnerable to subdomain spoofing (`twitter.com.evil.com` would match). Always use:

```typescript
import { isDomainMatch } from "../utils/urlSafety.js";
if (isDomainMatch(url, "twitter.com")) { /* safe */ }
```

### Object Property Assignment from Untrusted Input
**NEVER assign untrusted keys directly to objects.** This enables prototype pollution via `__proto__` or `constructor` keys.

```typescript
import { safeAssign } from "../utils/objectSafety.js";
safeAssign(obj, userKey, userValue); // Rejects __proto__, constructor, prototype
```

### Regex on Untrusted Input
**NEVER apply regex with nested quantifiers to unbounded user input.** Use the safe wrappers that validate input length:

```typescript
import { safeMatch, safeReplace } from "../utils/regexSafety.js";
const matches = safeMatch(userInput, /pattern/g); // Throws if input > 100KB
```

### Logging Untrusted Data
**NEVER log user-provided strings directly.** Newlines and ANSI codes can inject fake log entries:

```typescript
import { sanitizeForLog } from "../utils/logSafety.js";
console.log("[API] Input:", sanitizeForLog(userInput));
```

### Image Source Validation
**NEVER render `<img src={...}>` with unvalidated sources.** Use `isValidProofImageSrc()` from `src/react/constants.ts` to block SVG data URIs (which can contain scripts) and untrusted hosts.

## Important: No Variable Re-Exports

**NEVER re-export variables (functions, constants, classes) from a different module.** Re-exporting variables causes bundler issues, circular dependency problems, tree-shaking failures, and makes the dependency graph harder to trace.

### Rules

1. **Every function/constant has ONE canonical location.** That's where it's defined. All consumers import from that location directly.
2. **No barrel re-exports of variables.** Do not create `index.ts` files that `export { X } from "./other.js"` for variables. Type-only re-exports (`export type { X }`) are acceptable.
3. **No alias exports.** Do not create a new variable that just references another (e.g., `export const ALIAS = ORIGINAL`).
4. **No wrapper files.** Do not create files whose sole purpose is to re-export from other modules.
5. **Import from canonical locations.** When you need a function from another module, import directly from the file that defines it.

### Canonical Locations

| Symbol | Canonical file | Notes |
|--------|---------------|-------|
| `getCitationStatus()` | `src/parsing/parseCitation.ts` | Status computation |
| `generateCitationKey()` | `src/react/utils.ts` | Key generation |
| `getIndicator()` | `src/markdown/markdownVariants.ts` | Status → indicator char |
| `INDICATOR_SETS` | `src/markdown/types.ts` | Indicator character sets |
| `SUPERSCRIPT_DIGITS` | `src/markdown/types.ts` | Unicode superscript chars |
| `toSuperscript()` | `src/markdown/markdownVariants.ts` | Number → superscript |
| `humanizeLinePosition()` | `src/markdown/markdownVariants.ts` | LineId → position label |
| `formatPageLocation()` | `src/markdown/markdownVariants.ts` | Page location string |
| `buildProofUrl()` | `src/rendering/proofUrl.ts` | Proof URL construction |
| `MISS_WAVY_UNDERLINE_STYLE` | `src/react/constants.ts` | Wavy underline CSS |
| `DOT_INDICATOR_SIZE_STYLE` | `src/react/constants.ts` | Dot indicator sizing (inline, em-based) |
| `DOT_INDICATOR_FIXED_SIZE_STYLE` | `src/react/constants.ts` | Dot indicator sizing (drawers/wrappers, fixed px) |
| `CARET_INDICATOR_SIZE_STYLE` | `src/react/constants.ts` | Caret indicator sizing (0.7em, between dot and icon) |
| `CARET_PILL_STYLE` | `src/react/constants.ts` | Pill wrapper padding for caret indicator |
| `ChevronDownIcon` | `src/react/icons.tsx` | Down chevron for caret indicator variant |
| `HighlightedPhrase` | `src/react/HighlightedPhrase.tsx` | Shared fullPhrase highlight component |
| `formatCaptureDate()` | `src/react/dateUtils.ts` | Date formatting for timestamps |
| `extractDomain()`, `isDomainMatch()` | `src/utils/urlSafety.ts` | Safe domain matching (never use `url.includes()`) |
| `sanitizeForLog()`, `createLogEntry()` | `src/utils/logSafety.ts` | Log injection prevention |
| `isSafeKey()`, `safeAssign()`, `safeMerge()` | `src/utils/objectSafety.ts` | Prototype pollution prevention |
| `safeMatch()`, `safeReplace()`, `safeTest()` | `src/utils/regexSafety.ts` | ReDoS prevention (input length validation) |
| `validateFileMagicBytes()`, `validateUploadFile()` | `src/utils/fileSafety.ts` | File content validation via magic bytes |
| `ALLOWED_UPLOAD_MIME_TYPES`, `MAX_UPLOAD_FILE_SIZE` | `src/utils/fileSafety.ts` | Upload constraints (MIME allowlist, size limit) |
| `isValidProofImageSrc()` | `src/react/constants.ts` | Image source validation (blocks SVG, untrusted hosts) |
| `getPortalContainer()` | `src/react/constants.ts` | SSR-safe portal container |
| `formatTtc()` | `src/react/timingUtils.ts` | TtC duration formatting |
| `computeTimingMetrics()` | `src/react/timingUtils.ts` | Aggregate TtC metrics |
| `getTtcTier()` | `src/react/timingUtils.ts` | Fast/normal/slow classification |
| `useCitationTiming()` | `src/react/timingUtils.ts` | Core citation lifecycle timing hook |
| `useTtcMetrics()` | `src/react/timingUtils.ts` | Memoized aggregate metrics hook |
| `REVIEW_DWELL_THRESHOLD_MS` | `src/react/timingUtils.ts` | Popover dwell threshold (2s) for review detection |
| `TTC_INSTANT_THRESHOLD_MS` | `src/react/timingUtils.ts` | Below-threshold = "instant" (100ms) |
| `TTC_SLOW_THRESHOLD_MS` | `src/react/timingUtils.ts` | Slow tier boundary (10s) |
| `TTC_MAX_DISPLAY_MS` | `src/react/timingUtils.ts` | Display cap (">60s") |
| `TTC_TEXT_STYLE` | `src/react/constants.ts` | Muted TtC display style (tabular-nums) |
| `TTC_FAST_TEXT_STYLE` | `src/react/constants.ts` | Green-tinted TtC style for fast reviews |
| `getPrimarySourceName()` | `src/react/CitationDrawer.utils.tsx` | Primary source name (truncated, no +N) for heading/trigger |
| `generateDefaultLabel()` | `src/react/CitationDrawer.utils.tsx` | Full label with +N overflow for trigger display |
| `lookupSourceLabel()` | `src/react/CitationDrawer.utils.tsx` | Source label map lookup for citations |
| `resolveGroupLabels()` | `src/react/CitationDrawer.utils.tsx` | Pre-resolve source labels for citation groups |
| `wordCount()` | `src/react/overlayGeometry.ts` | Safe word counting with size limits |
| `toPercentRect()` | `src/react/overlayGeometry.ts` | PDF to CSS coordinate conversion |
| `isValidOverlayGeometry()` | `src/react/overlayGeometry.ts` | Geometry validation |
| `isPartialSearchStatus()` | `src/react/citationStatus.ts` | Single source of truth for partial status checks |
| `getTrustLevel()`, `isLowTrustMatch()` | `src/react/citationStatus.ts` | Trust classification from MatchedVariation |
| `getStatusFromVerification()` | `src/react/citationStatus.ts` | Verification → CitationStatus mapping |
| `getStatusLabel()` | `src/react/citationStatus.ts` | Status → display string |
| `deriveOutcomeLabel()` | `src/react/outcomeLabel.ts` | Shared outcome label (Exact match / Scan complete / etc.) |
| `normalizeScreenshotSrc()` | `src/react/EvidenceTray.tsx` | Screenshot data URI normalization + validation |
| `resolveEvidenceSrc()` | `src/react/EvidenceTray.tsx` | Resolve evidence crop image (keyhole source) |
| `resolveExpandedImage()` | `src/react/EvidenceTray.tsx` | Resolve best image source for expanded view |
| `EvidenceTray` | `src/react/EvidenceTray.tsx` | Evidence display with keyhole viewer |
| `InlineExpandedImage` | `src/react/EvidenceTray.tsx` | Expanded page image viewer with zoom + arrow-key pan |
| `DefaultPopoverContent` | `src/react/DefaultPopoverContent.tsx` | Three-zone popover layout (success/partial/miss) |
| `CitationStatusIndicator` | `src/react/CitationStatusIndicator.tsx` | Unified status indicator component |
| `CitationContentDisplay` | `src/react/CitationContentDisplay.tsx` | Variant rendering (chip, superscript, badge, etc.) |
| `getUrlAccessExplanation()` | `src/react/urlAccessExplanation.ts` | URL access failure explanation mapping |
| `UrlAccessExplanationSection` | `src/react/DefaultPopoverContent.tsx` | URL access failure display component (private) |
| `CitationErrorBoundary` | `src/react/CitationErrorBoundary.tsx` | Error boundary for citation components |
| `SearchAnalysisSummary` | `src/react/SearchAnalysisSummary.tsx` | Search attempt display component |
| `citationContainerVariants()` | `src/react/citationVariants.cva.ts` | Variant → container class resolver |
| `citationHoverVariants()` | `src/react/citationVariants.cva.ts` | Status + opacity → hover class resolver |
| `LINTER_STYLES` | `src/react/citationVariants.cva.ts` | Linter underline CSS by status |
| `LINTER_HOVER_CLASSES` | `src/react/citationVariants.cva.ts` | Linter hover classes by status |
| `BADGE_HOVER_CLASSES` | `src/react/citationVariants.cva.ts` | Badge hover classes by status |
| `resolveStatusKey()` | `src/react/citationVariants.cva.ts` | Boolean flags → status key |
| `SUPERSCRIPT_STYLE` | `src/react/citationVariants.cva.ts` | Superscript inline styles |
| `handleImageError()` | `src/react/imageUtils.ts` | Shared image error handler (`display: "none"`) |
| `handleImageErrorOpacity()` | `src/react/imageUtils.ts` | Shared image error handler (`opacity: "0"`, preserves layout) |
| `HIDE_SCROLLBAR_STYLE` | `src/react/constants.ts` | Scrollbar-hiding CSS (`scrollbarWidth: "none"`) |
| `acquireScrollLock()`, `releaseScrollLock()` | `src/react/scrollLock.ts` | Ref-counted body scroll lock (shared by popover + drawer) |
| `triggerHaptic()` | `src/react/haptics.ts` | Fire haptic feedback for a named interaction event |
| `HapticEvent` | `src/react/haptics.ts` | Union type of haptic event names ("expand" \| "collapse") |
| `useDrawerDragToClose()` | `src/react/hooks/useDrawerDragToClose.ts` | Drag-to-close gesture for bottom-sheet drawer |
| `DRAWER_DRAG_CLOSE_THRESHOLD_PX` | `src/react/constants.ts` | Drag distance threshold for drawer close (80px) |
| `HITBOX_EXTEND_8` | `src/react/constants.ts` | Invisible hit-box extender — uniform 8px |
| `HITBOX_EXTEND_8x14` | `src/react/constants.ts` | Invisible hit-box extender — 8px horizontal, 14px vertical |
| `usePopoverDismiss()` | `src/react/hooks/usePopoverDismiss.ts` | Platform-aware outside-click dismiss |
| `usePopoverPosition()` | `src/react/hooks/usePopoverPosition.ts` | Expanded-page side offset calculation |
| `useCitationTelemetry()` | `src/react/hooks/useCitationTelemetry.ts` | Popover timing + spinner staging |
| `useZoomControls()` | `src/react/hooks/useZoomControls.ts` | Zoom state with clamping and steps |
| `useCitationData()` | `src/react/hooks/useCitationData.ts` | Citation key, instance ID, status derivation |
| `useCitationEvents()` | `src/react/hooks/useCitationEvents.ts` | Click/hover/keyboard event handlers |
| `useExpandedPageSideOffset()` | `src/react/hooks/useExpandedPageSideOffset.ts` | Expanded-page popover vertical offset |
| `usePopoverAlignOffset()` | `src/react/hooks/usePopoverAlignOffset.ts` | Horizontal viewport clamping (replaces shift middleware) |
| `useViewportBoundaryGuard()` | `src/react/hooks/useViewportBoundaryGuard.ts` | Hard viewport boundary guard (Layer 3 safety net) |
| `VIEWPORT_MARGIN_PX` | `src/react/constants.ts` | Viewport edge margin for popover positioning (16px) |
| `useAnimatedHeight()` | `src/react/hooks/useAnimatedHeight.ts` | Imperative height animation for viewState transitions |
| `useAnimationState()` | `src/react/hooks/useAnimationState.ts` | Enter/exit animation lifecycle |
| `useWheelZoom()` | `src/react/hooks/useWheelZoom.ts` | Wheel/trackpad zoom with gesture anchor |
| `EXPANDED_POPOVER_MID_WIDTH` | `src/react/expandedWidthPolicy.ts` | Mid-width fallback for expanded popover states |
| `getExpandedPopoverWidth()` | `src/react/expandedWidthPolicy.ts` | Computes expanded popover width from image width |
| `getInteractionClasses()` | `src/react/CitationContentDisplay.utils.ts` | Hover/active interaction classes for citation triggers |
| `VARIANTS_WITH_OWN_HOVER` | `src/react/CitationContentDisplay.utils.ts` | Set of variants handling own hover styling |
| `openedViaKeyboardRef` | `src/react/Citation.tsx` | Tracks keyboard vs mouse/touch open (focus trap + focus return) |
| `UrlCitationComponent` | `src/react/Citation.tsx` | URL citation display (badge/chip/inline/bracket variants) — co-located with CitationComponent |
| `MemoizedUrlCitationComponent` | `src/react/Citation.tsx` | Memoized URL citation component |
| `AnimatedHeightWrapper` | `src/react/DefaultPopoverContent.tsx` | Height morph wrapper (keep DOM, never Fragment) |

### Example

```typescript
// WRONG — re-exporting a variable from another module
export { getCitationStatus } from "../../parsing/parseCitation.js"; // ❌ DO NOT

// WRONG — creating an alias
export const BROKEN_WAVY_UNDERLINE_STYLE = MISS_WAVY_UNDERLINE_STYLE; // ❌ DO NOT

// CORRECT — import directly from canonical location
import { getCitationStatus } from "../../parsing/parseCitation.js"; // ✓
import { generateCitationKey } from "../../react/utils.js";         // ✓
import { getIndicator } from "../../markdown/markdownVariants.js";   // ✓
```

## Important: Type Safety

### Discriminated Unions Must Be Complete

When a type uses a discriminator field (e.g., `type: "url" | "document"`), **every function that creates instances of that type must set the discriminator**. After adding or modifying a discriminator field, grep for all constructors, factories, and parsing functions that produce that type and ensure they set the field correctly.

```typescript
// WRONG — parseCitation creates a Citation but never sets type
return { pageNumber, lineIds, fullPhrase }; // ❌ Missing type: "document"

// CORRECT
return { type: "document", pageNumber, lineIds, fullPhrase }; // ✓
```

### No Unsafe Casts

**Avoid `as unknown as T` casts.** Use type guards instead:

```typescript
// WRONG
const doc = citation as unknown as DocumentCitation; // ❌

// CORRECT
if (isDocumentCitation(citation)) {
  // TypeScript now knows citation is DocumentCitation
}
```

If a cast is truly unavoidable, add a comment explaining why it's safe.

### Export Verification

When adding new public types or functions, verify they are exported from the appropriate index file:
- Core types/functions → `src/index.ts`
- React components → `src/react/index.ts`

Missing exports have required follow-up fix PRs in the past. Check before submitting.

## Important: Internal vs External Data

### Line IDs are Internal Only

**Do NOT expose `lineIds` to end users.** Line IDs are internal identifiers used by the verification system and do not correspond directly to visible line numbers in documents.

- **Internal use**: `lineIds` are used for verification matching and stored in `Citation.lineIds`
- **User-facing display**: Show only `pageNumber` (e.g., "Page 3") — never show line IDs
- **Markdown output**: Reference sections should show page numbers only

```typescript
`Page 3, Lines 12-15`  // ❌ Confusing - these aren't visible line numbers
`Page 3`               // ✓ Clear and verifiable
```

### Humanizing Line Position (Acceptable)

You **can** humanize line IDs into relative positions for location mismatch context:

```typescript
`Page 3 (expected early, found middle)`  // ✓ Helpful context without exposing internals
`Page 3, Lines 12-15`                    // ❌ Raw line IDs
```

## Important: Popover Positioning — No Collision Avoidance

The custom popover (`Popover.tsx`) has no flip/shift middleware. The locked side (`useLockedPopoverSide`) handles placement for the popover's entire lifecycle — picking a side once on open and never changing it.

### Design Principle

Pick a side once, stick with it for the popover's entire lifecycle (matches Linear/Notion/Vercel behavior). Handle overflow with CSS constraints, not middleware-based repositioning.

### Three-Layer Positioning Defense

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| 1. Popover.tsx | `transform: translate3d(x,y,0)` | Primary positioning (computePosition) |
| 2. Hooks | `sideOffset` + `alignOffset` props | Optimize common cases |
| 3. Guard | CSS `translate` property (`useViewportBoundaryGuard`) | Hard safety net — catches everything |

### How Overflow Is Handled

- **Vertical**: `useLockedPopoverSide` picks top/bottom once on open. `useExpandedPageSideOffset` positions expanded-page at 1rem from viewport edge.
- **Horizontal**: `usePopoverAlignOffset` measures the rendered popover width and computes an `alignOffset` that clamps the popover within 1rem of both viewport edges. Uses ResizeObserver + window resize for reactive re-computation.
- **Size**: CSS `maxWidth: calc(100dvw - 2rem)` / `maxHeight: calc(100dvh - 2rem)` constrains all states.
- **Guard**: `useViewportBoundaryGuard` observes the popover's actual rendered rect and applies corrective CSS `translate` if any edge overflows. Uses CSS `translate` (separate from the wrapper's `transform`) so corrections compose additively. If Layers 1–2 got it right, the guard is a no-op.

### Correct Pattern

```tsx
// Citation.tsx — <PopoverContent> props
side={lockedSide}              // Same side for all view states
sideOffset={expandedPageSideOffset}  // Positions expanded-page at viewport edge
alignOffset={popoverAlignOffset}     // Horizontal viewport clamping
```

### Expanded-Page Side Offset

The `useExpandedPageSideOffset` hook computes a `sideOffset` that positions the expanded-page popover at 1rem from the viewport edge, respecting the locked side:
- **`side="bottom"`**: `sideOffset = 16 - triggerRect.bottom` — top edge at 1rem from viewport top
- **`side="top"`**: `sideOffset = triggerRect.top - (viewportHeight - 16)` — bottom edge at 1rem from viewport bottom

### Horizontal Align Offset

The `usePopoverAlignOffset` hook computes an `alignOffset` that prevents horizontal viewport overflow. With `align="start"`, it calculates where the popover edges would be and shifts if either edge would be within 1rem of the viewport boundary. Uses `useLayoutEffect` so the correction is applied before paint — no flash.

### Related: `EXPANDED_POPOVER_HEIGHT` Must Be Fixed

The base `maxHeight` in `Popover.tsx` uses `EXPANDED_POPOVER_HEIGHT` from `constants.ts`. This must be a fixed `calc(100vh - 2rem)`, **not** tied to trigger scroll position. A dynamic value would cause the popover to visibly resize on scroll.

## Important: Accessibility Patterns

The popover system has specific accessibility patterns that must be preserved. The custom popover (`Popover.tsx` + `PopoverPrimitives.tsx`) does not provide focus trapping, focus return, or status announcements — these are handled by CitationComponent.

### Focus Trap via `inert` Attribute

**NEVER set `inert` on `document.body` when portaling content into it.** The popover portal renders inside `document.body` — setting `inert` on body makes the popover itself inert.

The focus trap in `Citation.tsx` uses `inert` to prevent Tab from escaping the popover into background content. It only activates for keyboard-opened popovers (`openedViaKeyboardRef.current === true`):

```typescript
// CORRECT — inert on <main>, popover portal is a sibling
const main = document.querySelector("main");
if (main) {
  main.setAttribute("inert", "");
  return () => main.removeAttribute("inert");
}

// CORRECT fallback — inert each body child, skip the popover's portal
for (const child of Array.from(document.body.children)) {
  if (popoverEl && child.contains(popoverEl)) continue;
  child.setAttribute("inert", "");
}

// WRONG — makes the popover itself inert
document.body.setAttribute("inert", ""); // ❌ NEVER
```

### Conditional Focus Return (`openedViaKeyboardRef`)

`onCloseAutoFocus` is conditional: keyboard-opened popovers return focus to the trigger (so the user can continue navigating); mouse/touch-opened popovers suppress focus return (which would scroll-jump the trigger into view, disorienting users who have scrolled away).

```typescript
// The ref is set in handleKeyDown (true) and handleClick (false)
onCloseAutoFocus={(e: Event) => {
  if (!openedViaKeyboardRef.current) {
    e.preventDefault(); // Suppress scroll-jump for mouse-opened
  }
  openedViaKeyboardRef.current = false;
}}
```

**Do NOT unconditionally `e.preventDefault()` in `onCloseAutoFocus`.** This was a previous pattern that broke keyboard navigation.

### aria-live Region for Status Transitions

When verification status changes while the popover is open (pending → verified/partial/miss), a hidden `aria-live` region announces the change to screen readers.

**The `aria-live` container must always be rendered (even when empty).** Screen readers only announce content *changes within an existing container*. A newly-inserted container with pre-populated text is NOT reliably announced.

```tsx
// CORRECT — always in the DOM, content changes trigger announcement
const statusLiveRegion = (
  <div aria-live="polite" aria-atomic="true" className="sr-only">
    {statusAnnouncement}  {/* empty string initially, set on transition */}
  </div>
);

// WRONG — conditional render means first announcement is missed
const statusLiveRegion = statusAnnouncement
  ? <div aria-live="polite">{statusAnnouncement}</div>  // ❌
  : null;
```

**The announcement text must be cleared** when re-entering pending state (`setStatusAnnouncement("")`) so React detects the state change when setting it again on the next resolution. Without clearing, React skips identical state updates and the second transition is silent.

### Reduced Motion: Keep Wrapper DOM, Zero Duration

**When `prefersReducedMotion` is true, `AnimatedHeightWrapper` keeps its wrapper `<div>` structure** and passes `0` for durations to `useAnimatedHeight`. It must NOT return a Fragment.

```typescript
// CORRECT — wrapper stays, animation is instant
<AnimatedHeightWrapper viewState={viewState}>  {/* passes 0ms */}
  {children}
</AnimatedHeightWrapper>

// WRONG — Fragment removes wrapper, causes layout shift
if (prefersReducedMotion) return <>{children}</>; // ❌ DO NOT
```

**`useAnimatedHeight` bails out when duration is 0**, clearing all inline styles immediately. A 0ms CSS transition does NOT fire `transitionend` (per CSS Transitions spec §3.1), so the `onTransitionEnd` cleanup on the wrapper would never run — leaving stale `overflow: hidden` that clips content.

### Arrow Key Panning in Expanded-Page

`InlineExpandedImage` (in `EvidenceTray.tsx`) supports arrow key panning for keyboard-only users:
- Default: **50px** per keypress
- **Shift+Arrow**: **200px** per keypress (large pan)
- All four directions supported (ArrowLeft/Right → `scrollLeft`, ArrowUp/Down → `scrollTop`)
