/**
 * Citation Primitives - Composable building blocks for citation components
 * @packageDocumentation
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  forwardRef,
  type ReactNode,
  type HTMLAttributes,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { getCitationStatus } from "../parsing/parseCitation.js";
import type {
  Citation as CitationType,
  CitationStatus,
} from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import type { SearchState } from "../types/search.js";
import {
  generateCitationKey,
  generateCitationInstanceId,
  classNames,
} from "./utils.js";

interface CitationContextValue {
  citation: CitationType;
  citationKey: string;
  citationInstanceId: string;
  status: CitationStatus;
  verification: Verification | null;
  searchState: SearchState | null;
  config: {
    displayKeySpan: boolean;
    fallbackDisplay: string | null;
    pendingContent: ReactNode;
  };
}

const CitationContext = createContext<CitationContextValue | null>(null);

/** Access citation context. Must be used within Citation.Root. */
export function useCitationContext(): CitationContextValue {
  const context = useContext(CitationContext);
  if (!context) {
    throw new Error("Citation components must be used within a Citation.Root");
  }
  return context;
}

/** Safely access citation context (returns null if not in context). */
export function useCitationContextSafe(): CitationContextValue | null {
  return useContext(CitationContext);
}

export interface CitationRootProps {
  citation: CitationType;
  verification?: Verification | null;
  searchState?: SearchState | null;
  children: ReactNode;
  displayKeySpan?: boolean;
  fallbackDisplay?: string | null;
  pendingContent?: ReactNode;
}

/** Root component that provides citation context to all child primitives. */
export const CitationRoot = forwardRef<
  HTMLSpanElement,
  CitationRootProps & HTMLAttributes<HTMLSpanElement>
>(
  (
    {
      citation,
      verification = null,
      searchState = null,
      children,
      displayKeySpan = false,
      fallbackDisplay = null,
      pendingContent = "..",
      className,
      ...props
    },
    ref
  ) => {
    const citationKey = useMemo(
      () => generateCitationKey(citation),
      [citation]
    );
    const citationInstanceId = useMemo(
      () => generateCitationInstanceId(citationKey),
      [citationKey]
    );
    const status = getCitationStatus(verification);

    const contextValue = useMemo<CitationContextValue>(
      () => ({
        citation,
        citationKey,
        citationInstanceId,
        status,
        verification,
        searchState,
        config: {
          displayKeySpan,
          fallbackDisplay,
          pendingContent,
        },
      }),
      [
        citation,
        citationKey,
        citationInstanceId,
        status,
        verification,
        searchState,
        displayKeySpan,
        fallbackDisplay,
        pendingContent,
      ]
    );

    return (
      <CitationContext.Provider value={contextValue}>
        <span
          ref={ref}
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          className={classNames("citation-root", className)}
          {...props}
        >
          {children}
        </span>
      </CitationContext.Provider>
    );
  }
);

CitationRoot.displayName = "Citation.Root";

export interface CitationTriggerProps extends HTMLAttributes<HTMLSpanElement> {
  onCitationClick?: (
    citation: CitationType,
    citationKey: string,
    event: MouseEvent
  ) => void;
  onCitationMouseEnter?: (citation: CitationType, citationKey: string) => void;
  onCitationMouseLeave?: (citation: CitationType, citationKey: string) => void;
  onCitationTouchEnd?: (
    citation: CitationType,
    citationKey: string,
    event: TouchEvent
  ) => void;
  isMobile?: boolean;
  disableHover?: boolean;
}

/** Interactive trigger component for the citation. */
export const CitationTrigger = forwardRef<
  HTMLSpanElement,
  CitationTriggerProps
