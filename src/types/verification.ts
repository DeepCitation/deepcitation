import { sha1Hash } from "../utils/sha.js";
import { type Citation } from "./citation.js";
import { type SearchStatus, type SearchAttempt } from "./search.js";
import { type PdfSpaceItem } from "./boxes.js";

export const NOT_FOUND_VERIFICATION_INDEX = -1;
export const PENDING_VERIFICATION_INDEX = -2;

export const BLANK_VERIFICATION: Verification = {
  attachmentId: null,
  verifiedPageNumber: NOT_FOUND_VERIFICATION_INDEX,
  verifiedMatchSnippet: null,
  citation: {
    pageNumber: NOT_FOUND_VERIFICATION_INDEX,
  },
  status: "not_found",
};

export interface Verification {
  attachmentId?: string | null;

  label?: string | null; //e.g. "Invoice"

  citation?: Citation;

  // Search status
  status?: SearchStatus | null;

  // Search attempts
  searchAttempts?: SearchAttempt[];

  highlightColor?: string | null;

  // Verified results (actual values found - expected values are in citation)
  verifiedPageNumber?: number | null;

  verifiedLineIds?: number[] | null;

  verifiedTimestamps?: { startTime?: string; endTime?: string } | null;

  verifiedFullPhrase?: string | null;

  verifiedKeySpan?: string | null;

  verifiedMatchSnippet?: string | null;

  hitIndexWithinPage?: number | null;

  pdfSpaceItem?: PdfSpaceItem;

  verificationImageBase64?: string | null;

  verifiedAt?: Date;
}
