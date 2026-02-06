import type { VariationType } from "../types/search.js";

/**
 * User-friendly labels for variation types shown in search attempts.
 * Maps technical variation type keys to human-readable labels.
 * @example getVariationLabel("currency") -> "Price formats"
 */
const VARIATION_TYPE_LABELS: Record<VariationType, string> = {
  exact: "Exact match",
  normalized: "Normalized",
  currency: "Price formats",
  date: "Date formats",
  numeric: "Number formats",
  symbol: "Symbol variants",
  accent: "Accent variants",
};

/**
 * Get the user-friendly label for a variation type.
 * Returns null for undefined types (caller should fall back to "Also tried").
 */
export function getVariationLabel(variationType: VariationType | undefined): string | null {
  if (!variationType) return null;
  return VARIATION_TYPE_LABELS[variationType];
}
