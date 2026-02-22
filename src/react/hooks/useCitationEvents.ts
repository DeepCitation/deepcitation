/**
 * Hook for shared citation event handlers.
 *
 * Extracts the duplicated click/hover/keyboard logic that was previously
 * inlined in each variant component in CitationVariants.tsx.
 *
 * @packageDocumentation
 */

import { type MouseEvent, useCallback } from "react";
import type { Citation } from "../../types/citation.js";
import type { CitationEventHandlers } from "../types.js";

export interface UseCitationEventsResult {
  onMouseEnter: (() => void) | undefined;
  onMouseLeave: (() => void) | undefined;
  onMouseDown: (e: MouseEvent<HTMLElement>) => void;
  onClick: (e: MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}

/**
 * Generates stable event handlers for citation interaction.
 *
 * Returns handlers for click, hover, and keyboard events that
 * delegate to the provided `eventHandlers` callbacks.
 *
 * @param citation - The citation data
 * @param citationKey - The generated citation key
 * @param eventHandlers - Optional event handler callbacks
 * @param preventTooltips - When true, mouse enter/leave are suppressed
 */
export function useCitationEvents(
  citation: Citation,
  citationKey: string,
  eventHandlers: CitationEventHandlers | undefined,
  preventTooltips: boolean,
): UseCitationEventsResult {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      eventHandlers?.onClick?.(citation, citationKey, e as MouseEvent<HTMLSpanElement>);
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
        // Safe cast: onClick handler expects MouseEvent but only uses common Event properties
        // (target, preventDefault, stopPropagation) that exist on both KeyboardEvent and MouseEvent.
        // The handler doesn't access mouse-specific properties like clientX/clientY.
        eventHandlers?.onClick?.(citation, citationKey, e as unknown as MouseEvent<HTMLSpanElement>);
      }
    },
    [eventHandlers, citation, citationKey],
  );

  return {
    onMouseEnter: preventTooltips ? undefined : handleMouseEnter,
    onMouseLeave: preventTooltips ? undefined : handleMouseLeave,
    onMouseDown: handleClick,
    onClick: (e: MouseEvent) => e.stopPropagation(),
    onKeyDown: handleKeyDown,
  };
}
