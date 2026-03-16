/**
 * Citation status derivation — delegates to the canonical getCitationStatus
 * in parseCitation.ts. This module provides React-layer convenience wrappers
 * (isPartialSearchStatus, getStatusLabel) and re-exports the canonical function
 * as getStatusFromVerification for backward compatibility.
 *
 * @packageDocumentation
 */

import { getCitationStatus, PARTIAL_STATUSES } from "../parsing/parseCitation.js";
import type { CitationStatus } from "../types/citation.js";
import type { SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { defaultTranslator, type TranslateFunction } from "./i18n.js";

export function isPartialSearchStatus(status: SearchStatus | null | undefined): boolean {
  if (!status) return false;
  return PARTIAL_STATUSES.has(status);
}

/**
 * Derive citation status from a Verification object.
 * Delegates to the canonical getCitationStatus in parseCitation.ts.
 */
export function getStatusFromVerification(verification: Verification | null | undefined): CitationStatus {
  return getCitationStatus(verification);
}

export function getStatusLabel(status: CitationStatus, t: TranslateFunction = defaultTranslator): string {
  if (status.isVerified && !status.isPartialMatch) return t("status.verified");
  if (status.isPartialMatch) return t("status.partialMatch");
  if (status.isMiss) return t("status.notFound");
  if (status.isPending) return t("status.verifying");
  return "";
}