>(
  (
    {
      children,
      className,
      onCitationClick,
      onCitationMouseEnter,
      onCitationMouseLeave,
      onCitationTouchEnd,
      isMobile = false,
      disableHover = false,
      onClick,
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
      onTouchEnd,
      ...props
    },
    ref
  ) => {
    const { citation, citationKey, status } = useCitationContext();

    const handleClick = useCallback(
      (e: MouseEvent<HTMLSpanElement>) => {
        e.stopPropagation();
        onClick?.(e);
      },
      [onClick]
    );

    const handleMouseDown = useCallback(
      (e: MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onMouseDown?.(e);
        onCitationClick?.(citation, citationKey, e);
      },
      [onMouseDown, onCitationClick, citation, citationKey]
    );

    const handleMouseEnter = useCallback(
      (e: MouseEvent<HTMLSpanElement>) => {
        onMouseEnter?.(e);
        if (!disableHover) {
          onCitationMouseEnter?.(citation, citationKey);
        }
      },
      [onMouseEnter, disableHover, onCitationMouseEnter, citation, citationKey]
    );

    const handleMouseLeave = useCallback(
      (e: MouseEvent<HTMLSpanElement>) => {
        onMouseLeave?.(e);
        if (!disableHover) {
          onCitationMouseLeave?.(citation, citationKey);
        }
      },
      [onMouseLeave, disableHover, onCitationMouseLeave, citation, citationKey]
    );

    const handleTouchEnd = useCallback(
      (e: TouchEvent<HTMLSpanElement>) => {
        onTouchEnd?.(e);
        if (isMobile) {
          e.preventDefault();
          e.stopPropagation();
          onCitationTouchEnd?.(citation, citationKey, e);
        }
      },
      [onTouchEnd, isMobile, onCitationTouchEnd, citation, citationKey]
    );

    const statusClasses = classNames(
      status.isVerified &&
        !status.isPartialMatch &&
        "citation-trigger--verified",
      status.isPartialMatch && "citation-trigger--partial",
      status.isMiss && "citation-trigger--miss",
      status.isPending && "citation-trigger--pending"
    );

    return (
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        className={classNames("citation-trigger", statusClasses, className)}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchEndCapture={isMobile ? handleTouchEnd : undefined}
        {...props}
      >
        {children}
      </span>
    );
  }
);

CitationTrigger.displayName = "Citation.Trigger";

export interface CitationBracketProps extends HTMLAttributes<HTMLSpanElement> {
  open?: string;
  close?: string;
}

/** Bracket wrapper component for citation content. */
export const CitationBracket = forwardRef<
  HTMLSpanElement,
  CitationBracketProps
>(({ children, className, open = "[", close = "]", ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={classNames("citation-bracket", className)}
      aria-hidden="true"
      {...props}
    >
      <span className="citation-bracket__open">{open}</span>
      <span className="citation-bracket__content">{children}</span>
      <span className="citation-bracket__close">{close}</span>
    </span>
  );
});

CitationBracket.displayName = "Citation.Bracket";

export interface CitationNumberProps extends HTMLAttributes<HTMLSpanElement> {
  number?: string | number;
}

/** Displays the citation number. */
export const CitationNumber = forwardRef<HTMLSpanElement, CitationNumberProps>(
  ({ className, number, ...props }, ref) => {
    const { citation, config, status } = useCitationContext();

    const displayNumber = useMemo(() => {
      if (number !== undefined) return String(number);

      if (config.displayKeySpan) {
        return (
          citation.keySpan?.toString() ||
          citation.citationNumber?.toString() ||
          config.fallbackDisplay ||
          ""
        );
      }

      return citation.citationNumber?.toString() || "";
    }, [number, citation, config]);

    if (status.isPending) {
      return (
        <span
          ref={ref}
          className={classNames(
            "citation-number citation-number--pending",
            className
          )}
          {...props}
        >
          {config.pendingContent}
        </span>
      );
    }

    return (
      <span
        ref={ref}
        className={classNames("citation-number", className)}
        {...props}
      >
        {displayNumber}
      </span>
    );
  }
);

CitationNumber.displayName = "Citation.Number";

export interface CitationKeySpanProps extends HTMLAttributes<HTMLSpanElement> {
  keySpan?: string;
  separator?: string;
}

/** Displays the citation keySpan (summary text). */
export const CitationKeySpan = forwardRef<HTMLSpanElement, CitationKeySpanProps>(
  ({ className, keySpan, separator = " ", ...props }, ref) => {
    const { citation, config } = useCitationContext();

    const displayKeySpan = useMemo(() => {
      if (keySpan !== undefined) return keySpan;
      if (!config.displayKeySpan) return "";
      return citation.keySpan?.toString() || "";
    }, [keySpan, citation, config]);

    if (!displayKeySpan) return null;

    return (
      <span
        ref={ref}
        className={classNames("citation-key-span", className)}
        {...props}
      >
        {displayKeySpan}
        {separator}
      </span>
    );
  }
);

CitationKeySpan.displayName = "Citation.KeySpan";

export interface CitationIndicatorProps
  extends HTMLAttributes<HTMLSpanElement> {
  verifiedIndicator?: ReactNode;
  partialIndicator?: ReactNode;
  missIndicator?: ReactNode;
  pendingIndicator?: ReactNode;
  showFor?: Array<"verified" | "partial" | "miss" | "pending">;
}

