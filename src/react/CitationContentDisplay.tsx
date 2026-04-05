/**
 * Citation content display — variant rendering logic.
 *
 * Renders variant-specific citation content (chip, superscript, text, badge,
 * linter, brackets). Shared rendering utilities live in CitationContentDisplay.utils.ts.
 *
 * @packageDocumentation
 */

import type React from "react";
import type { CitationStatus } from "../types/citation.js";
import { isUrlCitation } from "../types/citation.js";
import { getInteractionClasses } from "./CitationContentDisplay.utils.js";
import { CitationStatusIndicator, type CitationStatusIndicatorProps } from "./CitationStatusIndicator.js";
import {
  CARET_INDICATOR_SIZE_STYLE,
  DOT_COLORS,
  DOT_INDICATOR_SIZE_STYLE,
  ERROR_COLOR_STYLE,
  INDICATOR_SIZE_STYLE,
  MISS_WAVY_UNDERLINE_STYLE,
  PARTIAL_COLOR_STYLE,
  SUPERSCRIPT_STYLE,
  VERIFIED_COLOR_STYLE,
} from "./constants.js";
import { CheckIcon, ChevronDownIcon, XIcon } from "./icons.js";
import { handleImageError } from "./imageUtils.js";
import type { CitationContent, CitationRenderProps, CitationVariant } from "./types.js";
import { cn, truncateMiddle } from "./utils.js";

// =============================================================================
// CITATION CONTENT DISPLAY COMPONENT
// =============================================================================

export interface CitationContentDisplayProps {
  renderContent?: (props: CitationRenderProps) => React.ReactNode;
  citation: CitationRenderProps["citation"];
  status: CitationStatus;
  citationKey: string;
  displayText: string;
  resolvedContent: CitationContent;
  variant: CitationVariant;
  statusClasses: string;
  isVerified: boolean;
  isPartialMatch: boolean;
  isMiss: boolean;
  shouldShowSpinner: boolean;
  faviconUrl?: string;
  additionalCount?: number;
  indicatorProps: CitationStatusIndicatorProps;
  /** Whether the popover/tooltip is currently open (drives active state styling). */
  isOpen: boolean;
}

/**
 * Renders the citation content based on the selected variant (chip, superscript, text, badge, linter, brackets).
 * Each variant has its own visual treatment and hover behavior.
 */
