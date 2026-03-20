import React, { forwardRef, memo, type ReactNode, useCallback, useMemo } from "react";
import { getCitationStatus } from "../parsing/parseCitation.js";
import type { Citation, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getCitationKey } from "../utils/citationKey.js";
import {
  ERROR_COLOR_STYLE,
  INDICATOR_SIZE_STYLE,
  MISS_WAVY_UNDERLINE_STYLE,
  PARTIAL_COLOR_STYLE,
  SUPERSCRIPT_STYLE,
  VERIFIED_COLOR_STYLE,
} from "./constants.js";
import { type TranslateFunction, useTranslation } from "./i18n.js";
import { XIcon } from "./icons.js";
import { StatusIndicatorWrapper } from "./StatusIndicatorWrapper.js";
import type { BaseCitationProps, CitationEventHandlers, CitationVariant as CitationVariantType } from "./types.js";
import { classNames, generateCitationInstanceId, getCitationDisplayText, getCitationNumber } from "./utils.js";

const TWO_DOTS_THINKING_CONTENT = "..";

// Module-level default indicator render functions — hoisted so the React Compiler
// can safely reorder expressions (inline ArrowFunctionExpression defaults block optimization).
const defaultRenderVerifiedIndicator = () => <DefaultVerifiedIndicator />;
const defaultRenderPartialIndicator = () => <DefaultPartialIndicator />;

// Block-specific defaults — no left margin since the indicator replaces the number as sole content.
const defaultBlockVerifiedIndicator = () => (
  <span style={VERIFIED_COLOR_STYLE} aria-hidden="true">
    ✓
  </span>
);
const defaultBlockPartialIndicator = () => (
  <span style={PARTIAL_COLOR_STYLE} aria-hidden="true">
    *
  </span>
);

interface ChipVisualClasses {
  background: string;
  border: string;
  hover: string;
  text: string;
}

function getAriaStatusLabel(status: CitationStatus, t: TranslateFunction): string {
  if (status.isMiss) return t("aria.statusSuffix.notFound");
  if (status.isPartialMatch) return t("aria.statusSuffix.partialMatch");
  if (status.isVerified) return t("aria.statusSuffix.verified");
  if (status.isPending) return t("aria.statusSuffix.pendingVerification");
  return t("status.verifying");
}

function getChipVisualClasses(status: CitationStatus): ChipVisualClasses {
  if (status.isPartialMatch) {
    return {
      background: "bg-dc-partial-bg",
      border: "border-dc-partial-border hover:border-dc-partial",
      hover: "hover:bg-dc-partial-hover hover:text-dc-primary-foreground",
      text: "text-dc-partial",
    };
  }

  if (status.isMiss) {
    return {
      background: "bg-dc-destructive-bg",
      border: "border-dashed border-dc-destructive-border hover:border-dc-destructive",
      hover: "hover:bg-dc-destructive-hover hover:text-dc-primary-foreground",
      text: "text-dc-destructive",
    };
  }

  if (status.isVerified) {
    return {
      background: "bg-dc-verified-bg",
      border: "border-dc-verified-border hover:border-dc-verified",
      hover: "hover:bg-dc-verified-hover hover:text-dc-primary-foreground",
      text: "text-dc-verified",
    };
  }

  if (status.isPending) {
    return {
      background: "bg-dc-pending-bg",
      border: "border-dc-pending-border hover:border-dc-pending-border",
      hover: "hover:bg-dc-pending-hover hover:text-dc-primary-foreground",
      text: "text-dc-subtle-foreground",
    };
  }

  return {
    background: "bg-dc-muted",
    border: "border-dc-border hover:border-dc-muted-foreground",
    hover: "hover:bg-dc-pending-hover hover:text-dc-primary-foreground",
    text: "text-dc-muted-foreground",
  };
}

