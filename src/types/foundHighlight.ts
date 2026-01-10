import { sha1Hash } from "../utils/sha.js";
import { type Citation } from "./citation";
import { type SearchState } from "./search";
import { type PdfSpaceItem } from "./boxes";

export const NOT_FOUND_HIGHLIGHT_INDEX = -1;
export const PENDING_HIGHLIGHT_INDEX = -2;

export const BLANK_HIGHLIGHT_LOCATION: FoundHighlightLocation = {
  pageNumber: NOT_FOUND_HIGHLIGHT_INDEX,
  regex: null,
  lowerCaseSearchTerm: null,
  attachmentId: null,
  matchSnippet: null,
  source: null,
  citation: {
    startPageKey: null,
    lineIds: null,
    pageNumber: NOT_FOUND_HIGHLIGHT_INDEX,
    fileId: undefined,
    fullPhrase: null,
    value: null,
  },
};

export function deterministicIdFromHighlightLocation(
  highlightLocation: FoundHighlightLocation
): string {
  return sha1Hash(
    `${highlightLocation.lowerCaseSearchTerm}-${highlightLocation.attachmentId}-${highlightLocation.pageNumber}-${highlightLocation.hitIndexWithinPage}-${highlightLocation.matchSnippet}-${highlightLocation?.hitIndexWithinPage}`
  );
}

export interface FoundHighlightLocation {
  regex?: RegExp | null;
  lowerCaseSearchTerm: string | null; // e.g. "ca013c03-0001"
  label?: string | null; //e.g. "Invoice"
  attachmentId?: string | null;
  pageNumber?: number | null;
  timestamp?: number | null;

  citation?: Citation;

  searchState?: SearchState | null;

  hitIndexWithinPage?: number | null;

  matchSnippet?: string | null;

  pdfSpaceItem?: PdfSpaceItem;

  verificationImageBase64?: string | null;
  source?: string | null;
  verifiedAt?: Date;
}
