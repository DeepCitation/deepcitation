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

// Types - Useful for implementing your own citation components
export type {
  CitationContentProps,
  CitationRenderProps,
  CitationTooltipProps,
  CitationStyles,
  CitationStateClasses,
  CitationCursorClasses,
  CitationEventHandlers,
  CitationVariant as CitationVariantType,
  CitationContent,
  CitationInteractionMode,
  // URL citation types
  UrlFetchStatus,
  UrlCitationMeta,
  UrlCitationProps,
  UrlCitationVariant,
  // URL content verification types
  ContentMatchStatus,
  UrlVerificationMeta,
  // Behavior configuration types
  CitationBehaviorConfig,
  CitationBehaviorContext,
  CitationBehaviorActions,
  CitationClickBehavior,
  CitationHoverBehavior,
  // Sources list types (Anthropic-style aggregated citations)
  SourcesListVariant,
  SourcesListItemProps,
  SourcesListHeaderConfig,
  SourcesListProps,
  SourcesTriggerProps,
  // ChatGPT-style drawer types
  CitationDrawerItem,
  CitationDrawerItemProps,
  CitationDrawerProps,
  SourceCitationGroup,
  SourceChipProps,
  GroupCitationsBySource,
} from "./types.js";

// URL Citation Component - For displaying URL citations
export {
  UrlCitationComponent,
  MemoizedUrlCitationComponent,
  useUrlMeta,
  urlDisplayUtils,
  STATUS_ICONS as URL_STATUS_ICONS,
  // Utilities
  extractDomain,
  isBlockedStatus,
  isErrorStatus,
  isAccessibleStatus,
  isRedirectedStatus,
  isVerifiedStatus,
} from "./UrlCitationComponent.js";

// Utilities - For generating citation keys and display text
export {
  generateCitationKey,
  generateCitationInstanceId,
  getCitationDisplayText,
  getCitationNumber,
  getCitationAnchorText,
  classNames,
  isUrlCitation,
  CITATION_X_PADDING,
  CITATION_Y_PADDING,
} from "./utils.js";

// Components
export {
  CitationComponent,
  MemoizedCitationComponent,
  INDICATOR_SIZE_STYLE,
  type CitationVariant,
  type CitationComponentProps,
} from "./CitationComponent.js";

// Citation Overlay Context (for blocking hover when image is expanded)
export {
  CitationOverlayProvider,
  useCitationOverlay,
  useHasCitationOverlayProvider,
} from "./CitationOverlayContext.js";

// Icons
export {
  DeepCitationIcon,
  CheckIcon,
  SpinnerIcon,
  WarningIcon,
  LinkIcon,
  ExternalLinkIcon,
  CloseIcon,
  LockIcon,
  DocumentIcon,
  GlobeIcon,
  XCircleIcon,
  XIcon,
} from "./icons.js";

// Sources List Components (Anthropic-style aggregated citations)
export {
  SourcesListComponent,
  MemoizedSourcesListComponent,
  SourcesListItem,
  MemoizedSourcesListItem,
  SourcesTrigger,
  MemoizedSourcesTrigger,
  // Utilities
  sourceCitationsToListItems,
  useSourcesList,
  detectSourceType,
  getPlatformName,
} from "./SourcesListComponent.js";

// Citation Drawer (ChatGPT-style bottom sheet)
export {
  CitationDrawer,
  CitationDrawerItemComponent,
  groupCitationsBySource,
  useCitationDrawer,
} from "./CitationDrawer.js";

// Prefetch utilities (for pre-rendering images before hover)
export {
  PrefetchedPopoverImage,
  MemoizedPrefetchedPopoverImage,
  usePrefetchImage,
  prefetchImages,
} from "./PrefetchedPopoverImage.js";

// Diff Display Components (Enhanced diff visualization)
export {
  SplitDiffDisplay,
  MatchQualityBar,
  CollapsibleText,
  getContextualStatusMessage,
  type DiffDisplayMode,
  type SplitDiffDisplayProps,
} from "./SplitDiffDisplay.js";

// Verification Tabs Component
export { VerificationTabs } from "./VerificationTabs.js";

// Smart Diff Hook
export { useSmartDiff, type DiffBlock, type DiffPart, type DiffBlockType } from "./useSmartDiff.js";

// Verification Log Components (Search attempt timeline display)
export {
  VerificationLog,
  StatusHeader,
  QuoteBox,
  QuotedText,
  AttemptingToVerify,
  SourceContextHeader,
  FaviconImage,
  type VerificationLogProps,
  type StatusHeaderProps,
  type QuoteBoxProps,
  type QuotedTextProps,
  type AttemptingToVerifyProps,
  type SourceContextHeaderProps,
} from "./VerificationLog.js";
