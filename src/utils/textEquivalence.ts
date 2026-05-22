const DASH_VARIANT_PATTERN = /[\u002d\u058a\u05be\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g;
const DASH_SPACING_PATTERN = /\s*-\s*/g;
const MULTI_SPACE_PATTERN = /\s+/g;

function normalizeDashVariants(text: string): string {
  return text
    .normalize("NFC")
    .replace(DASH_VARIANT_PATTERN, "-")
    .replace(DASH_SPACING_PATTERN, "-")
    .replace(MULTI_SPACE_PATTERN, " ")
    .trim();
}

export function isExactOrDashVariantMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim() ?? "";
  const right = b?.trim() ?? "";
  if (!left || !right) return false;
  return left === right || normalizeDashVariants(left) === normalizeDashVariants(right);
}

export function isExactOrDashVariantPrefixMatch(
  prefix: string | null | undefined,
  value: string | null | undefined,
): boolean {
  const trimmedPrefix = prefix?.trim() ?? "";
  const trimmedValue = value?.trim() ?? "";
  if (!trimmedPrefix || !trimmedValue) return false;
  if (trimmedPrefix === trimmedValue) return true;
  const normalizedPrefix = normalizeDashVariants(trimmedPrefix);
  const normalizedValue = normalizeDashVariants(trimmedValue);
  if (normalizedPrefix === normalizedValue) return true;
  if (!normalizedValue.startsWith(normalizedPrefix)) return false;
  const nextChar = normalizedValue[normalizedPrefix.length];
  return nextChar === undefined || !/[\p{L}\p{N}]/u.test(nextChar);
}
