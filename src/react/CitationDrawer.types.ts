import type { Citation } from "../types/citation.js";
import type { Verification, VerificationPage } from "../types/verification.js";

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
  /** Optional page render for the citation's verified page */
  page?: VerificationPage | null;
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
  /** Citation groups to display */
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
  /**
   * Visual style for status indicators.
   * - `"icon"`: Checkmarks, spinner, X icons (default)
   * - `"dot"`: Subtle colored dots (like GitHub status dots)
   * @default "icon"
   */
  indicatorVariant?: "icon" | "dot";
  /**
   * Map of attachmentId or URL to friendly display label.
   * Used to override the default source name in group headers and citation rows.
   * Lookup tries citation.attachmentId first, then citation.url.
   */
  sourceLabelMap?: Record<string, string>;
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
  /**
   * Visual style for status indicators.
   * - `"icon"`: Checkmarks, spinner, X icons (default)
   * - `"dot"`: Subtle colored dots (like GitHub status dots)
   * @default "icon"
   */
  indicatorVariant?: "icon" | "dot";
  /**
   * Map of attachmentId or URL to friendly display label.
   * Used to override the default source name display.
   */
  sourceLabelMap?: Record<string, string>;
  /**
   * Whether this item is rendered within a group context (group header shows source name).
   * When true, the source name line is hidden to avoid repetition.
   * @default false
   */
  hideSourceName?: boolean;
}