/** Displays a status indicator based on citation verification state. */
export const CitationIndicator = forwardRef<
  HTMLSpanElement,
  CitationIndicatorProps
>(
  (
    {
      className,
      verifiedIndicator = "✓",
      partialIndicator = "*",
      missIndicator = null,
      pendingIndicator = null,
      showFor,
      ...props
    },
    ref
  ) => {
    const { status } = useCitationContext();

    const shouldShow = useCallback(
      (state: "verified" | "partial" | "miss" | "pending") => {
        if (!showFor) return true;
        return showFor.includes(state);
      },
      [showFor]
    );

    if (status.isPartialMatch && shouldShow("partial")) {
      return (
        <span
          ref={ref}
          className={classNames(
            "citation-indicator citation-indicator--partial",
            className
          )}
          aria-label="Partial match"
          {...props}
        >
          {partialIndicator}
        </span>
      );
    }

    if (status.isVerified && !status.isPartialMatch && shouldShow("verified")) {
      return (
        <span
          ref={ref}
          className={classNames(
            "citation-indicator citation-indicator--verified",
            className
          )}
          aria-label="Verified"
          {...props}
        >
          {verifiedIndicator}
        </span>
      );
    }

    if (status.isMiss && shouldShow("miss") && missIndicator) {
      return (
        <span
          ref={ref}
          className={classNames(
            "citation-indicator citation-indicator--miss",
            className
          )}
          aria-label="Not found"
          {...props}
        >
          {missIndicator}
        </span>
      );
    }

    if (status.isPending && shouldShow("pending") && pendingIndicator) {
      return (
        <span
          ref={ref}
          className={classNames(
            "citation-indicator citation-indicator--pending",
            className
          )}
          aria-label="Pending"
          {...props}
        >
          {pendingIndicator}
        </span>
      );
    }

    return null;
  }
);

CitationIndicator.displayName = "Citation.Indicator";

export interface CitationStatusProps {
  children: (status: CitationStatus) => ReactNode;
}

/** Render prop component for accessing citation status. */
export function CitationStatusComponent({ children }: CitationStatusProps) {
  const { status } = useCitationContext();
  return <>{children(status)}</>;
}

CitationStatusComponent.displayName = "Citation.Status";

export interface CitationPhraseProps extends HTMLAttributes<HTMLSpanElement> {
  maxLength?: number;
  truncationSuffix?: string;
}

/** Displays the citation's full phrase with optional truncation. */
export const CitationPhrase = forwardRef<HTMLSpanElement, CitationPhraseProps>(
  ({ className, maxLength, truncationSuffix = "...", ...props }, ref) => {
    const { citation } = useCitationContext();

    const displayPhrase = useMemo(() => {
      const phrase = citation.fullPhrase || "";
      if (!maxLength || phrase.length <= maxLength) return phrase;
      return phrase.slice(0, maxLength) + truncationSuffix;
    }, [citation.fullPhrase, maxLength, truncationSuffix]);

    if (!displayPhrase) return null;

    return (
      <span
        ref={ref}
        className={classNames("citation-phrase", className)}
        {...props}
      >
        {displayPhrase}
      </span>
    );
  }
);

CitationPhrase.displayName = "Citation.Phrase";

export interface CitationPageProps extends HTMLAttributes<HTMLSpanElement> {
  prefix?: string;
}

/** Displays the citation's page number. */
export const CitationPage = forwardRef<HTMLSpanElement, CitationPageProps>(
  ({ className, prefix = "", ...props }, ref) => {
    const { citation } = useCitationContext();

    if (citation.pageNumber === undefined || citation.pageNumber === null) {
      return null;
    }

    return (
      <span
        ref={ref}
        className={classNames("citation-page", className)}
        {...props}
      >
        {prefix}
        {citation.pageNumber}
      </span>
    );
  }
);

CitationPage.displayName = "Citation.Page";

/** Citation primitives namespace for composable citation components. */
export const Citation = {
  Root: CitationRoot,
  Trigger: CitationTrigger,
  Bracket: CitationBracket,
  Number: CitationNumber,
  KeySpan: CitationKeySpan,
  Indicator: CitationIndicator,
  Status: CitationStatusComponent,
  Phrase: CitationPhrase,
  Page: CitationPage,
} as const;

// Types are exported at their definitions above
