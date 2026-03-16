/**
 * Citation status derivation — delegates to the canonical getCitationStatus
 * in parseCitation.ts. This module provides React-layer convenience wrappers
 * (isPartialSearchStatus, getStatusLabel) and re-exports the canonical function
 * as getStatusFromVerification for backward compatibility.
 *
 * @packageDocumentation
 */

import { getCitationStatus } from "../parsing/parseCitation.js";
import type { CitationStatus } from "../types/citation.js";
import type { SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { defaultTranslator, type TranslateFunction } from "./i18n.js";

const PARTIAL_STATUSES: ReadonlySet<SearchStatus> = new Set<SearchStatus>([
  "found_anchor_text_only",
  "found_on_other_page",
  "found_on_other_line",
  "partial_text_found",
  "first_word_found",
]);

export function isPartialSearchStatus(status: SearchStatus | null | undefined): boolean {
  if (!status) return false;
  return PARTIAL_STATUSES.has(status);
}

/**
 * Derive citation status from a Verification object.
 * Delegates to the canonical getCitationStatus in parseCitation.ts.
 */
export const getStatusFromVerification: (verification: Verification | null | undefined) => CitationStatus =
  getCitationStatus;

export function getStatusLabel(status: CitationStatus, t: TranslateFunction = defaultTranslator): string {
  if (status.isVerified && !status.isPartialMatch) return t("status.verified");
  if (status.isPartialMatch) return t("status.partialMatch");
  if (status.isMiss) return t("status.notFound");
  if (status.isPending) return t("status.verifying");
  return "";
}
