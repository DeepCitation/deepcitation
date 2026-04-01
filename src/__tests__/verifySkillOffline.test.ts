/**
 * Phase 0 — Offline Structural Validation for /verify Skill Output
 *
 * Validates that citation markdown files produced by the /verify skill
 * conform to all structural rules WITHOUT calling the DeepCitation API.
 * This catches the #1 failure mode (anchor text quality) before burning API calls.
 *
 * Usage:
 *   DRAFT_FILE=.deepcitation/draft-1234.md bun test verifySkillOffline
 *   DRAFT_DIR=.deepcitation bun test verifySkillOffline
 *   PREPARE_DIR=.deepcitation bun test verifySkillOffline  (enables verbatim checks)
 *
 * Without DRAFT_FILE or DRAFT_DIR, runs against built-in fixture to verify
 * the validator itself works correctly.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";

import { parseCitationData } from "../parsing/citationParser.js";
import type { CitationData } from "../prompts/citationPrompts.js";

// ── Configuration ─────────────────────────────────────────────────

const DRAFT_FILE = process.env.DRAFT_FILE;
const DRAFT_DIR = process.env.DRAFT_DIR;
const PREPARE_DIR = process.env.PREPARE_DIR;

// ── Helpers ───────────────────────────────────────────────────────

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

function validateCitationStructure(citations: CitationData[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check sequential IDs
  const ids = citations.map(c => c.id).sort((a, b) => a - b);
  const expected = Array.from({ length: ids.length }, (_, i) => i + 1);
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    errors.push(`IDs not sequential from 1: got [${ids.join(",")}], expected [${expected.join(",")}]`);
  }

  for (const c of citations) {
    const prefix = `[${c.id}]`;

    // Required fields
    if (!c.attachment_id) errors.push(`${prefix} missing attachment_id`);
    if (!c.full_phrase) errors.push(`${prefix} missing full_phrase`);
    if (!c.anchor_text) errors.push(`${prefix} missing anchor_text`);
    if (!c.page_id) errors.push(`${prefix} missing page_id`);
    if (!c.line_ids || c.line_ids.length === 0) errors.push(`${prefix} missing or empty line_ids`);
    if (!c.reasoning) warnings.push(`${prefix} missing reasoning`);

    // page_id format
    if (c.page_id && !/^page_number_\d+_index_\d+$/.test(c.page_id)) {
      errors.push(`${prefix} page_id "${c.page_id}" doesn't match page_number_N_index_I format`);
    }

    // line_ids type check
    if (c.line_ids) {
      for (const lid of c.line_ids) {
        if (typeof lid !== "number" || lid < 0) {
          errors.push(`${prefix} invalid line_id: ${lid}`);
        }
      }
    }

    // Anchor text quality checks
    if (c.anchor_text) {
      if (c.anchor_text.length > 40) {
        errors.push(`${prefix} anchor_text too long (${c.anchor_text.length} chars, max 40): "${c.anchor_text}"`);
      }
      const wordCount = c.anchor_text.trim().split(/\s+/).length;
      if (wordCount > 4) {
        errors.push(`${prefix} anchor_text too many words (${wordCount}, max 4): "${c.anchor_text}"`);
      }
      if (c.anchor_text.endsWith("...")) {
        errors.push(`${prefix} anchor_text ends with ellipsis: "${c.anchor_text}"`);
      }
    }

    // Verbatim substring check
    if (c.anchor_text && c.full_phrase) {
      if (!c.full_phrase.includes(c.anchor_text)) {
        errors.push(
          `${prefix} anchor_text not a verbatim substring of full_phrase: ` +
            `anchor="${c.anchor_text}" full="${c.full_phrase.slice(0, 80)}${c.full_phrase.length > 80 ? "…" : ""}"`,
        );
      }
    }

    // Full phrase quality
    if (c.full_phrase) {
      if (c.full_phrase.includes("\n")) {
        errors.push(`${prefix} full_phrase contains newline`);
      }
      if (c.full_phrase.length < 10) {
        warnings.push(`${prefix} full_phrase suspiciously short (${c.full_phrase.length} chars)`);
      }
      if (c.full_phrase.length > 500) {
        warnings.push(`${prefix} full_phrase very long (${c.full_phrase.length} chars)`);
      }
      if (/<[a-z_]/i.test(c.full_phrase)) {
        errors.push(`${prefix} full_phrase contains XML/HTML tag remnants: "${c.full_phrase.slice(0, 80)}"`);
      }
      if (/ATTACHMENT_ID|verbatim quote|FULL_PHRASE/i.test(c.full_phrase)) {
        errors.push(`${prefix} full_phrase contains placeholder text`);
      }
    }

    // Anchor text specificity (soft check)
    if (c.anchor_text && !/[\d$%@#§]|[A-Z][a-z]/.test(c.anchor_text)) {
      warnings.push(`${prefix} anchor_text may lack specificity (no numbers/proper nouns): "${c.anchor_text}"`);
    }
  }

  return { errors, warnings };
}

function validateMarkdownAlignment(markdown: string, citations: CitationData[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract [N] markers from the markdown (before CITATION_DATA block)
  const beforeBlock = markdown.split("<<<CITATION_DATA>>>")[0] ?? markdown;
  const markerMatches = beforeBlock.match(/\[(\d+)\]/g) ?? [];
  const markersInText = new Set(markerMatches.map(m => Number(m.slice(1, -1))));
  const citationIds = new Set(citations.map(c => c.id));

  // Orphan markers (in text but not in data)
  for (const m of markersInText) {
    if (!citationIds.has(m)) {
      errors.push(`Marker [${m}] appears in text but has no citation data entry`);
    }
  }

  // Orphan data (in data but not in text)
  for (const id of citationIds) {
    if (!markersInText.has(id)) {
      errors.push(`Citation data entry [${id}] has no matching [${id}] marker in text`);
    }
  }

  // Check delimiters
  if (!markdown.includes("<<<CITATION_DATA>>>")) {
    errors.push("Missing <<<CITATION_DATA>>> start delimiter");
  }
  if (!markdown.includes("<<<END_CITATION_DATA>>>")) {
    errors.push("Missing <<<END_CITATION_DATA>>> end delimiter");
  }

  return { errors, warnings };
}

function validateVerbatimAgainstPrepare(
  citations: CitationData[],
  prepareOutputs: Map<string, string>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const c of citations) {
    if (!c.attachment_id || !c.full_phrase) continue;
    const deepText = prepareOutputs.get(c.attachment_id);
    if (!deepText) {
      warnings.push(`[${c.id}] No prepare output found for attachment_id "${c.attachment_id}"`);
      continue;
    }

    if (!deepText.includes(c.full_phrase)) {
      errors.push(
        `[${c.id}] full_phrase NOT found verbatim in source deepTextPromptPortion: ` +
          `"${c.full_phrase.slice(0, 60)}${c.full_phrase.length > 60 ? "…" : ""}"`,
      );
    }

    if (c.anchor_text && !deepText.includes(c.anchor_text)) {
      errors.push(`[${c.id}] anchor_text NOT found verbatim in source deepTextPromptPortion: "${c.anchor_text}"`);
    }

    // Check page_id tag exists
    if (c.page_id) {
      const pageTag = `<${c.page_id}>`;
      if (!deepText.includes(pageTag)) {
        errors.push(`[${c.id}] page_id tag <${c.page_id}> not found in source`);
      }
    }
  }

  return { errors, warnings };
}

// ── Load prepare outputs if available ─────────────────────────────

function loadPrepareOutputs(dir: string): Map<string, string> {
  const outputs = new Map<string, string>();
  if (!existsSync(dir)) return outputs;

  for (const file of readdirSync(dir)) {
    if (!file.startsWith("prepare-") || !file.endsWith(".json")) continue;
    try {
      const data = JSON.parse(readFileSync(resolve(dir, file), "utf-8"));
      if (data.attachmentId && data.deepTextPromptPortion) {
        outputs.set(data.attachmentId, data.deepTextPromptPortion);
      }
    } catch {
      // skip malformed files
    }
  }
  return outputs;
}

// ── Test fixtures ─────────────────────────────────────────────────

const VALID_FIXTURE = `# Test Report

Revenue grew 45% year-over-year to $2.3B [1]. Operating margin improved to 28.5% [2].

<<<CITATION_DATA>>>
[
  {"n":1,"a":"att-123","r":"Revenue figure","f":"Revenue grew 45% year-over-year to $2.3B","k":"$2.3B","p":"page_number_2_index_1","l":[20]},
  {"n":2,"a":"att-123","r":"Margin figure","f":"Operating margin improved to 28.5%","k":"28.5%","p":"page_number_3_index_2","l":[35]}
]
<<<END_CITATION_DATA>>>`;

const BAD_ANCHOR_FIXTURE = `# Test Report

Some claim here [1].

<<<CITATION_DATA>>>
[
  {"n":1,"a":"att-123","r":"reason","f":"Some claim about this very important thing","k":"Some claim about this very important thing","p":"page_number_1_index_0","l":[1]}
]
<<<END_CITATION_DATA>>>`;

const MISSING_FIELDS_FIXTURE = `# Test Report

Claim [1]. Another [2].

<<<CITATION_DATA>>>
[
  {"n":1,"r":"reason","f":"Some claim","k":"claim","l":[1]},
  {"n":2,"a":"att-123","f":"Another claim","k":"claim","p":"page_number_1_index_0"}
]
<<<END_CITATION_DATA>>>`;

const ORPHAN_MARKER_FIXTURE = `# Test Report

Claim [1]. Missing [3].

<<<CITATION_DATA>>>
[
  {"n":1,"a":"att-123","r":"reason","f":"Some claim text","k":"claim","p":"page_number_1_index_0","l":[1]},
  {"n":2,"a":"att-123","r":"reason","f":"Orphan data entry","k":"Orphan","p":"page_number_1_index_0","l":[2]}
]
<<<END_CITATION_DATA>>>`;

// ── Tests ─────────────────────────────────────────────────────────

describe("Phase 0: citation structure validation", () => {
  it("valid fixture passes all checks", () => {
    const parsed = parseCitationData(VALID_FIXTURE);
    expect(parsed.success).toBe(true);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors).toEqual([]);
  });

  it("detects anchor_text too long", () => {
    const parsed = parseCitationData(BAD_ANCHOR_FIXTURE);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors.some(e => e.includes("too long") || e.includes("too many words"))).toBe(true);
  });

  it("detects missing attachment_id", () => {
    const parsed = parseCitationData(MISSING_FIELDS_FIXTURE);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors.some(e => e.includes("missing attachment_id"))).toBe(true);
  });

  it("detects missing page_id", () => {
    const parsed = parseCitationData(MISSING_FIELDS_FIXTURE);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors.some(e => e.includes("missing page_id"))).toBe(true);
  });

  it("detects missing line_ids", () => {
    const parsed = parseCitationData(MISSING_FIELDS_FIXTURE);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors.some(e => e.includes("missing or empty line_ids"))).toBe(true);
  });

  it("detects non-substring anchor_text", () => {
    const md = `Test [1].
<<<CITATION_DATA>>>
[{"n":1,"a":"att","r":"r","f":"The actual source text here","k":"paraphrased","p":"page_number_1_index_0","l":[1]}]
<<<END_CITATION_DATA>>>`;
    const parsed = parseCitationData(md);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors.some(e => e.includes("not a verbatim substring"))).toBe(true);
  });

  it("detects full_phrase with newline", () => {
    const md = `Test [1].
<<<CITATION_DATA>>>
[{"n":1,"a":"att","r":"r","f":"Line one\\nLine two","k":"Line","p":"page_number_1_index_0","l":[1]}]
<<<END_CITATION_DATA>>>`;
    const parsed = parseCitationData(md);
    const result = validateCitationStructure(parsed.citations);
    // Note: JSON parser converts \\n to \n so this test catches the newline
    expect(result.errors.some(e => e.includes("newline"))).toBe(true);
  });

  it("detects tag remnants in full_phrase", () => {
    const md = `Test [1].
<<<CITATION_DATA>>>
[{"n":1,"a":"att","r":"r","f":"<line id=\\"5\\">Some text</line>","k":"text","p":"page_number_1_index_0","l":[1]}]
<<<END_CITATION_DATA>>>`;
    const parsed = parseCitationData(md);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors.some(e => e.includes("tag remnants"))).toBe(true);
  });

  it("detects anchor_text ending with ellipsis", () => {
    const md = `Test [1].
<<<CITATION_DATA>>>
[{"n":1,"a":"att","r":"r","f":"Revenue grew 45% year-over-year to $2.3B in total","k":"Revenue grew 45%...","p":"page_number_1_index_0","l":[1]}]
<<<END_CITATION_DATA>>>`;
    const parsed = parseCitationData(md);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors.some(e => e.includes("ellipsis"))).toBe(true);
  });

  it("detects invalid page_id format", () => {
    const md = `Test [1].
<<<CITATION_DATA>>>
[{"n":1,"a":"att","r":"r","f":"Some text here","k":"text","p":"page_2","l":[1]}]
<<<END_CITATION_DATA>>>`;
    const parsed = parseCitationData(md);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors.some(e => e.includes("doesn't match page_number_N_index_I"))).toBe(true);
  });

  it("detects non-sequential IDs", () => {
    const md = `Test [1] and [3].
<<<CITATION_DATA>>>
[
  {"n":1,"a":"att","r":"r","f":"First claim here","k":"First","p":"page_number_1_index_0","l":[1]},
  {"n":3,"a":"att","r":"r","f":"Third claim here","k":"Third","p":"page_number_1_index_0","l":[3]}
]
<<<END_CITATION_DATA>>>`;
    const parsed = parseCitationData(md);
    const result = validateCitationStructure(parsed.citations);
    expect(result.errors.some(e => e.includes("not sequential"))).toBe(true);
  });
});

describe("Phase 0: markdown alignment validation", () => {
  it("valid fixture has no alignment errors", () => {
    const result = validateMarkdownAlignment(VALID_FIXTURE, parseCitationData(VALID_FIXTURE).citations);
    expect(result.errors).toEqual([]);
  });

  it("detects orphan markers (in text but not in data)", () => {
    const result = validateMarkdownAlignment(ORPHAN_MARKER_FIXTURE, parseCitationData(ORPHAN_MARKER_FIXTURE).citations);
    expect(result.errors.some(e => e.includes("[3]") && e.includes("no citation data"))).toBe(true);
  });

  it("detects orphan data (in data but not in text)", () => {
    const result = validateMarkdownAlignment(ORPHAN_MARKER_FIXTURE, parseCitationData(ORPHAN_MARKER_FIXTURE).citations);
    expect(result.errors.some(e => e.includes("[2]") && e.includes("no matching"))).toBe(true);
  });

  it("detects missing delimiters", () => {
    const noDelimiter = "# Just text\n\nNo citation data here.";
    const result = validateMarkdownAlignment(noDelimiter, []);
    expect(result.errors.some(e => e.includes("Missing <<<CITATION_DATA>>>"))).toBe(true);
  });
});

// ── Dynamic tests against real draft files ────────────────────────

if (DRAFT_FILE || DRAFT_DIR) {
  const files: string[] = [];

  if (DRAFT_FILE) {
    files.push(resolve(DRAFT_FILE));
  } else if (DRAFT_DIR) {
    const dir = resolve(DRAFT_DIR);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.startsWith("draft-") && f.endsWith(".md")) {
          files.push(resolve(dir, f));
        }
      }
    }
  }

  const prepareOutputs = PREPARE_DIR ? loadPrepareOutputs(resolve(PREPARE_DIR)) : new Map<string, string>();

  for (const file of files) {
    describe(`Draft: ${file.split("/").pop()}`, () => {
      const raw = readFileSync(file, "utf-8");
      const parsed = parseCitationData(raw);

      it("parses successfully", () => {
        expect(parsed.success).toBe(true);
        expect(parsed.citations.length).toBeGreaterThan(0);
      });

      it("passes citation structure checks", () => {
        const result = validateCitationStructure(parsed.citations);
        if (result.warnings.length > 0) {
          console.warn(`Warnings for ${file}:\n  ${result.warnings.join("\n  ")}`);
        }
        expect(result.errors).toEqual([]);
      });

      it("passes markdown alignment checks", () => {
        const result = validateMarkdownAlignment(raw, parsed.citations);
        expect(result.errors).toEqual([]);
      });

      if (prepareOutputs.size > 0) {
        it("passes verbatim checks against prepare output", () => {
          const result = validateVerbatimAgainstPrepare(parsed.citations, prepareOutputs);
          if (result.warnings.length > 0) {
            console.warn(`Warnings for ${file}:\n  ${result.warnings.join("\n  ")}`);
          }
          expect(result.errors).toEqual([]);
        });
      }
    });
  }
}
