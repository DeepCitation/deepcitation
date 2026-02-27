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
import { getInteractionClasses } from "./CitationContentDisplay.utils.js";
import { CitationStatusIndicator, type CitationStatusIndicatorProps } from "./CitationStatusIndicator.js";
import { MISS_WAVY_UNDERLINE_STYLE } from "./constants.js";
import { handleImageError } from "./imageUtils.js";
import type { CitationContent, CitationRenderProps, CitationVariant } from "./types.js";
import { cn, isUrlCitation } from "./utils.js";

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
  showIndicator: boolean;
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
  showIndicator,
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
          "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
          getInteractionClasses(isOpen, variant),
        )}
      >
        <span
          className={cn(
            "max-w-60 overflow-hidden text-ellipsis whitespace-nowrap",
            isMiss && !shouldShowSpinner && "opacity-70",
          )}
        >
          {displayText}
        </span>
        {indicator}
      </span>
    );
  }

  // Shared across superscript and footnote variants
  const anchorTextDisplay = citation.anchorText?.toString() || "";
  const citationNumber = citation.citationNumber?.toString() || "1";

  // Variant: superscript (footnote style)
  if (variant === "superscript") {
    const supStatusClasses = cn(
      !shouldShowSpinner && "text-gray-700 dark:text-gray-200",
      shouldShowSpinner && "text-gray-500 dark:text-gray-400",
    );
    return (
      <>
        {anchorTextDisplay && <span className="font-normal">{anchorTextDisplay}</span>}
        <sup
          className={cn(
            "font-medium transition-colors px-0.5 rounded",
            supStatusClasses,
            getInteractionClasses(isOpen, variant),
          )}
          style={{ fontSize: "0.65em", lineHeight: 0, position: "relative", top: "-0.65em", verticalAlign: "baseline" }}
        >
          [<span>{citationNumber}</span>
          {indicator}]
        </sup>
      </>
    );
  }

  // Variant: footnote (clean footnote marker with neutral default)
  if (variant === "footnote") {
    // Neutral gray default, status colors when resolved
    const footnoteStatusClasses = cn(
      !isVerified && !isMiss && !isPartialMatch && !shouldShowSpinner && "text-gray-500 dark:text-gray-400",
      shouldShowSpinner && "text-gray-400 dark:text-gray-500",
      isVerified && !isPartialMatch && !shouldShowSpinner && "text-green-600 dark:text-green-500",
      isPartialMatch && !shouldShowSpinner && "text-amber-500 dark:text-amber-400",
      isMiss && !shouldShowSpinner && "text-red-500 dark:text-red-400",
    );

    return (
      <>
        {anchorTextDisplay && <span className="font-normal">{anchorTextDisplay}</span>}
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
          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
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
          {displayText}
        </span>
        {additionalCount !== undefined && additionalCount > 0 && (
          <span className="text-gray-500 dark:text-gray-400">+{additionalCount}</span>
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
      isPendingState && "bg-gray-500/[0.05] dark:bg-gray-400/[0.05]",
      getInteractionClasses(isOpen, variant),
    );

    return (
      <span className={linterClasses} style={linterStyles}>
        {displayText}
        {showIndicator && indicator}
      </span>
    );
  }

  // Variant: brackets (default)
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 whitespace-nowrap",
        "font-mono font-normal text-xs leading-tight",
        "text-gray-500 dark:text-gray-400",
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
