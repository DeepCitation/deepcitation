import React, { forwardRef, memo, type ReactNode, useCallback, useMemo } from "react";
import { getCitationStatus } from "../parsing/parseCitation.js";
import type { Citation, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import {
  ERROR_COLOR_STYLE,
  INDICATOR_SIZE_STYLE,
  MISS_WAVY_UNDERLINE_STYLE,
  PARTIAL_COLOR_STYLE,
  VERIFIED_COLOR_STYLE,
} from "./constants.js";
import { XIcon } from "./icons.js";
import type { BaseCitationProps, CitationEventHandlers, CitationVariant as CitationVariantType } from "./types.js";
import {
  classNames,
  generateCitationInstanceId,
  generateCitationKey,
  getCitationDisplayText,
  getCitationNumber,
} from "./utils.js";

const TWO_DOTS_THINKING_CONTENT = "..";

/**
 * Shared props for all citation variant components.
 */
export interface CitationVariantProps extends BaseCitationProps {
  /** Found citation highlight location data */
  verification?: Verification | null;
  /** Event handlers */
  eventHandlers?: CitationEventHandlers;
  /** Whether on mobile device */
  isMobile?: boolean;
  /** Whether tooltips should be prevented */
  preventTooltips?: boolean;
  /** Custom pending text content */
  pendingContent?: ReactNode;
  /** Custom render function for verified indicator */
  renderVerifiedIndicator?: (status: CitationStatus) => ReactNode;
  /** Custom render function for partial match indicator */
  renderPartialIndicator?: (status: CitationStatus) => ReactNode;
}

/**
 * Hook to get common citation data.
 * NOTE: Status is not memoized because verification may be mutated in place.
 */
function useCitationData(citation: Citation, verification?: Verification | null) {
  const citationKey = useMemo(() => generateCitationKey(citation), [citation]);
  const citationInstanceId = useMemo(() => generateCitationInstanceId(citationKey), [citationKey]);
  // Don't memoize - object reference as dependency causes stale values on mutation
  const status = getCitationStatus(verification ?? null);
  return { citationKey, citationInstanceId, status };
}

/**
 * Default verified indicator (checkmark).
 * Color is customizable via CSS custom property `--dc-verified-color`.
 */
const DefaultVerifiedIndicator = () => (
  <span className="ml-0.5" style={VERIFIED_COLOR_STYLE} aria-hidden="true">
    ✓
  </span>
);

/**
 * Default partial match indicator (asterisk).
 * Color is customizable via CSS custom property `--dc-partial-color`.
 */
const DefaultPartialIndicator = () => (
  <span className="ml-0.5" style={PARTIAL_COLOR_STYLE} aria-hidden="true">
    *
  </span>
);

/**
 * Hook for shared citation event handlers.
 * Extracts the duplicated click/hover/keyboard logic from each variant.
 */
function useCitationEvents(
  citation: Citation,
  citationKey: string,
  eventHandlers: CitationEventHandlers | undefined,
  preventTooltips: boolean,
) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      eventHandlers?.onClick?.(citation, citationKey, e as React.MouseEvent<HTMLSpanElement>);
    },
    [eventHandlers, citation, citationKey],
  );

  const handleMouseEnter = useCallback(() => {
    eventHandlers?.onMouseEnter?.(citation, citationKey);
  }, [eventHandlers, citation, citationKey]);

  const handleMouseLeave = useCallback(() => {
    eventHandlers?.onMouseLeave?.(citation, citationKey);
  }, [eventHandlers, citation, citationKey]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        eventHandlers?.onClick?.(citation, citationKey, e as unknown as React.MouseEvent<HTMLSpanElement>);
      }
    },
    [eventHandlers, citation, citationKey],
  );

  return {
    onMouseEnter: preventTooltips ? undefined : handleMouseEnter,
    onMouseLeave: preventTooltips ? undefined : handleMouseLeave,
    onMouseDown: handleClick,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: handleKeyDown,
  };
}

