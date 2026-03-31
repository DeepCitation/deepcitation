import type { CitationData } from "../prompts/citationPrompts.js";
import { validateRegexInput } from "./regexSafety.js";

export interface CitationWarning {
  citationId: number;
  field: string;
  message: string;
}

export type ArtifactType =
  | "collapsed_spaces"
  | "broken_hyphen"
  | "fi_ligature"
  | "table_fragment"
  | "missing_space_after_punctuation"
  | "broken_word";

export interface ExtractionArtifact {
  type: ArtifactType;
  match: string;
  position: number;
}

export interface ValidationReport {
  valid: boolean;
  warnings: CitationWarning[];
  errors: CitationWarning[];
}

// Soft limits — longer anchors work but shorter ones look better in reports
const ANCHOR_CHARS_THRESHOLD = 60;
const ANCHOR_WORDS_THRESHOLD = 6;

/**
 * Detects common PDF/HTML text extraction artifacts in a string.
 *
 * These artifacts cause `partial_text_found` because the verification engine
 * searches a separately-extracted text representation that doesn't share
 * the same artifacts.
 *
 * Root causes from Round 3 QA (527 citations, 71 partials):
 * - RC1a: Collapsed spaces — "informationmaterialto" (Miranda, Reg S-K)
 * - RC1b: Broken hyphens — "bene-cially" for "beneficially" (Reg S-K)
 * - RC1c: Fi-ligature loss — "Certain-elds" for "Certain fields" (BSA/AML)
 * - RC3:  Table fragments — "yAge 60 years" from table cell concatenation (CDC)
 */
export function detectExtractionArtifacts(text: string): ExtractionArtifact[] {
  if (!text) return [];
  validateRegexInput(text);
  const artifacts: ExtractionArtifact[] = [];

  // RC1a: Collapsed spaces — two lowercase words joined without a space.
  // Pattern: a lowercase letter followed immediately by an uppercase letter mid-word,
  // or common word endings (e/s/d/n/t/y) joined to common word starts.
  // Excludes intentional camelCase by requiring the preceding char to be lowercase
  // and the following sequence to form a plausible word boundary.
  const collapsedSpacePattern = /[a-z]{2,}[A-Z][a-z]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = collapsedSpacePattern.exec(text)) !== null) {
    artifacts.push({ type: "collapsed_spaces", match: m[0], position: m.index });
  }

  // Also detect all-lowercase collapsed words: "informationmaterial", "ismaterialto"
  // Heuristic: a run of 20+ lowercase chars with no spaces is suspicious in natural text.
  // Threshold of 20 avoids false positives on long English words like "unconstitutional" (16),
  // "telecommunications" (18), "counterproductive" (17).
  const longLowercaseRun = /[a-z]{20,}/g;
  while ((m = longLowercaseRun.exec(text)) !== null) {
    artifacts.push({ type: "collapsed_spaces", match: m[0], position: m.index });
  }

  // RC1b: Broken hyphens — word fragment + hyphen + word fragment where
  // the combined form is a real word. Common patterns from OCR line breaks:
  // "bene-cially", "or-nancial", "a-ects", "brie-y", "-ve percent"
  // Pattern: a hyphen between two letter sequences where the left side is 1-6 chars
  // and the right side is 1-8 chars, and neither side is a standalone word > 3 chars.
  // Pattern also catches standalone "-ve", "-ly" etc. at word boundary (space before hyphen)
  const brokenHyphenPattern = /(?:\b([a-zA-Z]{1,6})-([a-zA-Z]{1,8})\b|(?:^|\s)-([a-zA-Z]{1,8})\b)/g;
  // Common legitimate hyphenated terms to exclude.
  // For multi-segment words like "year-over-year", each regex match is a pair
  // (e.g. "year-over" then "over-year"), so both segments must be listed.
  const legitimateHyphens = new Set([
    "year-over",
    "over-year",
    "year-old",
    "well-known",
    "high-value",
    "non-critical",
    "re-injected",
    "pre-commit",
    "self-contained",
    "first-line",
    "long-term",
    "short-term",
    "full-phrase",
    "anchor-text",
    "sub-item",
    "fact-finding",
    "co-authored",
  ]);
  while ((m = brokenHyphenPattern.exec(text)) !== null) {
    const full = m[0].trim().toLowerCase();
    if (legitimateHyphens.has(full)) continue;
    const left = m[1] ?? ""; // empty for standalone "-word" pattern
    const right = m[2] ?? m[3] ?? "";
    // Suspicious if either fragment is very short (0-2 chars) — likely a line-break artifact
    if (left.length <= 2 || right.length <= 2) {
      artifacts.push({ type: "broken_hyphen", match: m[0].trim(), position: m.index });
    }
  }

  // RC1c: Fi-ligature loss — "fi" rendered as "-" in PDF extraction.
  // Detectable patterns: dash followed by common fi-word suffixes.
  // Examples: "-eld" (field), "-le" (file), "-rst" (first), "-nd" (find),
  // "-nancial" (financial), "-ling" (filing), "-elds" (fields)
  const fiLigaturePattern =
    /\b\w*-(?:eld|elds|le|les|led|ling|lings|rst|nd|nds|nancial|nancially|re|res|red|ring|ner|ners|x|xed|xes|xing|ght|ghts|ghter|gure|gures|nal|nally|nish|nished|rm|rms|rmed|lter|lters|ltered)\b/gi;
  while ((m = fiLigaturePattern.exec(text)) !== null) {
    artifacts.push({ type: "fi_ligature", match: m[0], position: m.index });
  }

  // RC1d: Missing space after sentence-ending punctuation.
  // Common in SCOTUS PDFs: "overruled.We", "speech.See", "seconds.Ibid."
  // Pattern: period/colon/semicolon followed immediately by uppercase letter.
  // Excludes common abbreviations (U.S., e.g., i.e., v.) and legal citations (§).
  const missingSpaceAfterPunct = /[.;:][A-Z][a-z]+/g;
  while ((m = missingSpaceAfterPunct.exec(text)) !== null) {
    // Exclude common patterns: "U.S." followed by capital, legal "v." citations
    const before = text.slice(Math.max(0, m.index - 2), m.index);
    if (/[A-Z]\.$/.test(before)) continue; // e.g. "U.S.Supreme" — the "U." before "S." is fine
    if (before.endsWith("v")) continue; // e.g. "Miranda v.Arizona" — legal case citation style
    artifacts.push({ type: "missing_space_after_punctuation", match: m[0], position: m.index });
  }

  // RC1e: Broken words — space inserted mid-word by OCR.
  // Common in SCOTUS PDFs: "govern mental", "non profit", "ad vertisements",
  // "re sponsible", "ex penditures", "im posed", "ap plied"
  // Pattern: common short prefixes (2-3 chars) followed by space and lowercase continuation.
  // Only flag when the prefix is NOT a standalone word.
  // Exclude "in", "un", "non" — too common as standalone words/prefixes in natural text
  const brokenWordPrefixes = /\b(ad|ap|ex|im|re|dis|ob|com|con|sub|pre|pro|per|mis|over|under|trans)\s([a-z]{4,})\b/g;
  while ((m = brokenWordPrefixes.exec(text)) !== null) {
    // Check that the prefix+suffix forms a plausible single word (no further spaces)
    const combined = m[1] + m[2];
    // Only flag if the combined form is 6+ chars (avoids "in side" → "inside" false positives
    // for legitimate two-word phrases like "in between")
    if (combined.length >= 7) {
      artifacts.push({ type: "broken_word", match: m[0], position: m.index });
    }
  }

  // RC3: Table fragment markers — text that looks like concatenated table cells.
  // Patterns: "y" or "x" as bullet markers joined to words, colon-number suffixes
  // from schedule tables like ":1" or ":2-dose"
  const tableFragmentPattern = /(?:^|\s)y[A-Z][a-z]/g;
  while ((m = tableFragmentPattern.exec(text)) !== null) {
    artifacts.push({ type: "table_fragment", match: m[0].trim(), position: m.index });
  }

  return artifacts;
}

