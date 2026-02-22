/**
 * Citation content display — variant rendering logic.
 *
 * Renders variant-specific citation content (chip, superscript, text, badge,
 * linter, brackets). Uses CVA for class computation and shared rendering
 * utilities from CitationContentDisplay.utils.ts.
 *
 * @packageDocumentation
 */

import type React from "react";
import type { CitationStatus } from "../types/citation.js";
import { getStatusHoverClasses } from "./CitationContentDisplay.utils.js";
import { CitationStatusIndicator, type CitationStatusIndicatorProps } from "./CitationStatusIndicator.js";
import {
  BADGE_HOVER_CLASSES,
  citationContainerVariants,
  LINTER_HOVER_CLASSES,
  LINTER_STYLES,
  resolveStatusKey,
  SUPERSCRIPT_STYLE,
} from "./citationVariants.cva.js";
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

  const statusKey = resolveStatusKey(isVerified, isPartialMatch, isMiss, shouldShowSpinner);

  // Variant: chip (pill/badge style with neutral gray background)
  if (variant === "chip") {
    return (
      <span
        className={cn(
          citationContainerVariants({ variant: "chip" }),
          ...getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner),
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

  // Variant: superscript (footnote style)
  if (variant === "superscript") {
    const anchorTextDisplay = citation.anchorText?.toString() || "";
    const citationNumber = citation.citationNumber?.toString() || "1";

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
            ...getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner),
          )}
          style={SUPERSCRIPT_STYLE}
        >
          [<span>{citationNumber}</span>
          {indicator}]
        </sup>
      </>
    );
  }

  // Variant: text
  if (variant === "text") {
    return (
      <span className={cn(citationContainerVariants({ variant: "text" }), statusClasses)}>
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
          citationContainerVariants({ variant: "badge" }),
          "transition-colors",
          BADGE_HOVER_CLASSES[statusKey],
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
    return (
      <span
        className={cn("cursor-pointer font-normal", LINTER_HOVER_CLASSES[statusKey])}
        style={LINTER_STYLES[statusKey]}
      >
        {displayText}
        {showIndicator && indicator}
      </span>
    );
  }

  // Variant: brackets (default)
  return (
    <span className={citationContainerVariants({ variant: "brackets" })} aria-hidden="true">
      [
      <span className={cn("max-w-80 overflow-hidden text-ellipsis", statusClasses)}>
        {displayText}
        {indicator}
      </span>
      ]
    </span>
  );
};
