/**
 * Runtime-only types for the vanilla popover.
 * These are compiled into the IIFE and never imported by the Node.js entry.
 */

export interface PopoverState {
  /** Currently visible popover element (singleton) */
  el: HTMLDivElement | null;
  /** Expanded image overlay element */
  expandedEl: HTMLDivElement | null;
  /** Currently active trigger element */
  activeTrigger: HTMLElement | null;
  /** Whether expanded image view is showing */
  isExpanded: boolean;
  /** Saved body overflow value before expanded view (for restore) */
  savedBodyOverflow: string;
}

export interface VerificationData {
  status?: string;
  label?: string;
  evidence?: {
    src?: string;
    dimensions?: { width: number; height: number };
  };
  verifiedFullPhrase?: string;
  verifiedAnchorText?: string;
  verifiedMatchSnippet?: string;
  document?: {
    verifiedPageNumber?: number;
    mimeType?: string;
  };
  url?: {
    verifiedTitle?: string;
    verifiedUrl?: string;
    verifiedDomain?: string;
    verifiedFaviconUrl?: string;
  };
  citation?: {
    fullPhrase?: string;
    anchorText?: string;
    type?: string;
  };
  /** Page renders for the full-page viewer. */
  pageImages?: Array<{
    pageNumber: number;
    dimensions: { width: number; height: number };
    imageUrl: string;
    isMatchPage?: boolean;
  }>;
}
