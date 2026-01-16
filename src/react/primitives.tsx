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
  config: {
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
  children: ReactNode;
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
      children,
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
        config: {
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
          className={classNames("inline", className)}
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
        "text-green-600 dark:text-green-500",
      status.isPartialMatch && "text-amber-600 dark:text-amber-500",
      status.isMiss && "text-red-500 dark:text-red-400 line-through",
      status.isPending && "text-gray-400 dark:text-gray-500"
    );

    return (
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        className={classNames(
          "cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 focus-visible:rounded-sm",
          statusClasses,
          className
        )}
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
      className={classNames("inline", className)}
      aria-hidden="true"
      {...props}
    >
      <span className="inline">{open}</span>
      <span className="inline">{children}</span>
      <span className="inline">{close}</span>
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
      return (
        citation.keySpan?.toString() ||
        citation.citationNumber?.toString() ||
        config.fallbackDisplay ||
        "1"
      );
    }, [number, citation, config]);

    if (status.isPending) {
      return (
        <span
          ref={ref}
          className={classNames(
            "font-medium opacity-60",
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
        className={classNames("font-medium", className)}
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
    const { citation } = useCitationContext();

    const displayKeySpan = useMemo(() => {
      if (keySpan !== undefined) return keySpan;
      return citation.keySpan?.toString() || "";
    }, [keySpan, citation]);

    if (!displayKeySpan) return null;

    return (
      <span
        ref={ref}
        className={classNames("italic", className)}
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

    const baseClasses = "inline ml-0.5 text-[0.85em]";

    if (status.isPartialMatch && shouldShow("partial")) {
      return (
        <span
          ref={ref}
          className={classNames(
            baseClasses,
            "text-amber-600 dark:text-amber-500",
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
            baseClasses,
            "text-green-600 dark:text-green-500",
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
            baseClasses,
            "text-red-500 dark:text-red-400",
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
            baseClasses,
            "text-gray-400 dark:text-gray-500",
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
        className={classNames("italic", className)}
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
        className={classNames("text-xs text-gray-400 dark:text-gray-500", className)}
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