function getStatusToneClass(status: CitationStatus, defaultClass: string): string {
  if (status.isPartialMatch) return "text-dc-partial";
  if (status.isMiss) return "text-dc-destructive";
  if (status.isVerified) return "text-dc-verified";
  if (status.isPending) return "text-dc-subtle-foreground";
  return defaultClass || "text-dc-muted-foreground";
}

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
  const citationKey = useMemo(() => getCitationKey(citation), [citation]);
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
        eventHandlers?.onClick?.(citation, citationKey, e);
      }
    },
    [eventHandlers, citation, citationKey],
  );

  const stopClickPropagation = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
  }, []);

  return {
    onMouseEnter: preventTooltips ? undefined : handleMouseEnter,
    onMouseLeave: preventTooltips ? undefined : handleMouseLeave,
    onMouseDown: handleClick,
    onClick: stopClickPropagation,
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
  const t = useTranslation();
  const { isVerified, isMiss, isPartialMatch, isPending } = status;
  return (
    <>
      {isPartialMatch && renderPartialIndicator(status)}
      {isVerified && !isPartialMatch && renderVerifiedIndicator(status)}
      {isMiss && (
        <>
          <StatusIndicatorWrapper>
            <XIcon />
          </StatusIndicatorWrapper>
          <span className="sr-only">{t("indicator.notFound")}</span>
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
      renderVerifiedIndicator = defaultRenderVerifiedIndicator,
      renderPartialIndicator = defaultRenderPartialIndicator,
      showIcon = false,
      icon,
    },
    ref,
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(citation, verification);
    const { isMiss } = status;
    const t = useTranslation();
    const events = useCitationEvents(citation, citationKey, eventHandlers, preventTooltips);
    const chipClasses = getChipVisualClasses(status);

    // ChipCitation shows anchorText by default
    const displayText = useMemo(
      () => getCitationDisplayText(citation, { fallbackDisplay }),
      [citation, fallbackDisplay],
    );

    const statusLabel = getAriaStatusLabel(status, t);
    const ariaLabel = displayText
      ? t("aria.citationWithStatus", { displayText, status: statusLabel })
      : t("aria.citation");

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
            "inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full font-normal cursor-pointer transition-colors duration-120 text-[0.9em]",
            "border",
            chipClasses.background,
            chipClasses.border,
            chipClasses.hover,
            className,
          )}
          {...events}
          aria-label={ariaLabel}
        >
          {showIcon && (icon || <span className="text-[0.9em]">📄</span>)}
          <span className={classNames(chipClasses.text, isMiss && "opacity-70")}>{displayText}</span>
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
      renderVerifiedIndicator = defaultRenderVerifiedIndicator,
      renderPartialIndicator = defaultRenderPartialIndicator,
      hideBrackets = true,
    },
    ref,
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(citation, verification);
    const t = useTranslation();
    const events = useCitationEvents(citation, citationKey, eventHandlers, preventTooltips);

    // SuperscriptCitation shows number by default
    const displayText = useMemo(() => getCitationNumber(citation), [citation]);

    const statusClass = getStatusToneClass(status, "text-dc-muted-foreground");

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
          className={classNames("cursor-pointer font-medium transition-colors hover:underline", statusClass, className)}
          style={SUPERSCRIPT_STYLE}
          {...events}
          aria-label={t("aria.citationNumber", { number: displayText })}
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
      renderVerifiedIndicator = defaultRenderVerifiedIndicator,
      renderPartialIndicator = defaultRenderPartialIndicator,
      symbolStyle = "number",
      customSymbol,
    },
    ref,
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(citation, verification);
    const { isMiss } = status;
    const t = useTranslation();
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

    const statusClass = getStatusToneClass(status, "text-dc-subtle-foreground hover:text-dc-foreground");

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
          aria-label={t("aria.footnoteSymbol", { symbol: displaySymbol })}
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
// BLOCK VARIANT - Sharp, square-bordered box
// =============================================================================

export type BlockCitationProps = CitationVariantProps;

/**
 * Block style citation component.
 * Displays citation as a sharp, square-bordered inline box — similar to
 * footnote/superscript but with a heavier, more explicit box treatment.
 *
 * @example
 * ```tsx
 * <BlockCitation citation={citation} verification={found} />
 * // Renders: Text content [ 2 ]
 * ```
 */