/**
 * Validates an array of CitationData for common quality issues.
 *
 * Errors = likely to cause verification failure (e.g. missing pageNumber).
 * Warnings = may degrade quality (e.g. long anchor_text, extraction artifacts).
 */
export function validateCitationData(citations: CitationData[]): ValidationReport {
  const warnings: CitationWarning[] = [];
  const errors: CitationWarning[] = [];

  for (const cd of citations) {
    const id = cd.id;

    // Error: missing full_phrase
    if (!cd.full_phrase?.trim()) {
      errors.push({ citationId: id, field: "full_phrase", message: "empty or missing — verification will fail" });
    }

    // Error: missing pageNumber (page_id)
    if (!cd.page_id) {
      errors.push({
        citationId: id,
        field: "page_id",
        message: "missing — API rejects the entire attachment batch when pageNumber is absent",
      });
    }

    // Warning: extraction artifacts in full_phrase (RC1 — #1 cause of partial_text_found)
    if (cd.full_phrase) {
      const artifacts = detectExtractionArtifacts(cd.full_phrase);
      if (artifacts.length > 0) {
        const summary = artifacts
          .slice(0, 3)
          .map(a => `${a.type}: "${a.match}"`)
          .join(", ");
        warnings.push({
          citationId: id,
          field: "full_phrase",
          message: `extraction artifact(s) detected [${summary}] — likely to cause partial_text_found`,
        });
      }
    }

    // Warning: missing anchor_text
    const anchor = cd.anchor_text ?? "";
    if (!anchor.trim()) {
      warnings.push({ citationId: id, field: "anchor_text", message: "empty — degrades verification accuracy" });
      continue; // skip further anchor checks
    }

    // Warning: anchor_text long — shorter anchors improve report readability
    if (anchor.length > ANCHOR_CHARS_THRESHOLD) {
      warnings.push({
        citationId: id,
        field: "anchor_text",
        message: `${anchor.length} chars — shorter anchors (under ~40 chars) improve report readability`,
      });
    }

    // Warning: anchor_text has many words — fewer words improve scannability
    const wordCount = anchor.split(/\s+/).length;
    if (wordCount > ANCHOR_WORDS_THRESHOLD) {
      warnings.push({
        citationId: id,
        field: "anchor_text",
        message: `${wordCount} words — fewer words (under ~4) improve report scannability`,
      });
    }

    // Warning: anchor_text not a substring of full_phrase
    if (cd.full_phrase && !cd.full_phrase.includes(anchor)) {
      warnings.push({
        citationId: id,
        field: "anchor_text",
        message: "not a substring of full_phrase — likely paraphrased, will fail API match",
      });
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
