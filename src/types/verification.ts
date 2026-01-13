import { sha1Hash } from "../utils/sha.js";
import { type Citation } from "./citation.js";
import { type SearchState } from "./search.js";
import { type PdfSpaceItem } from "./boxes.js";

export const NOT_FOUND_VERIFICATION_INDEX = -1;
export const PENDING_VERIFICATION_INDEX = -2;

export const BLANK_VERIFICATION: Verification = {
  pageNumber: NOT_FOUND_VERIFICATION_INDEX,
  regex: null,
  lowerCaseSearchTerm: null,
  attachmentId: null,
  matchSnippet: null,
  source: null,
  citation: {
    fileId: undefined,
    startPageKey: null,
    fullPhrase: null,
    keySpan: null,
    lineIds: null,
    reasoning: null,
    pageNumber: NOT_FOUND_VERIFICATION_INDEX,
  },
};

export function deterministicIdFromVerification(
  verification: Verification
): string {
  return sha1Hash(
    `${verification.lowerCaseSearchTerm}-${verification.attachmentId}-${verification.pageNumber}-${verification.hitIndexWithinPage}-${verification.matchSnippet}-${verification?.hitIndexWithinPage}`
  );
}

export interface Verification {
  regex?: RegExp | null;
  lowerCaseSearchTerm: string | null; // e.g. "ca013c03-0001"
  label?: string | null; //e.g. "Invoice"
  attachmentId?: string | null;
  pageNumber?: number | null;
  timestamp?: number | null;

  citation?: Citation;

  searchState?: SearchState | null;

  hitIndexWithinPage?: number | null;

  highlightColor?: string | null;

  matchSnippet?: string | null;

  pdfSpaceItem?: PdfSpaceItem;

  verificationImageBase64?: string | null;
  source?: string | null;
  verifiedAt?: Date;
}
