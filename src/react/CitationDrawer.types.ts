import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

/**
 * A single citation item with its verification result for the drawer.
 */
export interface CitationDrawerItem {
  /** Unique key for this citation */
  citationKey: string;
  /** The citation data */
  citation: Citation;
  /** Verification result if available */
  verification: Verification | null;
}

/**
 * Group of citations from the same source (for "+N" display).
 * Used when multiple citations reference the same source domain.
 */
export interface SourceCitationGroup {
  /** Primary source name to display (e.g., "Delaware Corporations") */
  sourceName: string;
  /** Source domain (e.g., "delaware.gov") */
  sourceDomain?: string;
  /** Favicon URL for the source */
  sourceFavicon?: string;
  /** All citations in this group */
  citations: CitationDrawerItem[];
  /** Count of additional citations beyond the first */
  additionalCount: number;
}

/**
 * Props for the CitationDrawer component.
 */
export interface CitationDrawerProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Callback to close the drawer */
  onClose: () => void;
  /**
   * Citation groups to display.
   *
   * **Performance Note**: For optimal performance, memoize this prop using `useMemo` or ensure
   * it has a stable reference. The drawer uses `useMemo` internally to compute total citations,
   * but if this prop changes on every render, that optimization is bypassed.
   *
   * @example
   * ```tsx
   * const citationGroups = useMemo(() => computeGroups(citations), [citations]);
   * <CitationDrawer citationGroups={citationGroups} ... />
   * ```
   */
  citationGroups: SourceCitationGroup[];
  /** Title for the drawer header */
  title?: string;
  /** @deprecated No longer used. The drawer always shows all items in a flat scrollable list. */
  showMoreSection?: boolean;
  /** @deprecated No longer used. The drawer always shows all items in a flat scrollable list. */
  maxVisibleItems?: number;
  /** Callback when a citation item is clicked */
  onCitationClick?: (item: CitationDrawerItem) => void;
  /** Callback when "Read more" is clicked for a citation */
  onReadMore?: (item: CitationDrawerItem) => void;
  /** Additional class name for the drawer container */
  className?: string;
  /** Render position: 'bottom' for mobile sheet, 'right' for side panel */
  position?: "bottom" | "right";
  /** Custom render for citation items */
  renderCitationItem?: (item: CitationDrawerItem) => React.ReactNode;
}

/**
 * Props for the CitationDrawerItem component.
 */
export interface CitationDrawerItemProps {
  /** The citation item to display */
  item: CitationDrawerItem;
  /** Whether this is the last item (no bottom border) */
  isLast?: boolean;
  /** Callback when item is clicked */
  onClick?: (item: CitationDrawerItem) => void;
  /** Callback when "Read more" is clicked */
  onReadMore?: (item: CitationDrawerItem) => void;
  /** Additional class name */
  className?: string;
}
