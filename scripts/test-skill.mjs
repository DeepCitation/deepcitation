#!/usr/bin/env node

/**
 * Quick validation script for docs/skill.md
 * Run with: node scripts/test-skill.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillPath = join(__dirname, "../docs/skill.md");
// Normalize line endings to LF for consistent regex matching
const skillContent = readFileSync(skillPath, "utf-8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function expect(value) {
  return {
    toContain(str) {
      if (!value.includes(str)) {
        throw new Error(`Expected to contain "${str}"`);
      }
    },
    toMatch(regex) {
      if (!regex.test(value)) {
        throw new Error(`Expected to match ${regex}`);
      }
    },
    not: {
      toMatch(regex) {
        if (regex.test(value)) {
          throw new Error(`Expected NOT to match ${regex}`);
        }
      },
    },
    toBeNull() {
      if (value !== null) {
        throw new Error(`Expected null but got ${value}`);
      }
    },
    not: {
      toBeNull() {
        if (value === null) {
          throw new Error(`Expected not null`);
        }
      },
    },
    toBeGreaterThan(n) {
      if (!(value > n)) {
        throw new Error(`Expected ${value} > ${n}`);
      }
    },
  };
}

console.log("\n=== YAML Frontmatter ===\n");

test("has valid YAML frontmatter with required fields", () => {
  const frontmatterMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) throw new Error("No frontmatter found");
  const frontmatter = frontmatterMatch[1];
  expect(frontmatter).toContain("name: deepcitation");
  expect(frontmatter).toContain("version:");
  expect(frontmatter).toContain("description:");
  expect(frontmatter).toContain("homepage: https://deepcitation.com");
});

test("has metadata section with api_base", () => {
  const frontmatterMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch[1];
  expect(frontmatter).toContain("api_base:");
  expect(frontmatter).toContain("https://api.deepcitation.com");
});

console.log("\n=== Required Sections ===\n");

const requiredSections = [
  "When to Use",
  "What You Need",
  "Step 0: Confirm Sources",
  "Step 1: Upload Sources",
  "Step 2: Extract & Map Claims",
  "Step 3: Verify Claims",
  "Step 4: Report Results",
  "Verification Statuses",
  "Privacy Note",
  "Security",
  "Quick Reference",
];

requiredSections.forEach((section) => {
  test(`contains "${section}" section`, () => {
    expect(skillContent).toContain(`## ${section}`);
  });
});

console.log("\n=== API Documentation ===\n");

test("documents /prepareFile endpoint", () => {
  expect(skillContent).toContain("/prepareFile");
  expect(skillContent).toContain("POST");
});

test("documents /verifyCitations endpoint", () => {
  expect(skillContent).toContain("/verifyCitations");
});

test("includes authorization header format", () => {
  expect(skillContent).toContain("Authorization: Bearer");
});

test("documents DEEPCITATION_API_KEY environment variable", () => {
  expect(skillContent).toContain("DEEPCITATION_API_KEY");
});

console.log("\n=== JSON Examples ===\n");

test("has valid JSON blocks", () => {
  const jsonBlocks = skillContent.match(/```json\n([\s\S]*?)```/g) || [];
  if (jsonBlocks.length === 0) throw new Error("No JSON blocks found");

  jsonBlocks.forEach((block, index) => {
    const jsonContent = block.replace(/```json\n/, "").replace(/```$/, "");
    try {
      JSON.parse(jsonContent);
    } catch (e) {
      throw new Error(
        `Invalid JSON in block ${index + 1}: ${e.message}\n${jsonContent.slice(0, 100)}...`
      );
    }
  });
  console.log(`  (validated ${jsonBlocks.length} JSON blocks)`);
});

test("uses descriptive citation keys (not numeric)", () => {
  expect(skillContent).toContain('"patient-dob"');
  expect(skillContent).toContain('"diagnosis"');
});

test("includes required citation fields in examples", () => {
  expect(skillContent).toContain('"fullPhrase"');
  expect(skillContent).toContain('"anchorText"');
  expect(skillContent).toContain('"attachmentId"');
});

console.log("\n=== Branding ===\n");

test("includes branding note about deepcite vs DeepCitation", () => {
  expect(skillContent).toContain("Branding Note");
  expect(skillContent).toContain("deep citations");
  expect(skillContent).toContain("DeepCitation");
});

console.log("\n=== Verification Statuses ===\n");

const expectedStatuses = [
  "found",
  "partial_text_found",
  "found_anchor_text_only",
  "found_on_other_page",
  "found_on_other_line",
  "not_found",
];

expectedStatuses.forEach((status) => {
  test(`documents "${status}" status`, () => {
    expect(skillContent).toContain(`\`${status}\``);
  });
});

test("maps statuses to user-friendly labels", () => {
  expect(skillContent).toContain("✓ Verified");
  expect(skillContent).toContain("⚠ Partially verified");
  expect(skillContent).toContain("✗ Not verified");
});

console.log("\n=== Confidence Levels ===\n");

test("documents high confidence scenario", () => {
  expect(skillContent).toContain("High Confidence");
});

test("documents medium confidence scenario", () => {
  expect(skillContent).toContain("Medium Confidence");
});

test("documents low confidence scenario", () => {
  expect(skillContent).toContain("Low Confidence");
});

console.log("\n=== Think Out Loud ===\n");

test("emphasizes thinking out loud", () => {
  expect(skillContent.toLowerCase()).toContain("think out loud");
});

test("shows example of claim-to-source reasoning", () => {
  expect(skillContent).toContain("CLAIM");
  expect(skillContent).toContain("Reasoning:");
});

console.log("\n=== Output Format Detection ===\n");

test("documents structured JSON format", () => {
  expect(skillContent).toContain("deepcitation-result");
});

test("documents text fallback format", () => {
  expect(skillContent).toContain("Text Fallback");
  expect(skillContent).toContain("DEEP CITATION REPORT");
});

test("documents format detection signals", () => {
  expect(skillContent).toContain("DEEPCITATION_RENDER");
});

console.log("\n=== Security ===\n");

test("warns about API key security", () => {
  expect(skillContent).toContain("CRITICAL");
  expect(skillContent).toContain("Only send API key to");
});

console.log("\n=== Links ===\n");

test("links to open-source prompts", () => {
  expect(skillContent).toContain("github.com/DeepCitation/deepcitation-js");
});

test("links to dashboard for API key", () => {
  expect(skillContent).toContain("deepcitation.com/usage");
});

console.log("\n" + "=".repeat(50));
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