export const CitationContentDisplay = ({
  renderContent,
  citation,
  status,
  citationKey,
  displayText,
  resolvedContent,
  variant,
  statusClasses,
  isVerified,
  isPartialMatch,
  isMiss,
  shouldShowSpinner,
  faviconUrl,
  additionalCount,
  indicatorProps,
  isOpen,
}: CitationContentDisplayProps): React.ReactNode => {
  const indicator = <CitationStatusIndicator {...indicatorProps} />;

  if (renderContent) {
    return renderContent({
      citation,
      status,
      citationKey,
      displayText,
      isMergedDisplay: resolvedContent === "anchorText",
    });
  }

  // Content type: indicator only
  if (resolvedContent === "indicator") {
    return <span>{indicator}</span>;
  }

  // Variant: chip (pill/badge style with neutral gray background)
  if (variant === "chip") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[0.9em] font-normal transition-colors",
          "bg-dc-muted text-dc-foreground",
          getInteractionClasses(isOpen, variant),
        )}
      >
        <span
          className={cn(
            "max-w-60 overflow-hidden text-ellipsis whitespace-nowrap",
            isMiss && !shouldShowSpinner && "opacity-70",
          )}
        >
          {truncateMiddle(displayText, 30)}
        </span>
        {/* aria-hidden: the button's aria-label already describes status; the live region
            (statusDescId) announces changes. Including role="img" aria-labels here as
            "visible text" causes label-content-name-mismatch (WCAG 2.5.3). */}
        <span aria-hidden="true">{indicator}</span>
      </span>
    );
  }

  // Shared across superscript and footnote variants
  const anchorTextDisplay = citation.anchorText?.toString() || "";
  const citationNumber = citation.citationNumber?.toString() || "1";

  // Variant: superscript (footnote style)
  if (variant === "superscript") {
    const supStatusClasses = cn(
      !shouldShowSpinner && "text-dc-foreground",
      shouldShowSpinner && "text-dc-subtle-foreground",
    );
    return (
      <>
        {anchorTextDisplay && <span className="font-normal">{anchorTextDisplay}</span>}
        {/* U+2060 word joiner: prevents line break between anchor text and superscript */}
        {anchorTextDisplay && "\u2060"}
        <sup
          className={cn(
            "font-medium transition-colors px-0.5 rounded",
            supStatusClasses,
            getInteractionClasses(isOpen, variant),
          )}
          style={SUPERSCRIPT_STYLE}
        >
          [<span>{citationNumber}</span>
          {indicator}]
        </sup>
      </>
    );
  }

  // Variant: footnote (clean footnote marker with neutral default)
  if (variant === "footnote") {
    // Priority chain: spinner > miss > partial > verified > neutral default
    let footnoteStatusClasses: string;
    if (shouldShowSpinner) {
      footnoteStatusClasses = "text-dc-subtle-foreground";
    } else if (isMiss) {
      footnoteStatusClasses = "text-dc-destructive";
    } else if (isPartialMatch) {
      footnoteStatusClasses = "text-dc-partial";
    } else if (isVerified) {
      footnoteStatusClasses = "text-dc-verified";
    } else {
      footnoteStatusClasses = "text-dc-subtle-foreground";
    }

    return (
      <>
        {anchorTextDisplay && <span className="font-normal">{anchorTextDisplay}</span>}
        {/* U+2060 word joiner: prevents line break between anchor text and superscript */}
        {anchorTextDisplay && "\u2060"}
        <sup
          className={cn(
            "text-xs font-normal transition-colors",
            footnoteStatusClasses,
            getInteractionClasses(isOpen, variant),
          )}
        >
          <span
            className={cn(isMiss && !shouldShowSpinner && "opacity-70")}
            style={isMiss && !shouldShowSpinner ? MISS_WAVY_UNDERLINE_STYLE : undefined}
          >
            {citationNumber}
          </span>
          {indicator}
        </sup>
      </>
    );
  }

  // Variant: text
  if (variant === "text") {
    return (
      <span className={cn("font-normal", statusClasses)}>
        {displayText}
        {/* U+2060 word joiner: prevents line break between text and indicator */}
        {"\u2060"}
        {indicator}
      </span>
    );
  }

  // Variant: badge (ChatGPT-style source chip)
  if (variant === "badge") {
    const faviconSrc = faviconUrl || (isUrlCitation(citation) ? citation.faviconUrl : undefined);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium",
          "bg-dc-muted text-dc-foreground",
          "transition-colors cursor-pointer",
          getInteractionClasses(isOpen, variant),
        )}
      >
        {faviconSrc && (
          <img
            src={faviconSrc}
            alt=""
            className="w-4 h-4 rounded-sm object-contain"
            loading="lazy"
            onError={handleImageError}
          />
        )}
        <span
          className={cn(
            "max-w-40 overflow-hidden text-ellipsis whitespace-nowrap",
            isMiss && !shouldShowSpinner && "opacity-70",
          )}
          style={isMiss && !shouldShowSpinner ? MISS_WAVY_UNDERLINE_STYLE : undefined}
        >
          {truncateMiddle(displayText, 30)}
        </span>
        {additionalCount !== undefined && additionalCount > 0 && (
          <span className="text-dc-subtle-foreground">+{additionalCount}</span>
        )}
        {indicator}
      </span>
    );
  }

  // Variant: linter
  if (variant === "linter") {
    const isVerifiedState = isVerified && !isPartialMatch && !shouldShowSpinner;
    const isPartialState = isPartialMatch && !shouldShowSpinner;
    const isMissState = isMiss && !shouldShowSpinner;
    const isPendingState = shouldShowSpinner;

    const linterStyles: React.CSSProperties = {
      textDecoration: "underline",
      textDecorationThickness: "2px",
      textUnderlineOffset: "3px",
      borderRadius: "2px",
      color: "inherit",
      fontSize: "inherit",
      fontFamily: "inherit",
      lineHeight: "inherit",
    };

    if (isMissState) {
      linterStyles.textDecorationStyle = "wavy";
      linterStyles.textDecorationColor = "var(--dc-linter-error, #c0605f)";
    } else if (isPartialState) {
      linterStyles.textDecorationStyle = "dashed";
      linterStyles.textDecorationColor = "var(--dc-linter-warning, #f59e0b)";
    } else if (isVerifiedState) {
      linterStyles.textDecorationStyle = "solid";
      linterStyles.textDecorationColor = "var(--dc-linter-success, #4a7c5f)";
    } else {
      linterStyles.textDecorationStyle = "dotted";
      linterStyles.textDecorationColor = "var(--dc-linter-pending, #9ca3af)";
    }

    const linterClasses = cn(
      "cursor-pointer font-normal",
      isPendingState && "bg-dc-muted/[0.3]",
      getInteractionClasses(isOpen, variant),
    );

    return (
      <span className={linterClasses} style={linterStyles}>
        {displayText}
        {/* U+2060 word joiner: prevents line break between text and indicator */}
        {"\u2060"}
        {indicator}
      </span>
    );
  }

  // Variant: block (sharp, square-bordered inline box)
  if (variant === "block") {
    // Status border color only — text/bg stay neutral
    let blockBorderClass: string;
    if (shouldShowSpinner) {
      blockBorderClass = "border-dc-border animate-pulse cursor-wait";
    } else if (isMiss) {
      blockBorderClass = "border-dc-destructive/60";
    } else if (isPartialMatch) {
      blockBorderClass = "border-dc-partial/60";
    } else if (isVerified) {
      blockBorderClass = "border-dc-verified/60";
    } else {
      blockBorderClass = "border-dc-border";
    }

    return (
      <>
        {anchorTextDisplay && <span className="font-normal">{anchorTextDisplay}</span>}
        <span
          className={cn(
            "inline-flex items-center justify-center aspect-square size-[1.4em] mx-0.5",
            "font-mono text-xs font-medium rounded-sm border align-baseline select-none",
            "bg-dc-background text-dc-muted-foreground",
            "transition-all duration-120",
            blockBorderClass,
            getInteractionClasses(isOpen, variant),
          )}
        >
          {(() => {
            if (!(isVerified || isPartialMatch || isMiss) || indicatorProps.indicatorVariant === "none") {
              return citationNumber;
            }
            const iv = indicatorProps.indicatorVariant;
            if (iv === "dot") {
              const dotColor = isMiss ? "red" : isPartialMatch ? "amber" : "green";
              return <span className={cn("rounded-full", DOT_COLORS[dotColor])} style={DOT_INDICATOR_SIZE_STYLE} />;
            }
            if (iv === "caret") {
              const caretColor = isMiss ? "text-dc-destructive" : "text-dc-subtle-foreground";
              return (
                <span className={cn("inline-flex", caretColor)} style={CARET_INDICATOR_SIZE_STYLE}>
                  <ChevronDownIcon />
                </span>
              );
            }
            // icon (default)
            const colorStyle = isMiss ? ERROR_COLOR_STYLE : isPartialMatch ? PARTIAL_COLOR_STYLE : VERIFIED_COLOR_STYLE;
            return (
              <span className="inline-flex" style={{ ...INDICATOR_SIZE_STYLE, ...colorStyle }}>
                {isMiss ? <XIcon /> : <CheckIcon />}
              </span>
            );
          })()}
        </span>
      </>
    );
  }

  // Variant: brackets (default)
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 whitespace-nowrap",
        "font-mono font-normal text-xs leading-tight",
        "text-dc-subtle-foreground",
        "transition-colors",
      )}
      aria-hidden="true"
    >
      [
      <span className={cn("max-w-80 overflow-hidden text-ellipsis", statusClasses)}>
        {displayText}
        {indicator}
      </span>
      ]
    </span>
  );
};
