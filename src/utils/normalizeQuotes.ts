/**
 * Length-preserving OCR text normalizer for display-path comparisons.
 *
 * OCR engines (Google Vision, pdf.js) produce Unicode variants of common
 * punctuation: curly quotes, smart apostrophes, typographic dashes, and
 * non-breaking spaces. These cause `.includes()` / `.indexOf()` comparisons
 * to fail against ASCII text from citation anchors.
 *
 * Every replacement is 1:1 (single char → single char), keeping string length
 * identical so indices found on normalized text are valid on the original.
 *
 * The full TextNormalizer in shared/ handles additional cases (confusables,
 * NFD decomposition, combining marks) for the search pipeline. This function
 * covers the OCR-punctuation subset needed by `.includes()` checks where
 * positional accuracy matters.
 *
 * Usage: import and apply to BOTH sides of any `.includes()` / `.indexOf()` call
 * that compares anchor text against OCR-derived text.
 */
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B\u02BC`]/g, "'") // smart single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"') // smart double quotes → "
    .replace(/[\u2013\u2014\u2015\u2212\u2010\u2011\u2012]/g, "-") // typographic dashes → -
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ") // non-breaking/special spaces → space
    .replace(/\u2026/g, ".") // ellipsis → . (not length-preserving: 1 char → 1 char, but original is 1 char)
    .replace(/[\u2022\u2023\u2043]/g, "-"); // bullets → -
}
