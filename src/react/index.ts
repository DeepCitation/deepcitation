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

// Components
export {
  CitationComponent,
  type CitationComponentProps,
  type CitationVariant,
  INDICATOR_SIZE_STYLE,
  MemoizedCitationComponent,
} from "./CitationComponent.js";
// Citation Drawer (ChatGPT-style bottom sheet)
export {
  CitationDrawer,
  CitationDrawerItemComponent,
  groupCitationsBySource,
  useCitationDrawer,
} from "./CitationDrawer.js";
// Citation Overlay Context (for blocking hover when image is expanded)
export {
  CitationOverlayProvider,
  useCitationOverlay,
  useHasCitationOverlayProvider,
} from "./CitationOverlayContext.js";
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
  MemoizedPrefetchedPopoverImage,
  PrefetchedPopoverImage,
  prefetchImages,
  usePrefetchImage,
} from "./PrefetchedPopoverImage.js";
// Sources List Components (Anthropic-style aggregated citations)
export {
  detectSourceType,
  getPlatformName,
  MemoizedSourcesListComponent,
  MemoizedSourcesListItem,
  MemoizedSourcesTrigger,
  SourcesListComponent,
  SourcesListItem,
  SourcesTrigger,
  // Utilities
  sourceCitationsToListItems,
  useSourcesList,
} from "./SourcesListComponent.js";
// Diff Display Components (Enhanced diff visualization)
export {
  CollapsibleText,
  type DiffDisplayMode,
  getContextualStatusMessage,
  MatchQualityBar,
  SplitDiffDisplay,
  type SplitDiffDisplayProps,
} from "./SplitDiffDisplay.js";
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
  // Utilities
  extractDomain,
  isAccessibleStatus,
  isBlockedStatus,
  isErrorStatus,
  isRedirectedStatus,
  isVerifiedStatus,
  MemoizedUrlCitationComponent,
  STATUS_ICONS as URL_STATUS_ICONS,
  UrlCitationComponent,
  urlDisplayUtils,
  useUrlMeta,
} from "./UrlCitationComponent.js";
// Smart Diff Hook
export {
  type DiffBlock,
  type DiffBlockType,
  type DiffPart,
  useSmartDiff,
} from "./useSmartDiff.js";
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