/**
 * Shared status indicator rendering for citation variants.
 * Renders the appropriate verified/partial/miss/pending indicator.
 */
function StatusIndicators({
  status,
  pendingContent,
  renderVerifiedIndicator,
  renderPartialIndicator,
  pendingClassName,
}: {
  status: CitationStatus;
  pendingContent: ReactNode;
  renderVerifiedIndicator: (s: CitationStatus) => ReactNode;
  renderPartialIndicator: (s: CitationStatus) => ReactNode;
  pendingClassName?: string;
}) {
  const { isVerified, isMiss, isPartialMatch, isPending } = status;
  return (
    <>
      {isPartialMatch && renderPartialIndicator(status)}
      {isVerified && !isPartialMatch && renderVerifiedIndicator(status)}
      {isMiss && (
        <>
          <span
            className="ml-0.5 shrink-0"
            style={{ ...INDICATOR_SIZE_STYLE, ...ERROR_COLOR_STYLE }}
            aria-hidden="true"
          >
            <XIcon />
          </span>
          <span className="sr-only">not found</span>
        </>
      )}
      {isPending && <span className={pendingClassName ?? "opacity-70"}>{pendingContent}</span>}
    </>
  );
}

// =============================================================================
// CHIP VARIANT - Pill/badge style citation
// =============================================================================

export interface ChipCitationProps extends CitationVariantProps {
  /** Chip size */
  size?: "sm" | "md" | "lg";
  /** Whether to show an icon before the text */
  showIcon?: boolean;
  /** Custom icon to display */
  icon?: ReactNode;
}

/**
 * Chip/Badge style citation component.
 * Displays citation as a rounded pill/badge.
 *
 * @example
 * ```tsx
 * <ChipCitation citation={citation} verification={found} size="md" />
 * ```
 */
export const ChipCitation = forwardRef<HTMLSpanElement, ChipCitationProps>(
  (
    {
      citation,
      children,
      className,
      fallbackDisplay,
      verification,
      eventHandlers,
      preventTooltips = false,
      pendingContent = TWO_DOTS_THINKING_CONTENT,
      renderVerifiedIndicator = () => <DefaultVerifiedIndicator />,
      renderPartialIndicator = () => <DefaultPartialIndicator />,
      showIcon = false,
      icon,
    },
    ref,
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(citation, verification);
    const { isVerified, isMiss, isPartialMatch, isPending } = status;
    const events = useCitationEvents(citation, citationKey, eventHandlers, preventTooltips);

    // ChipCitation shows anchorText by default
    const displayText = useMemo(
      () => getCitationDisplayText(citation, { fallbackDisplay }),
      [citation, fallbackDisplay],
    );

    // Check partial first since isVerified is true when isPartialMatch is true
    const statusClass = isPartialMatch
      ? "bg-amber-100 dark:bg-amber-900/30"
      : isMiss
        ? "bg-red-100 dark:bg-red-900/30"
        : isVerified
          ? "bg-green-100 dark:bg-green-900/30"
          : isPending
            ? "bg-gray-100 dark:bg-gray-800"
            : "bg-blue-100 dark:bg-blue-900/30";

    const borderClass = isPartialMatch
      ? "border-amber-200 dark:border-amber-700"
      : isMiss
        ? "border-red-200 dark:border-red-700"
        : isVerified
          ? "border-green-200 dark:border-green-700"
          : isPending
            ? "border-gray-200 dark:border-gray-700"
            : "border-blue-200 dark:border-blue-700";

    const hoverClass = isPartialMatch
      ? "hover:bg-amber-200 dark:hover:bg-amber-800/40"
      : isMiss
        ? "hover:bg-red-200 dark:hover:bg-red-800/40"
        : isVerified
          ? "hover:bg-green-200 dark:hover:bg-green-800/40"
          : isPending
            ? "hover:bg-gray-200 dark:hover:bg-gray-700"
            : "hover:bg-blue-200 dark:hover:bg-blue-800/40";

    const textColorClass = isPartialMatch
      ? "text-amber-500 dark:text-amber-400"
      : isMiss
        ? "text-red-600 dark:text-red-400"
        : isVerified
          ? "text-green-600 dark:text-green-500"
          : isPending
            ? "text-gray-500 dark:text-gray-400"
            : "text-blue-600 dark:text-blue-400";

    return (
      <>
        {children}
        <span
          ref={ref}
          role="button"
          tabIndex={0}
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="chip"
          className={classNames(
            "inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full font-normal cursor-pointer transition-colors text-[0.9em]",
            "border",
            statusClass,
            borderClass,
            hoverClass,
            className,
          )}
          {...events}
          aria-label={displayText ? `Citation: ${displayText}` : undefined}
        >
          {showIcon && (icon || <span className="text-[0.9em]">📄</span>)}
          <span className={classNames(textColorClass, isMiss && "opacity-70")}>{displayText}</span>
          <StatusIndicators
            status={status}
            pendingContent={pendingContent}
            renderVerifiedIndicator={renderVerifiedIndicator}
            renderPartialIndicator={renderPartialIndicator}
          />
        </span>
      </>
    );
  },
);

