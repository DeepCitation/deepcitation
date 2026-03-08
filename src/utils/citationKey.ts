import { getCitationPageNumber } from "../parsing/normalizeCitation.js";
import type { Citation } from "../types/citation.js";
import { isAudioVideoCitation, isUrlCitation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { sha1Hash } from "./sha.js";

/**
 * Returns a deterministic content-hash key for a citation.
 * Works with document, URL, and audio/video citation types.
 *
 * The key is a 16-character hex prefix of a SHA-1 hash built from
 * the citation's distinguishing fields (phrase, anchor, page, line IDs,
 * plus type-specific fields like URL or timestamps).
 *
 * @param citation - The citation to compute a key for
 * @returns A deterministic 16-char hex key
 */
export function getCitationKey(citation: Citation): string {
  const pageNumber = citation.pageNumber || getCitationPageNumber(citation.startPageId || (citation as any).pageId);
  // Common key parts
  const keyParts = [
    citation.fullPhrase || "",
    citation.anchorText?.toString() || "",
    pageNumber?.toString() || "",
    citation.lineIds?.join(",") || "",
  ];

  if (isUrlCitation(citation)) {
    // URL-specific key parts
    keyParts.push(citation.url || "", citation.title || "", citation.domain || "");
  } else if (isAudioVideoCitation(citation)) {
    // AV-specific key parts: timestamps distinguish clips from the same file
    keyParts.push(
      citation.attachmentId || "",
      citation.timestamps?.startTime || "",
      citation.timestamps?.endTime || "",
    );
  }

  return sha1Hash(keyParts.join("|")).slice(0, 16);
}

/**
 * Returns a deterministic content-hash key for a verification.
 *
 * @param verification - The verification to compute a key for
 * @returns A deterministic 16-char hex key
 */
export function getVerificationKey(verification: Verification): string {
  const keyParts = [
    verification.attachmentId || "",
    verification.label || "",
    verification.verifiedFullPhrase || "",
    verification.verifiedAnchorText || "",
    verification.document?.verifiedLineIds?.join(",") || "",
    verification.document?.verifiedPageNumber?.toString() || "",

    verification.verifiedMatchSnippet || "",
    verification.document?.hitIndexWithinPage?.toString() || "",
  ];

  return sha1Hash(keyParts.join("|")).slice(0, 16);
}
