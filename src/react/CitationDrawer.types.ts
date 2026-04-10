import type React from "react";
import type { Citation } from "../types/citation.js";
import type { PageImage, Verification } from "../types/verification.js";
import type { IndicatorVariant } from "./types.js";

export interface CitationDrawerItem {
  citationKey: string;
  citation: Citation;
  verification: Verification | null;
  page?: PageImage | null;
  /** The text as it appeared in the asserting document (Domain A). When different from sourceMatch, triggers a variance annotation. */
  claimText?: string;
}

/** Group of citations from the same source (for "+N" display). */
export interface SourceCitationGroup {
  sourceName: string;
  sourceDomain?: string;
  sourceFavicon?: string;
  citations: CitationDrawerItem[];
  additionalCount: number;
}

export interface CitationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  citationGroups: SourceCitationGroup[];
  title?: string;
  /** Overrides the auto-derived source name in the drawer heading. */
  label?: string;
  onCitationClick?: (item: CitationDrawerItem) => void;
  onReadMore?: (item: CitationDrawerItem) => void;
  className?: string;
  position?: "bottom" | "right";
  renderCitationItem?: (item: CitationDrawerItem) => React.ReactNode;
  /** @default "icon" */
  indicatorVariant?: IndicatorVariant;
  /** Map of attachmentId or URL to friendly display label for group headers. */
  sourceLabelMap?: Record<string, string>;
  pageImagesByAttachmentId?: Record<string, PageImage[]>;
}

export interface CitationDrawerItemProps {
  item: CitationDrawerItem;
  pageImages?: PageImage[];
  isLast?: boolean;
  onClick?: (item: CitationDrawerItem) => void;
  className?: string;
  /** @default "icon" */
  indicatorVariant?: IndicatorVariant;
  /**
   * Whether the item should start in expanded state (e.g., auto-expand first failure).
   * @default false
   */
  defaultExpanded?: boolean;
  /** Stagger delay in ms for the entry animation. Passed as a primitive to avoid busting memo(). */
  animationDelay?: number;
}