ChipCitation.displayName = "ChipCitation";

// =============================================================================
// SUPERSCRIPT VARIANT - Academic superscript style
// =============================================================================

export interface SuperscriptCitationProps extends CitationVariantProps {
  /** Whether to hide brackets around the superscript */
  hideBrackets?: boolean;
}

/**
 * Superscript style citation component.
 * Displays citation as a superscript number like academic papers.
 *
 * @example
 * ```tsx
 * <SuperscriptCitation citation={citation} verification={found} />
 * // Renders: Text content¹
 * ```
 */
export const SuperscriptCitation = forwardRef<HTMLSpanElement, SuperscriptCitationProps>(
  (
    {
      citation,
      children,
      className,
      verification,
      eventHandlers,
      preventTooltips = false,
      pendingContent = TWO_DOTS_THINKING_CONTENT,
      renderVerifiedIndicator = () => <DefaultVerifiedIndicator />,
      renderPartialIndicator = () => <DefaultPartialIndicator />,
      hideBrackets = false,
    },
    ref,
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(citation, verification);
    const { isPartialMatch, isMiss, isVerified, isPending } = status;
    const events = useCitationEvents(citation, citationKey, eventHandlers, preventTooltips);

    // SuperscriptCitation shows number by default
    const displayText = useMemo(() => getCitationNumber(citation), [citation]);

    // Check partial first since isVerified is true when isPartialMatch is true
    const statusClass = isPartialMatch
      ? "text-amber-500 dark:text-amber-400"
      : isMiss
        ? "text-red-500 dark:text-red-400"
        : isVerified
          ? "text-green-600 dark:text-green-500"
          : isPending
            ? "text-gray-400 dark:text-gray-500"
            : "text-blue-600 dark:text-blue-400";

    return (
      <>
        {children}
        <sup
          ref={ref}
          role="button"
          tabIndex={0}
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="superscript"
          className={classNames(
            "text-xs cursor-pointer font-medium transition-colors hover:underline inline-flex items-center",
            statusClass,
            className,
          )}
          {...events}
          aria-label={`Citation ${displayText}`}
        >
          {!hideBrackets && "["}
          <span>{displayText}</span>
          <StatusIndicators
            status={status}
            pendingContent={pendingContent}
            renderVerifiedIndicator={renderVerifiedIndicator}
            renderPartialIndicator={renderPartialIndicator}
          />
          {!hideBrackets && "]"}
        </sup>
      </>
    );
  },
);

SuperscriptCitation.displayName = "SuperscriptCitation";

// =============================================================================
// FOOTNOTE VARIANT - Footnote marker style
// =============================================================================

