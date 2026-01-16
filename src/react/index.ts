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
  UrlFetchStatus,
  UrlCitationMeta,
  UrlCitationProps,
  UrlCitationVariant,
  // Behavior configuration types
  CitationBehaviorConfig,
  CitationBehaviorContext,
  CitationBehaviorActions,
  CitationClickBehavior,
  CitationHoverBehavior,
} from "./types.js";

// URL Utilities - For handling URL citation metadata
export {
  extractDomain,
  isBlockedStatus,
  isErrorStatus,
  isVerifiedStatus,
} from "./UrlCitationComponent.js";

// Utilities - For generating citation keys and display text
export {
  generateCitationKey,
  generateCitationInstanceId,
  getCitationDisplayText,
  getCitationNumber,
  getCitationKeySpanText,
  classNames,
  CITATION_X_PADDING,
  CITATION_Y_PADDING,
} from "./utils.js";

// Components
export {
  CitationComponent,
  MemoizedCitationComponent,
  type CitationVariant,
  type CitationComponentProps,
} from "./CitationComponent.js";

// Icons
export {
  DeepCitationIcon,
  CheckIcon,
  SpinnerIcon,
  WarningIcon,
} from "./icons.js";