export const BlockCitation = forwardRef<HTMLSpanElement, BlockCitationProps>(
  (
    {
      citation,
      children,
      className,
      verification,
      eventHandlers,
      preventTooltips = false,
      pendingContent = TWO_DOTS_THINKING_CONTENT,
      renderVerifiedIndicator = defaultBlockVerifiedIndicator,
      renderPartialIndicator = defaultBlockPartialIndicator,
    },
    ref,
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(citation, verification);
    const { isMiss, isPartialMatch, isVerified, isPending } = status;
    const t = useTranslation();
    const events = useCitationEvents(citation, citationKey, eventHandlers, preventTooltips);

    const displayText = useMemo(() => getCitationNumber(citation), [citation]);

    // Status border color only — text/bg stay neutral
    let borderClass: string;
    if (isPending) {
      borderClass = "border-dc-border animate-pulse cursor-wait";
    } else if (isMiss) {
      borderClass = "border-dc-destructive/60 cursor-pointer";
    } else if (isPartialMatch) {
      borderClass = "border-dc-partial/60 cursor-pointer";
    } else if (isVerified) {
      borderClass = "border-dc-verified/60 cursor-pointer";
    } else {
      borderClass = "border-dc-border hover:border-dc-muted-foreground cursor-pointer";
    }

    return (
      <>
        {children}
        <span
          ref={ref}
          role="button"
          tabIndex={0}
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-variant="block"
          className={classNames(
            "inline-flex items-center justify-center h-[1.4em] min-w-[1.4em] px-[0.3em] mx-0.5",
            "font-mono text-xs font-medium rounded-dc-sm transition-all duration-120 border align-baseline select-none",
            "bg-dc-background text-dc-muted-foreground",
            borderClass,
            className,
          )}
          {...events}
          aria-label={t("aria.citationNumber", { number: displayText })}
        >
          {isPartialMatch ? (
            renderPartialIndicator(status)
          ) : isVerified ? (
            renderVerifiedIndicator(status)
          ) : isMiss ? (
            <span
              className="shrink-0 inline-flex items-center justify-center"
              style={{ ...INDICATOR_SIZE_STYLE, ...ERROR_COLOR_STYLE }}
              aria-hidden="true"
            >
              <XIcon />
            </span>
          ) : isPending ? (
            <span className="opacity-70">{pendingContent}</span>
          ) : (
            displayText
          )}
        </span>
      </>
    );
  },
);

BlockCitation.displayName = "BlockCitation";

// =============================================================================
// INLINE VARIANT - Subtle inline style with underline
// =============================================================================

export interface InlineCitationProps extends CitationVariantProps {
  /** Underline style */
  underlineStyle?: "solid" | "dotted" | "dashed" | "none";
}

const INLINE_UNDERLINE_CLASSES: Record<NonNullable<InlineCitationProps["underlineStyle"]>, string> = {
  solid: "border-b border-current",
  dotted: "border-b border-dotted border-current",
  dashed: "border-b border-dashed border-current",
  none: "",
};

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
      renderVerifiedIndicator = defaultRenderVerifiedIndicator,
      renderPartialIndicator = defaultRenderPartialIndicator,
      underlineStyle = "dotted",
    },
    ref,
  ) => {
    const { citationKey, citationInstanceId, status } = useCitationData(citation, verification);
    const { isMiss } = status;
    const t = useTranslation();
    const events = useCitationEvents(citation, citationKey, eventHandlers, preventTooltips);

    // InlineCitation shows anchorText by default
    const displayText = useMemo(
      () => getCitationDisplayText(citation, { fallbackDisplay }),
      [citation, fallbackDisplay],
    );

    const statusClass = getStatusToneClass(status, "");

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
            "cursor-pointer transition-colors hover:bg-dc-muted/50 inline-flex items-baseline",
            INLINE_UNDERLINE_CLASSES[underlineStyle],
            statusClass,
            className,
          )}
          {...events}
          aria-label={t("aria.citationWithText", { displayText })}
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
  /** Block-specific props */
  blockProps?: Partial<BlockCitationProps>;
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
  ({ variant = "bracket", chipProps, superscriptProps, footnoteProps, inlineProps, blockProps, ...props }, ref) => {
    switch (variant) {
      case "chip":
        return <ChipCitation ref={ref} {...props} {...chipProps} />;
      case "superscript":
        return <SuperscriptCitation ref={ref} {...props} {...superscriptProps} />;
      case "footnote":
        return <FootnoteCitation ref={ref} {...props} {...footnoteProps} />;
      case "inline":
        return <InlineCitation ref={ref} {...props} {...inlineProps} />;
      case "block":
        return <BlockCitation ref={ref} {...props} {...blockProps} />;
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
export const MemoizedBlockCitation = memo(BlockCitation);
export const MemoizedCitationVariantFactory = memo(CitationVariantFactory);
