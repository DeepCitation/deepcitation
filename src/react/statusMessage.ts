import type { SearchStatus } from "../types/search.js";
import { createTranslator, type TranslateFunction } from "./i18n.js";

/**
 * Get a human-readable status message for the verification status.
 * Pass a `t` function from `useTranslation()` for i18n support.
 */
export function getContextualStatusMessage(
  status: SearchStatus | null | undefined,
  expectedPage?: number | null,
  actualPage?: number | null,
  t: TranslateFunction = createTranslator(),
): string {
  if (!status) return "";

  switch (status) {
    case "found":
      return t("message.exactMatch");
    case "found_anchor_text_only":
      return t("message.anchorTextFound");
    case "found_phrase_missed_anchor_text":
      return t("message.phraseFound");
    case "partial_text_found":
      return t("message.partialTextMatch");
    case "found_on_other_page":
      if (expectedPage != null && actualPage != null) {
        return t("message.foundOnOtherPage", { actualPage, expectedPage });
      }
      return t("message.foundOnDifferentPage");
    case "found_on_other_line":
      return t("message.foundOnDifferentLine");
    case "first_word_found":
      return t("message.firstWordOnly");
    case "not_found":
      return t("message.notFound");
    case "pending":
    case "loading":
      return t("message.searching");
    default:
      return "";
  }
}
