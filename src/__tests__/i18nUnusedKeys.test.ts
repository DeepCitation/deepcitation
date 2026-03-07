/**
 * Detects unused i18n keys in defaultMessages (src/react/i18n.tsx).
 *
 * How it works:
 *  1. Reads all keys from defaultMessages
 *  2. Scans all non-test React source files for literal key usage
 *  3. Handles plural pairs: "foo.bar_one"/"foo.bar_other" → looks for
 *     tPlural(t, "foo.bar", ...) in source (base key without suffix)
 *  4. Compares against KNOWN_UNUSED — keys intentionally kept but not yet wired up
 *
 * The test fails when:
 *  - A NEW unused key is added that isn't in KNOWN_UNUSED
 *  - A KNOWN_UNUSED key is now actually used (stale — remove it)
 *  - A KNOWN_UNUSED key no longer exists in defaultMessages (already deleted — remove it)
 *
 * Run: bun run --cwd packages/deepcitation jest src/__tests__/i18nUnusedKeys.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "@jest/globals";
import { defaultMessages } from "../react/i18n";

// =============================================================================
// KNOWN UNUSED — intentional technical debt, pending cleanup
// =============================================================================
// Keys in defaultMessages that are not currently referenced in React source.
// Remove an entry here once you also remove the key from defaultMessages and
// all locale files (src/react/locales/).
const KNOWN_UNUSED = new Set([
  // Drawer labels — defined for future CitationDrawer / SourcesListComponent usage.
  // Wire up in CitationDrawer.tsx / CitationDrawerTrigger.tsx when those components
  // adopt the i18n system.
  "drawer.document",
  "drawer.unknownSource",
  "drawer.close",
  "drawer.showAnnotation",
  "drawer.hideAnnotation",

  // Citation error / ambiguity — keys are in place for when CitationComponent
  // surfaces error states and ambiguous-match warnings in the popover UI.
  "citation.fallback",
  "ambiguity.found",
  "ambiguity.onExpectedPage",
  "error.citation",
]);

// =============================================================================
// Helpers
// =============================================================================

function collectSourceFiles(dir: string, exclude: string[]): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (exclude.some(ex => entry.name === ex)) continue;
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full, exclude));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

// =============================================================================
// Test
// =============================================================================

describe("i18n unused keys", () => {
  // Scan all react source except i18n.tsx (definitions) and locales/ (translations)
  const reactDir = path.join(__dirname, "../react");
  const sourceFiles = collectSourceFiles(reactDir, ["__tests__", "locales"]).filter(f => !f.endsWith("i18n.tsx"));
  const sourceContent = sourceFiles.map(f => fs.readFileSync(f, "utf-8")).join("\n");

  const allKeys = Object.keys(defaultMessages) as (keyof typeof defaultMessages)[];

  function isUsed(key: string): boolean {
    // Plural pair: "foo.bar_one"/"foo.bar_other" → base key used with tPlural(t, "foo.bar", ...)
    if (key.endsWith("_one") || key.endsWith("_other")) {
      const base = key.replace(/_(one|other)$/, "");
      return sourceContent.includes(`"${base}"`) || sourceContent.includes(`'${base}'`);
    }
    return sourceContent.includes(`"${key}"`) || sourceContent.includes(`'${key}'`);
  }

  it("has no new unused message keys (update KNOWN_UNUSED if intentional)", () => {
    const newlyUnused = allKeys.filter(key => !isUsed(key) && !KNOWN_UNUSED.has(key));

    if (newlyUnused.length > 0) {
      throw new Error(
        `${newlyUnused.length} new unused key(s) in defaultMessages. Either use them or add to KNOWN_UNUSED:\n` +
          newlyUnused.map(k => `  "${k}"`).join("\n"),
      );
    }
  });

  it("has no stale KNOWN_UNUSED entries (remove if now used)", () => {
    const stale = [...KNOWN_UNUSED].filter(key => isUsed(key));

    if (stale.length > 0) {
      throw new Error(
        `${stale.length} KNOWN_UNUSED key(s) are now used — remove them from the allowlist:\n` +
          stale.map(k => `  "${k}"`).join("\n"),
      );
    }
  });

  it("has no KNOWN_UNUSED entries missing from defaultMessages", () => {
    const keySet = new Set(allKeys as string[]);
    const ghost = [...KNOWN_UNUSED].filter(key => !keySet.has(key));

    if (ghost.length > 0) {
      throw new Error(
        `${ghost.length} KNOWN_UNUSED key(s) no longer exist in defaultMessages — remove them from the allowlist:\n` +
          ghost.map(k => `  "${k}"`).join("\n"),
      );
    }
  });
});
