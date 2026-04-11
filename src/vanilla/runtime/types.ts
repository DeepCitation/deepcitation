/**
 * Runtime-only types for the vanilla popover.
 * These are compiled into the IIFE and never imported by the Node.js entry.
 *
 * VerificationData references canonical types from `types/` so that field
 * additions, renames, or removals in the source-of-truth types surface as
 * compile errors here rather than silent runtime mismatches.
 */

import type { SearchAttempt, SearchStatus } from "../../types/search.js";
import type {
  DocumentVerificationResult,
  EvidenceImage,
  PageImage,
  UrlVerificationResult,
} from "../../types/verification.js";

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
  status?: SearchStatus;
  label?: string;
  evidence?: Pick<EvidenceImage, "src" | "dimensions">;
  verifiedSourceContext?: string;
  verifiedSourceMatch?: string;
  sourceSnippet?: string;
  document?: Pick<
    DocumentVerificationResult,
    "verifiedPageNumber" | "mimeType" | "sourceContextDeepItem" | "sourceMatchDeepItems" | "renderScale"
  >;
  url?: Pick<
    UrlVerificationResult,
    | "verifiedUrl"
    | "verifiedTitle"
    | "verifiedDomain"
    | "verifiedFaviconUrl"
    | "urlAccessStatus"
    | "urlVerificationError"
  >;
  citation?: {
    sourceContext?: string;
    sourceMatch?: string;
    type?: string;
  };
  /** Pre-resolved download URL for the source file (PDF, DOCX, etc.). */
  downloadUrl?: string;
  /** Ordered list of search attempts made during verification. */
  searchAttempts?: SearchAttempt[];
  /** Page renders for the full-page viewer. */
  pageImages?: PageImage[];
}
