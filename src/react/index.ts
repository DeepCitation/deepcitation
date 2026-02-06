/**
 * DeepCitation React Utilities
 *
 * Note: UI components have been moved to a shadcn-style copy-paste pattern.
 * See the documentation at https://deepcitation.com/docs/components for
 * ready-to-use React components.
 *
 * This module exports utilities and types that are useful for building
 * your own citation components.
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
export {
  groupCitationsBySource,
  useCitationDrawer,
} from "./CitationDrawer.utils.js";
// Citation Overlay Context (for blocking hover when image is expanded)
export {
  CitationOverlayProvider,
  useCitationOverlay,
  useHasCitationOverlayProvider,
} from "./CitationOverlayContext.js";
// Constants - Shared styling and configuration
export {
  BROKEN_WAVY_UNDERLINE_STYLE,
  COPY_FEEDBACK_DURATION_MS,
  INDICATOR_SIZE_STYLE,
  MISS_WAVY_UNDERLINE_STYLE,
  POPOVER_CONTAINER_BASE_CLASSES,
  WAVY_UNDERLINE_COLOR_VAR,
  WAVY_UNDERLINE_DEFAULT_COLOR,
} from "./constants.js";
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
// Status Message Utilities
export { getContextualStatusMessage } from "./statusMessage.js";
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
  isUrlCitation,
} from "./utils.js";
// Verification Log Components (Search attempt timeline display)
export {
  AttemptingToVerify,
  type AttemptingToVerifyProps,
  FaviconImage,
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
