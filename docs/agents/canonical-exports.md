# Canonical Export Locations

Open this file when importing symbols from deepcitation to find the correct canonical file for each export. **Never re-export variables** — import directly from the canonical location.

## Canonical Locations Table

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
| `EASE_EXPAND` | `src/react/constants.ts` | Spring-like expand easing (~6% overshoot) |
| `VT_EVIDENCE_EXPAND_MS` | `src/react/constants.ts` | Evidence image VT expand duration (180ms) |
| `VT_EVIDENCE_COLLAPSE_MS` | `src/react/constants.ts` | Evidence image VT collapse duration (120ms) |
| `VT_EVIDENCE_DIP_OPACITY` | `src/react/constants.ts` | Cross-fade old-snapshot opacity dip (0.45) |
| `isStrategyOverride()` | `src/drawing/citationDrawing.ts` | True when verifiedFullPhrase === verifiedAnchorText |
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
| `defaultMessages` | `src/react/i18n.tsx` | Default English message dictionary (all i18n keys) |
| `DeepCitationI18nProvider` | `src/react/i18n.tsx` | React context provider for custom translations |
| `useTranslation()` | `src/react/i18n.tsx` | Hook to access the `t()` translator inside components |
| `createTranslator()` | `src/react/i18n.tsx` | Factory for `t()` in non-React contexts (tests, SSR) |
| `tPlural()` | `src/react/i18n.tsx` | Plural form selector using `_one` / `_other` suffix convention |

## Import Example

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