export interface FootnoteCitationProps extends CitationVariantProps {
  /** Footnote symbol style */
  symbolStyle?: "number" | "asterisk" | "dagger" | "custom";
  /** Custom symbol (when symbolStyle is "custom") */
  customSymbol?: string;
}

const FOOTNOTE_SYMBOLS = ["*", "†", "‡", "§", "‖", "¶"];

/**
 * Footnote style citation component.
 * Displays citation as a footnote marker.
 *
 * @example
 * ```tsx
 * <FootnoteCitation citation={citation} symbolStyle="asterisk" />
 * // Renders: Text content*
 * ```
 */
export const FootnoteCitation = forwardRef<HTMLSpanElement, FootnoteCitationProps>(
  (
    {
      citation,
      children,
      className,
      verification,
      eventHandlers,
      preventTooltips = false,
      pendingContent = TWO_DOTS_THINKING_CONTENT,
      renderVerifiedIndicator = () => <DefaultVerifiedIndicator />,
      renderPartialIndicator = () => <DefaultPartialIndicator />,
      symbolStyle = "number",
      customSymbol,
    },
    ref,
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(citation, verification);
    const { isMiss, isPartialMatch, isVerified, isPending } = status;
    const events = useCitationEvents(citation, citationKey, eventHandlers, preventTooltips);

    const displaySymbol = useMemo(() => {
      if (symbolStyle === "custom" && customSymbol) return customSymbol;
      if (symbolStyle === "number") return citation.citationNumber?.toString() || "1";
      if (symbolStyle === "asterisk") return "*";
      if (symbolStyle === "dagger") {
        const num = (citation.citationNumber || 1) - 1;
        return FOOTNOTE_SYMBOLS[num % FOOTNOTE_SYMBOLS.length];
      }
      return "*";
    }, [symbolStyle, customSymbol, citation.citationNumber]);

    // Check partial first since isVerified is true when isPartialMatch is true
    const statusClass = isPartialMatch
      ? "text-amber-500 dark:text-amber-400"
      : isMiss
        ? "text-red-500 dark:text-red-400"
        : isVerified
          ? "text-green-600 dark:text-green-500"
          : isPending
            ? "text-gray-400 dark:text-gray-500"
            : "text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400";

    return (
      <>
        {children}
        <sup
          ref={ref}
          role="button"
          tabIndex={0}
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="footnote"
          className={classNames(
            "text-xs cursor-pointer font-normal transition-colors inline-flex items-center",
            statusClass,
            className,
          )}
          {...events}
          aria-label={`Footnote ${displaySymbol}`}
        >
          <span className={isMiss ? "opacity-70" : undefined} style={isMiss ? MISS_WAVY_UNDERLINE_STYLE : undefined}>
            {displaySymbol}
          </span>
          <StatusIndicators
            status={status}
            pendingContent={pendingContent}
            renderVerifiedIndicator={renderVerifiedIndicator}
            renderPartialIndicator={renderPartialIndicator}
          />
        </sup>
      </>
    );
  },
);

FootnoteCitation.displayName = "FootnoteCitation";

// =============================================================================
// INLINE VARIANT - Subtle inline style with underline
// =============================================================================

export interface InlineCitationProps extends CitationVariantProps {
  /** Underline style */
  underlineStyle?: "solid" | "dotted" | "dashed" | "none";
}

/**
 * Inline style citation component.
 * Displays citation inline with subtle underline decoration.
 *
 * @example
 * ```tsx
 * <InlineCitation citation={citation} underlineStyle="dotted" />
 * // Renders: "quoted text" with subtle underline
 * ```
 */
