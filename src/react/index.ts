/**
 * DeepCitation React — Public API Surface
 *
 * This is the package entry point for `@deepcitation/deepcitation-js/react`.
 * It re-exports consumer-facing components, hooks, and utilities.
 *
 * Internal implementation details (extracted hooks, CVA variants, error
 * boundaries, helper components) are NOT re-exported here per CLAUDE.md.
 * Import them directly from their canonical locations:
 *
 * - Hooks: `./hooks/useScrollLock.js`, `./hooks/useZoomControls.js`, etc.
 * - Variants: `./citationVariants.cva.js`
 * - Error boundary: `./CitationErrorBoundary.js`
 * - InlineExpandedImage: `./InlineExpandedImage.js`
 * - SearchAnalysisSummary: `./SearchAnalysisSummary.js`
 * - Image utilities: `./imageUtils.js`
 *
 * @packageDocumentation
 */

// Citation Primitives Namespace (composable building blocks)
export { Citation } from "./Citation.js";
// Components
export {
  CitationComponent,
  type CitationComponentProps,
  type CitationVariant,
  MemoizedCitationComponent,
} from "./CitationComponent.js";
// Citation Drawer (ChatGPT-style bottom sheet)
export {
  CitationDrawer,
  CitationDrawerItemComponent,
} from "./CitationDrawer.js";
// StatusCategory, StatusSection types exported for consumers building custom drawer UIs.
// Functions (computeStatusSummary, groupCitationsByStatus, sortGroupsByWorstStatus)
// are NOT re-exported per CLAUDE.md — import directly from CitationDrawer.utils.js.
export type { StatusCategory, StatusSection } from "./CitationDrawer.utils.js";
export {
  generateDefaultLabel,
  getPrimarySourceName,
  groupCitationsBySource,
  lookupSourceLabel,
  resolveGroupLabels,
  useCitationDrawer,
} from "./CitationDrawer.utils.js";
// Citation Drawer Trigger (compact summary bar)
export {
  CitationDrawerTrigger,
  type CitationDrawerTriggerProps,
  type CitationStatusSummary,
} from "./CitationDrawerTrigger.js";
// Citation Overlay Context (for blocking hover when image is expanded)
export {
  CitationOverlayProvider,
  useCitationOverlay,
  useHasCitationOverlayProvider,
} from "./CitationOverlayContext.js";
// Variant types only — import variant functions directly from ./citationVariants.cva.js
export type { CitationContainerVariants, CitationHoverVariants } from "./citationVariants.cva.js";
// Constants - Shared styling and configuration
export {
  COPY_FEEDBACK_DURATION_MS,
  DOT_INDICATOR_FIXED_SIZE_STYLE,
  DOT_INDICATOR_SIZE_STYLE,
  ERROR_COLOR_DEFAULT,
  ERROR_COLOR_STYLE,
  ERROR_COLOR_VAR,
  getPortalContainer,
  INDICATOR_SIZE_STYLE,
  isValidProofImageSrc,
  MISS_WAVY_UNDERLINE_STYLE,
  PARTIAL_COLOR_DEFAULT,
  PARTIAL_COLOR_STYLE,
  PARTIAL_COLOR_VAR,
  PENDING_COLOR_DEFAULT,
  PENDING_COLOR_STYLE,
  PENDING_COLOR_VAR,
  POPOVER_CONTAINER_BASE_CLASSES,
  POPOVER_WIDTH_DEFAULT,
  POPOVER_WIDTH_VAR,
  SAFE_DATA_IMAGE_PREFIXES,
  TRUSTED_IMAGE_HOSTS,
  TTC_COLOR_DEFAULT,
  TTC_COLOR_VAR,
  TTC_FAST_COLOR_DEFAULT,
  TTC_FAST_COLOR_VAR,
  TTC_FAST_TEXT_STYLE,
  TTC_TEXT_STYLE,
  VERIFIED_COLOR_DEFAULT,
  VERIFIED_COLOR_STYLE,
  VERIFIED_COLOR_VAR,
  WAVY_UNDERLINE_COLOR_VAR,
  WAVY_UNDERLINE_DEFAULT_COLOR,
  Z_INDEX_BACKDROP_DEFAULT,
  Z_INDEX_DRAWER_BACKDROP_VAR,
  Z_INDEX_DRAWER_VAR,
  Z_INDEX_IMAGE_OVERLAY_VAR,
  Z_INDEX_OVERLAY_DEFAULT,
  Z_INDEX_POPOVER_VAR,
} from "./constants.js";
// Evidence types only — import resolveExpandedImage directly from ./EvidenceTray.js
export type { ExpandedImageSource } from "./EvidenceTray.js";
export { resolveExpandedImage } from "./EvidenceTray.js";
// Hook types only — import hook functions directly from their canonical files in ./hooks/
export type { AnimationPhase, UseAnimationStateOptions, UseAnimationStateResult } from "./hooks/useAnimationState.js";
export type { UseCitationDataResult } from "./hooks/useCitationData.js";
export type { UseCitationEventsResult } from "./hooks/useCitationEvents.js";
export type { UseCitationTelemetryOptions, UseCitationTelemetryResult } from "./hooks/useCitationTelemetry.js";
export type { UsePopoverDismissOptions } from "./hooks/usePopoverDismiss.js";
export type { UsePopoverPositionOptions, UsePopoverPositionResult } from "./hooks/usePopoverPosition.js";
export type { UseZoomControlsOptions, UseZoomControlsResult } from "./hooks/useZoomControls.js";
// Accessibility Hooks
export { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
// Icons
export {
  CheckIcon,
  CloseIcon,
  DeepCitationIcon,
  DocumentIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  SpinnerIcon,
  WarningIcon,
  XCircleIcon,
  XIcon,
} from "./icons.js";
// Prefetch utilities (for pre-rendering images before hover)
export {
  clearPrefetchCache,
  MemoizedPrefetchedPopoverImage,
  PrefetchedPopoverImage,
  prefetchImages,
  usePrefetchImage,
} from "./PrefetchedPopoverImage.js";
// Sources List Components (Anthropic-style aggregated citations)
export {
  MemoizedSourcesListComponent,
  MemoizedSourcesListItem,
  MemoizedSourcesTrigger,
  SourcesListComponent,
  SourcesListItem,
  SourcesTrigger,
} from "./SourcesListComponent.js";
// Sources List Utilities
export {
  detectSourceType,
  getFaviconUrl,
  getPlatformName,
  sourceCitationsToListItems,
  useSourcesList,
} from "./SourcesListComponent.utils.js";
// Diff Display Components (Enhanced diff visualization)
export {
  CollapsibleText,
  type DiffDisplayMode,
  MatchQualityBar,
  SplitDiffDisplay,
  type SplitDiffDisplayProps,
} from "./SplitDiffDisplay.js";
// Search Summary Utilities
export { buildSearchSummary, type SearchSummary } from "./searchSummaryUtils.js";
// Status Message Utilities
export { getContextualStatusMessage } from "./statusMessage.js";
// Time to Certainty (TtC) — timing utilities and hooks
export {
  type CitationTimingResult,
  computeTimingMetrics,
  formatTtc,
  getTtcTier,
  REVIEW_DWELL_THRESHOLD_MS,
  TTC_INSTANT_THRESHOLD_MS,
  TTC_MAX_DISPLAY_MS,
  TTC_SLOW_THRESHOLD_MS,
  useCitationTiming,
  useTtcMetrics,
} from "./timingUtils.js";
// Types - Useful for implementing your own citation components
export type {
  CitationBehaviorActions,
  // Behavior configuration types
  CitationBehaviorConfig,
  CitationBehaviorContext,
  CitationClickBehavior,
  CitationContent,
  CitationContentProps,
  CitationCursorClasses,
  // ChatGPT-style drawer types
  CitationDrawerItem,
  CitationDrawerItemProps,
  CitationDrawerProps,
  CitationEventHandlers,
  CitationHoverBehavior,
  CitationInteractionMode,
  CitationRenderProps,
  CitationStateClasses,
  CitationStyles,
  CitationTooltipProps,
  CitationVariant as CitationVariantType,
  // URL content verification types
  ContentMatchStatus,
  GroupCitationsBySource,
  // Indicator variant type
  IndicatorVariant,
  SourceChipProps,
  SourceCitationGroup,
  SourcesListHeaderConfig,
  SourcesListItemProps,
  SourcesListProps,
  // Sources list types (Anthropic-style aggregated citations)
  SourcesListVariant,
  SourcesTriggerProps,
  UrlCitationMeta,
  UrlCitationProps,
  UrlCitationVariant,
  // URL citation types
  UrlFetchStatus,
  UrlVerificationMeta,
} from "./types.js";
// URL Citation Component - For displaying URL citations
export {
  MemoizedUrlCitationComponent,
  UrlCitationComponent,
} from "./UrlCitationComponent.js";
// URL Status utilities
export {
  isAccessibleStatus,
  isBlockedStatus,
  isErrorStatus,
  isRedirectedStatus,
  isVerifiedStatus,
} from "./urlStatus.js";
// URL Display utilities
export {
  extractDomain,
  STATUS_ICONS as URL_STATUS_ICONS,
  safeWindowOpen,
  sanitizeUrl,
  urlDisplayUtils,
} from "./urlUtils.js";
// Citation Context (for accessing citation data within Citation.Root)
export {
  type CitationContextValue,
  useCitationContext,
  useCitationContextSafe,
} from "./useCitationContext.js";
// Smart Diff Hook
export {
  type DiffBlock,
  type DiffBlockType,
  type DiffPart,
  useSmartDiff,
} from "./useSmartDiff.js";
// URL Metadata hook
export { useUrlMeta } from "./useUrlMeta.js";
// Utilities - For generating citation keys and display text
export {
  CITATION_X_PADDING,
  CITATION_Y_PADDING,
  classNames,
  generateCitationInstanceId,
  generateCitationKey,
  getCitationAnchorText,
  getCitationDisplayText,
  getCitationNumber,
  isDocumentCitation,
  isUrlCitation,
} from "./utils.js";
// Verification Log Components (Search attempt timeline display)
export {
  type AmbiguityInfo,
  AmbiguityWarning,
  AttemptingToVerify,
  type AttemptingToVerifyProps,
  FaviconImage,
  LookingForSection,
  QuoteBox,
  type QuoteBoxProps,
  QuotedText,
  type QuotedTextProps,
  SourceContextHeader,
  type SourceContextHeaderProps,
  StatusHeader,
  type StatusHeaderProps,
  VerificationLog,
  type VerificationLogProps,
} from "./VerificationLog.js";
// Verification Tabs Component
export { VerificationTabs } from "./VerificationTabs.js";
// Variation Label Utilities
export { getVariationLabel } from "./variationLabels.js";
