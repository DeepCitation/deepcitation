import type { VariationType } from "../types/search.js";
import { createTranslator, type MessageKey, type TranslateFunction } from "./i18n.js";

/**
 * Maps VariationType to i18n message key.
 */
const VARIATION_KEY_MAP: Record<VariationType, MessageKey> = {
  exact: "variation.exact",
  normalized: "variation.normalized",
  currency: "variation.currency",
  date: "variation.date",
  numeric: "variation.numeric",
  symbol: "variation.symbol",
  accent: "variation.accent",
};

/**
 * Get the user-friendly label for a variation type.
 * Returns null for undefined types (caller should fall back to "Also tried").
 * Pass a `t` function from `useTranslation()` for i18n support.
 */
export function getVariationLabel(
  variationType: VariationType | undefined,
  t: TranslateFunction = createTranslator(),
): string | null {
  if (!variationType) return null;
  return t(VARIATION_KEY_MAP[variationType]);
}