export const InlineCitation = forwardRef<HTMLSpanElement, InlineCitationProps>(
  (
    {
      citation,
      children,
      className,
      fallbackDisplay,
      verification,
      eventHandlers,
      preventTooltips = false,
      pendingContent = TWO_DOTS_THINKING_CONTENT,
      renderVerifiedIndicator = () => <DefaultVerifiedIndicator />,
      renderPartialIndicator = () => <DefaultPartialIndicator />,
      underlineStyle = "dotted",
    },
    ref,
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(citation, verification);
    const { isMiss, isPartialMatch, isVerified, isPending } = status;
    const events = useCitationEvents(citation, citationKey, eventHandlers, preventTooltips);

    // InlineCitation shows anchorText by default
    const displayText = useMemo(
      () => getCitationDisplayText(citation, { fallbackDisplay }),
      [citation, fallbackDisplay],
    );

    // Check partial first since isVerified is true when isPartialMatch is true
    const statusClass = isPartialMatch
      ? "text-amber-500 dark:text-amber-400"
      : isMiss
        ? "text-red-500 dark:text-red-400"
        : isVerified
          ? "text-green-600 dark:text-green-500"
          : isPending
            ? "text-gray-400 dark:text-gray-500"
            : "";

    const underlineClasses = {
      solid: "border-b border-current",
      dotted: "border-b border-dotted border-current",
      dashed: "border-b border-dashed border-current",
      none: "",
    };

    return (
      <>
        {children}
        <span
          ref={ref}
          role="button"
          tabIndex={0}
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="inline"
          className={classNames(
            "cursor-pointer transition-colors hover:bg-blue-500/5 inline-flex items-baseline",
            underlineClasses[underlineStyle],
            statusClass,
            className,
          )}
          {...events}
          aria-label={`Citation: ${displayText}`}
        >
          <span className={isMiss ? "opacity-70" : undefined} style={isMiss ? MISS_WAVY_UNDERLINE_STYLE : undefined}>
            {displayText}
          </span>
          <StatusIndicators
            status={status}
            pendingContent={pendingContent}
            renderVerifiedIndicator={renderVerifiedIndicator}
            renderPartialIndicator={renderPartialIndicator}
            pendingClassName="opacity-70 ml-1"
          />
        </span>
      </>
    );
  },
);

InlineCitation.displayName = "InlineCitation";

// =============================================================================
// VARIANT FACTORY - Creates the appropriate variant component
// =============================================================================

export interface VariantCitationProps extends CitationVariantProps {
  /** The variant to render */
  variant?: CitationVariantType;
  /** Chip-specific props */
  chipProps?: Partial<ChipCitationProps>;
  /** Superscript-specific props */
  superscriptProps?: Partial<SuperscriptCitationProps>;
  /** Footnote-specific props */
  footnoteProps?: Partial<FootnoteCitationProps>;
  /** Inline-specific props */
  inlineProps?: Partial<InlineCitationProps>;
}

/**
 * Factory component that renders the appropriate citation variant.
 *
 * @example
 * ```tsx
 * <CitationVariantFactory variant="chip" citation={citation} chipProps={{ size: "lg" }} />
 * ```
 */
export const CitationVariantFactory = forwardRef<HTMLSpanElement, VariantCitationProps>(
  ({ variant = "bracket", chipProps, superscriptProps, footnoteProps, inlineProps, ...props }, ref) => {
    switch (variant) {
      case "chip":
        return <ChipCitation ref={ref} {...props} {...chipProps} />;
      case "superscript":
        return <SuperscriptCitation ref={ref} {...props} {...superscriptProps} />;
      case "footnote":
        return <FootnoteCitation ref={ref} {...props} {...footnoteProps} />;
      case "inline":
        return <InlineCitation ref={ref} {...props} {...inlineProps} />;
      default:
        // For bracket variant, we return null here as CitationComponent handles it
        // This factory is meant to be used for alternate variants
        return null;
    }
  },
);

CitationVariantFactory.displayName = "CitationVariantFactory";

// Memoized versions for performance
export const MemoizedChipCitation = memo(ChipCitation);
export const MemoizedSuperscriptCitation = memo(SuperscriptCitation);
export const MemoizedFootnoteCitation = memo(FootnoteCitation);
export const MemoizedInlineCitation = memo(InlineCitation);
export const MemoizedCitationVariantFactory = memo(CitationVariantFactory);
