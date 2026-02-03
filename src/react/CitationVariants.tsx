import React, {
  memo,
  useMemo,
  useCallback,
  forwardRef,
  type ReactNode,
} from "react";
import { getCitationStatus } from "../parsing/parseCitation.js";
import type { Citation, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import {
  generateCitationKey,
  generateCitationInstanceId,
  getCitationDisplayText,
  getCitationNumber,
  classNames,
} from "./utils.js";
import type {
  BaseCitationProps,
  CitationVariant as CitationVariantType,
  CitationEventHandlers,
} from "./types.js";
import { XIcon } from "./icons.js";
import { INDICATOR_SIZE_STYLE } from "./CitationComponent.js";

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
function useCitationData(
  citation: Citation,
  verification?: Verification | null
) {
  const citationKey = useMemo(() => generateCitationKey(citation), [citation]);
  const citationInstanceId = useMemo(
    () => generateCitationInstanceId(citationKey),
    [citationKey]
  );
  // Don't memoize - object reference as dependency causes stale values on mutation
  const status = getCitationStatus(verification ?? null);
  return { citationKey, citationInstanceId, status };
}

/**
 * Default verified indicator (checkmark)
 */
const DefaultVerifiedIndicator = () => (
  <span className="text-green-600 dark:text-green-500 ml-0.5" aria-hidden="true">
    ✓
  </span>
);

/**
 * Default partial match indicator (asterisk)
 */
const DefaultPartialIndicator = () => (
  <span className="text-amber-600 dark:text-amber-500 ml-0.5" aria-hidden="true">
    *
  </span>
);

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
      isMobile = false,
      preventTooltips = false,
      pendingContent = TWO_DOTS_THINKING_CONTENT,
      renderVerifiedIndicator = () => <DefaultVerifiedIndicator />,
      renderPartialIndicator = () => <DefaultPartialIndicator />,
      size = "md",
      showIcon = false,
      icon,
    },
    ref
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(
      citation,
      verification
    );
    const { isVerified, isMiss, isPartialMatch, isPending } = status;

    // ChipCitation shows anchorText by default
    const displayText = useMemo(
      () => getCitationDisplayText(citation, { fallbackDisplay }),
      [citation, fallbackDisplay]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        eventHandlers?.onClick?.(citation, citationKey, e);
      },
      [eventHandlers, citation, citationKey]
    );

    const handleMouseEnter = useCallback(() => {
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    const handleMouseLeave = useCallback(() => {
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    const sizeClasses = {
      sm: "text-xs px-1.5 py-px",
      md: "text-sm px-2 py-0.5",
      lg: "text-base px-3 py-1",
    };

    // Check partial first since isVerified is true when isPartialMatch is true
    // Note: For miss state, text gets line-through but status indicator should NOT
    const statusClass = isPartialMatch
      ? "bg-amber-100 dark:bg-amber-900/30"
      : isMiss
      ? "bg-red-100 dark:bg-red-900/30"
      : isVerified
      ? "bg-green-100 dark:bg-green-900/30"
      : isPending
      ? "bg-gray-100 dark:bg-gray-800"
      : "bg-blue-100 dark:bg-blue-900/30";

    // Text color class (separate from status indicator)
    const textColorClass = isPartialMatch
      ? "text-amber-600 dark:text-amber-500"
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
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="chip"
          className={classNames(
            "inline-flex items-center gap-1 rounded-full font-medium cursor-pointer transition-colors",
            "hover:brightness-95",
            sizeClasses[size],
            statusClass,
            className
          )}
          onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
          onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
          onMouseDown={handleClick}
          onClick={(e) => e.stopPropagation()}
          aria-label={displayText ? `Citation: ${displayText}` : undefined}
        >
          {showIcon &&
            (icon || <span className="text-[0.9em]">📄</span>)}
          <span className={classNames("font-medium", textColorClass, isMiss && "line-through opacity-70")}>{displayText}</span>
          {isPartialMatch && renderPartialIndicator(status)}
          {isVerified && !isPartialMatch && renderVerifiedIndicator(status)}
          {isMiss && (
            <>
              <span className="text-red-500 dark:text-red-400 ml-0.5 flex-shrink-0" style={INDICATOR_SIZE_STYLE} aria-hidden="true">
                <XIcon />
              </span>
              <span className="sr-only">not found</span>
            </>
          )}
          {isPending && (
            <span className="opacity-70">{pendingContent}</span>
          )}
        </span>
      </>
    );
  }
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
export const SuperscriptCitation = forwardRef<
  HTMLSpanElement,
  SuperscriptCitationProps
>(
  (
    {
      citation,
      children,
      className,
      fallbackDisplay,
      verification,
      eventHandlers,
      isMobile = false,
      preventTooltips = false,
      pendingContent = TWO_DOTS_THINKING_CONTENT,
      renderVerifiedIndicator = () => <DefaultVerifiedIndicator />,
      renderPartialIndicator = () => <DefaultPartialIndicator />,
      hideBrackets = false,
    },
    ref
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(
      citation,
      verification
    );
    const { isVerified, isMiss, isPartialMatch, isPending } = status;

    // SuperscriptCitation shows number by default
    const displayText = useMemo(
      () => getCitationNumber(citation),
      [citation]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        eventHandlers?.onClick?.(citation, citationKey, e);
      },
      [eventHandlers, citation, citationKey]
    );

    const handleMouseEnter = useCallback(() => {
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    const handleMouseLeave = useCallback(() => {
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    // Check partial first since isVerified is true when isPartialMatch is true
    // Note: For miss state, text gets line-through but status indicator should NOT
    const statusClass = isPartialMatch
      ? "text-amber-600 dark:text-amber-500"
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
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="superscript"
          className={classNames(
            "text-xs cursor-pointer font-medium transition-colors hover:underline inline-flex items-baseline",
            statusClass,
            className
          )}
          onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
          onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
          onMouseDown={handleClick}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Citation ${displayText}`}
        >
          {!hideBrackets && "["}
          <span className={isMiss ? "line-through opacity-70" : undefined}>{displayText}</span>
          {isPartialMatch && renderPartialIndicator(status)}
          {isVerified && !isPartialMatch && renderVerifiedIndicator(status)}
          {isMiss && (
            <>
              <span className="text-red-500 dark:text-red-400 ml-0.5 flex-shrink-0" style={INDICATOR_SIZE_STYLE} aria-hidden="true">
                <XIcon />
              </span>
              <span className="sr-only">not found</span>
            </>
          )}
          {isPending && pendingContent}
          {!hideBrackets && "]"}
        </sup>
      </>
    );
  }
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
export const FootnoteCitation = forwardRef<
  HTMLSpanElement,
  FootnoteCitationProps
>(
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
      symbolStyle = "number",
      customSymbol,
    },
    ref
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(
      citation,
      verification
    );
    const { isVerified, isMiss, isPartialMatch, isPending } = status;

    const displaySymbol = useMemo(() => {
      if (symbolStyle === "custom" && customSymbol) return customSymbol;
      if (symbolStyle === "number")
        return citation.citationNumber?.toString() || "1";
      if (symbolStyle === "asterisk") return "*";
      if (symbolStyle === "dagger") {
        const num = (citation.citationNumber || 1) - 1;
        return FOOTNOTE_SYMBOLS[num % FOOTNOTE_SYMBOLS.length];
      }
      return "*";
    }, [symbolStyle, customSymbol, citation.citationNumber]);

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        eventHandlers?.onClick?.(citation, citationKey, e);
      },
      [eventHandlers, citation, citationKey]
    );

    const handleMouseEnter = useCallback(() => {
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    const handleMouseLeave = useCallback(() => {
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    // Check partial first since isVerified is true when isPartialMatch is true
    // Note: For miss state, text gets line-through but status indicator should NOT
    const statusClass = isPartialMatch
      ? "text-amber-600 dark:text-amber-500"
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
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="footnote"
          className={classNames(
            "text-xs cursor-pointer font-normal transition-colors inline-flex items-baseline",
            statusClass,
            className
          )}
          onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
          onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
          onMouseDown={handleClick}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Footnote ${displaySymbol}`}
        >
          <span className={isMiss ? "line-through opacity-70" : undefined}>{displaySymbol}</span>
          {isPartialMatch && renderPartialIndicator(status)}
          {isVerified && !isPartialMatch && renderVerifiedIndicator(status)}
          {isMiss && (
            <>
              <span className="text-red-500 dark:text-red-400 ml-0.5 flex-shrink-0" style={INDICATOR_SIZE_STYLE} aria-hidden="true">
                <XIcon />
              </span>
              <span className="sr-only">not found</span>
            </>
          )}
          {isPending && pendingContent}
        </sup>
      </>
    );
  }
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
    ref
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(
      citation,
      verification
    );
    const { isVerified, isMiss, isPartialMatch, isPending } = status;

    // InlineCitation shows anchorText by default
    const displayText = useMemo(
      () => getCitationDisplayText(citation, { fallbackDisplay }),
      [citation, fallbackDisplay]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        eventHandlers?.onClick?.(citation, citationKey, e);
      },
      [eventHandlers, citation, citationKey]
    );

    const handleMouseEnter = useCallback(() => {
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    const handleMouseLeave = useCallback(() => {
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    // Check partial first since isVerified is true when isPartialMatch is true
    // Note: For miss state, text gets line-through but status indicator should NOT
    const statusClass = isPartialMatch
      ? "text-amber-600 dark:text-amber-500"
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
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="inline"
          className={classNames(
            "cursor-pointer transition-colors hover:bg-blue-500/5 inline-flex items-baseline",
            underlineClasses[underlineStyle],
            statusClass,
            className
          )}
          onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
          onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
          onMouseDown={handleClick}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Citation: ${displayText}`}
        >
          <span className={isMiss ? "line-through opacity-70" : undefined}>{displayText}</span>
          {isPartialMatch && renderPartialIndicator(status)}
          {isVerified && !isPartialMatch && renderVerifiedIndicator(status)}
          {isMiss && (
            <>
              <span className="text-red-500 dark:text-red-400 ml-0.5 flex-shrink-0" style={INDICATOR_SIZE_STYLE} aria-hidden="true">
                <XIcon />
              </span>
              <span className="sr-only">not found</span>
            </>
          )}
          {isPending && (
            <span className="opacity-70 ml-1">{pendingContent}</span>
          )}
        </span>
      </>
    );
  }
);

InlineCitation.displayName = "InlineCitation";

// =============================================================================
// MINIMAL VARIANT - Just the number, minimal decoration
// =============================================================================

export interface MinimalCitationProps extends CitationVariantProps {
  /** Whether to show status indicator */
  showStatusIndicator?: boolean;
}

/**
 * Minimal style citation component.
 * Displays just the citation number with minimal decoration.
 *
 * @example
 * ```tsx
 * <MinimalCitation citation={citation} />
 * // Renders: 1
 * ```
 */
export const MinimalCitation = forwardRef<
  HTMLSpanElement,
  MinimalCitationProps
>(
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
      showStatusIndicator = true,
    },
    ref
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(
      citation,
      verification
    );
    const { isVerified, isMiss, isPartialMatch, isPending } = status;

    // MinimalCitation shows number by default
    const displayText = useMemo(
      () => getCitationNumber(citation),
      [citation]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        eventHandlers?.onClick?.(citation, citationKey, e);
      },
      [eventHandlers, citation, citationKey]
    );

    const handleMouseEnter = useCallback(() => {
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    const handleMouseLeave = useCallback(() => {
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    // Check partial first since isVerified is true when isPartialMatch is true
    // Note: For miss state, text gets line-through but status indicator should NOT
    const statusClass = isPartialMatch
      ? "text-amber-600 dark:text-amber-500"
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
        <span
          ref={ref}
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="minimal"
          className={classNames(
            "cursor-pointer transition-colors hover:underline inline-flex items-baseline",
            statusClass,
            className
          )}
          onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
          onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
          onMouseDown={handleClick}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Citation ${displayText}`}
        >
          <span className={isMiss ? "line-through opacity-70" : undefined}>{displayText}</span>
          {showStatusIndicator && (
            <>
              {isPartialMatch && renderPartialIndicator(status)}
              {isVerified && !isPartialMatch && renderVerifiedIndicator(status)}
              {isMiss && (
                <>
                  <span className="text-red-500 dark:text-red-400 ml-0.5 flex-shrink-0" style={INDICATOR_SIZE_STYLE} aria-hidden="true">
                    <XIcon />
                  </span>
                  <span className="sr-only">not found</span>
                </>
              )}
              {isPending && pendingContent}
            </>
          )}
        </span>
      </>
    );
  }
);

MinimalCitation.displayName = "MinimalCitation";

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
  /** Minimal-specific props */
  minimalProps?: Partial<MinimalCitationProps>;
}

/**
 * Factory component that renders the appropriate citation variant.
 *
 * @example
 * ```tsx
 * <CitationVariantFactory variant="chip" citation={citation} chipProps={{ size: "lg" }} />
 * ```
 */
export const CitationVariantFactory = forwardRef<
  HTMLSpanElement,
  VariantCitationProps
>(
  (
    {
      variant = "bracket",
      chipProps,
      superscriptProps,
      footnoteProps,
      inlineProps,
      minimalProps,
      ...props
    },
    ref
  ) => {
    switch (variant) {
      case "chip":
        return <ChipCitation ref={ref} {...props} {...chipProps} />;
      case "superscript":
        return (
          <SuperscriptCitation ref={ref} {...props} {...superscriptProps} />
        );
      case "footnote":
        return <FootnoteCitation ref={ref} {...props} {...footnoteProps} />;
      case "inline":
        return <InlineCitation ref={ref} {...props} {...inlineProps} />;
      case "minimal":
        return <MinimalCitation ref={ref} {...props} {...minimalProps} />;
      case "bracket":
      default:
        // For bracket variant, we return null here as CitationComponent handles it
        // This factory is meant to be used for alternate variants
        return null;
    }
  }
);

CitationVariantFactory.displayName = "CitationVariantFactory";

// Memoized versions for performance
export const MemoizedChipCitation = memo(ChipCitation);
export const MemoizedSuperscriptCitation = memo(SuperscriptCitation);
export const MemoizedFootnoteCitation = memo(FootnoteCitation);
export const MemoizedInlineCitation = memo(InlineCitation);
export const MemoizedMinimalCitation = memo(MinimalCitation);
export const MemoizedCitationVariantFactory = memo(CitationVariantFactory);
