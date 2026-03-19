#!/usr/bin/env node
/**
 * Docs Audit Inventory — Deterministic checks for documentation drift
 *
 * Runs 5 checks against the docs/ directory and outputs JSON to stdout.
 * Designed to be consumed by the `/docs-audit` Claude command for semantic evaluation.
 *
 * Usage:
 *   node scripts/docs-audit-inventory.mjs
 *
 * Checks:
 *   1. Broken internal links (Jekyll `{{ site.baseurl }}/slug/` patterns)
 *   2. Removed dependency mentions (packages once used, now gone)
 *   3. Referenced source file existence (`src/...` paths in docs)
 *   4. Agent doc staleness (commits to watched source files since doc last modified)
 *   5. Code block import validation (verify exported symbols in fenced code blocks)
 */

import {
  readdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ─── Known Removed Dependencies ─────────────────────────────────────────────
// Packages that were once in package.json but have been removed.
// Mentions of these in docs are likely stale.
const KNOWN_REMOVED_DEPS = [
  "@radix-ui/react-popover",
  "@radix-ui/react-portal",
  "@radix-ui/react-slot",
  "@radix-ui/react-presence",
  "@floating-ui/react-dom",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectDocsFiles(dir, relBase = "") {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_") || entry.name === "node_modules") continue;
      files.push(...collectDocsFiles(join(dir, entry.name), relPath));
    } else if (entry.name.endsWith(".md")) {
      files.push(relPath);
    }
  }
  return files;
}

function parseJekyllFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w_-]*)\s*:\s*(.+)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return data;
}

function getJekyllSlugs() {
  const docsDir = join(ROOT, "docs");
  const slugs = new Set();
  const mdFiles = collectDocsFiles(docsDir);
  for (const relPath of mdFiles) {
    if (relPath.startsWith("agents/")) continue; // agent docs aren't public pages
    const content = readFileSync(join(docsDir, relPath), "utf8");
    const fm = parseJekyllFrontmatter(content);
    if (!fm.layout) continue; // not a Jekyll page
    // Derive slug from permalink or filename
    if (fm.permalink) {
      slugs.add(fm.permalink.replace(/^\/|\/$/g, ""));
    } else {
      const slug = relPath.replace(/\.md$/, "").replace(/\/index$/, "");
      slugs.add(slug);
    }
  }
  // index page
  slugs.add("");
  return slugs;
}

function getLastModifiedDate(filePath) {
  try {
    const output = execFileSync(
      "git", ["log", "-1", "--format=%aI", "--", filePath],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    return output || null;
  } catch {
    return null;
  }
}


function getExportsFromModule(modulePath) {
  if (!existsSync(modulePath)) return null;
  const content = readFileSync(modulePath, "utf8");
  const exports = new Set();

  // Match: export { Foo, Bar }
  for (const m of content.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const name of m[1].split(",")) {
      const cleaned = name.replace(/\s+as\s+\w+/, "").trim();
      if (cleaned) exports.add(cleaned);
    }
  }
  // Match: export const/function/class/type/interface Foo
  for (const m of content.matchAll(/export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/g)) {
    exports.add(m[1]);
  }
  // Match: export default
  if (content.match(/export\s+default\s/)) {
    exports.add("default");
  }

  return exports;
}

// ─── Check 1: Broken Internal Links ────────────────────────────────────────

function checkBrokenLinks() {
  const findings = [];
  const validSlugs = getJekyllSlugs();
  const docsDir = join(ROOT, "docs");
  const mdFiles = collectDocsFiles(docsDir);

  // Match {{ site.baseurl }}/slug/ patterns
  const linkPattern = /\{\{\s*site\.baseurl\s*\}\}\/([a-z0-9_-]+(?:\/[a-z0-9_-]+)*)\//gi;

  for (const relPath of mdFiles) {
    const fullPath = join(docsDir, relPath);
    const content = readFileSync(fullPath, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      for (const match of lines[i].matchAll(linkPattern)) {
        const slug = match[1];
        if (!validSlugs.has(slug)) {
          findings.push({
            file: `docs/${relPath}`,
            line: i + 1,
            slug,
            text: lines[i].trim(),
          });
        }
      }
    }
  }

  return findings;
}

// ─── Check 2: Removed Dependency Mentions ──────────────────────────────────

function checkRemovedDeps() {
  const findings = [];
  const docsDir = join(ROOT, "docs");
  const mdFiles = collectDocsFiles(docsDir);

  // Build search terms from removed deps (package name + short name)
  const searchTerms = [];
  for (const dep of KNOWN_REMOVED_DEPS) {
    searchTerms.push({ term: dep, package: dep });
    // Also search for the unscoped short name (e.g. "radix" from "@radix-ui/react-popover")
    const shortMatch = dep.match(/@([^/]+)\//);
    if (shortMatch) {
      const shortName = shortMatch[1].replace(/-ui$/, ""); // "radix-ui" → "radix"
      searchTerms.push({ term: shortName, package: dep });
    }
  }

  // Deduplicate short names
  const seen = new Set();
  const uniqueTerms = searchTerms.filter((t) => {
    if (seen.has(t.term)) return false;
    seen.add(t.term);
    return true;
  });

  for (const relPath of mdFiles) {
    const fullPath = join(docsDir, relPath);
    const content = readFileSync(fullPath, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      for (const { term, package: pkg } of uniqueTerms) {
        if (lower.includes(term.toLowerCase())) {
          findings.push({
            file: `docs/${relPath}`,
            line: i + 1,
            term,
            package: pkg,
            text: lines[i].trim(),
          });
        }
      }
    }
  }

  return findings;
}

// ─── Check 3: Referenced Source File Existence ─────────────────────────────

function checkSourceFileRefs() {
  const findings = [];
  const docsDir = join(ROOT, "docs");
  const mdFiles = collectDocsFiles(docsDir);

  // Match src/... paths (backtick-wrapped or bare) - common patterns in docs
  const srcPattern = /`(src\/[a-zA-Z0-9_./-]+(?:\.[a-z]+)?)`/g;

  for (const relPath of mdFiles) {
    const fullPath = join(docsDir, relPath);
    const content = readFileSync(fullPath, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      for (const match of lines[i].matchAll(srcPattern)) {
        const srcPath = match[1];
        // Only check paths with file extensions (skip directory references)
        if (!srcPath.match(/\.\w+$/)) continue;
        if (!existsSync(join(ROOT, srcPath))) {
          findings.push({
            file: `docs/${relPath}`,
            line: i + 1,
            referencedPath: srcPath,
            text: lines[i].trim(),
          });
        }
      }
    }
  }

  return findings;
}

// ─── Check 4: Agent Doc Staleness ──────────────────────────────────────────

function checkAgentDocStaleness() {
  const findings = [];
  const agentsDir = join(ROOT, "docs", "agents");
  if (!existsSync(agentsDir)) return findings;

  const agentFiles = readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort();

  for (const file of agentFiles) {
    const fullPath = join(agentsDir, file);
    const content = readFileSync(fullPath, "utf8");

    // Extract src/ paths referenced in the doc
    const srcRefs = new Set();
    for (const match of content.matchAll(/`(src\/[a-zA-Z0-9_./-]+(?:\.\w+)?)`/g)) {
      srcRefs.add(match[1]);
    }

    if (srcRefs.size === 0) continue;

    // Get the doc's last modification date
    const lastModified = getLastModifiedDate(`docs/agents/${file}`);
    if (!lastModified) continue;

    // Count commits to referenced source files since doc was last modified
    const srcPaths = [...srcRefs].filter((p) => existsSync(join(ROOT, p)));
    if (srcPaths.length === 0) continue;

    try {
      const output = execFileSync(
        "git", ["log", "--oneline", `--since=${lastModified}`, "--", ...srcPaths],
        { cwd: ROOT, encoding: "utf8" },
      ).trim();
      const commits = output ? output.split("\n").length : 0;

      if (commits > 0) {
        findings.push({
          file: `docs/agents/${file}`,
          lastModified,
          referencedSrcFiles: srcPaths,
          commitsSinceDocUpdate: commits,
        });
      }
    } catch {
      // skip on git error
    }
  }

  return findings;
}

// ─── Check 5: Code Block Import Validation ─────────────────────────────────

function checkCodeBlockImports() {
  const findings = [];
  const docsDir = join(ROOT, "docs");
  const mdFiles = collectDocsFiles(docsDir);

  // Match fenced code blocks
  const codeBlockPattern = /```(?:tsx?|jsx?|javascript|typescript)\n([\s\S]*?)```/g;
  // Match import statements
  const importPattern = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;

  for (const relPath of mdFiles) {
    const fullPath = join(docsDir, relPath);
    const content = readFileSync(fullPath, "utf8");

    for (const blockMatch of content.matchAll(codeBlockPattern)) {
      const codeBlock = blockMatch[1];
      const blockStart = content.substring(0, blockMatch.index).split("\n").length;

      for (const impMatch of codeBlock.matchAll(importPattern)) {
        const symbols = impMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
        const modulePath = impMatch[2];

        // Only check internal imports (deepcitation or relative)
        if (!modulePath.startsWith("deepcitation") && !modulePath.startsWith(".")) continue;

        // Resolve module to a file
        let resolvedPath = null;
        if (modulePath.startsWith("deepcitation")) {
          // Map package subpath to source
          const subpath = modulePath.replace(/^deepcitation\/?/, "");
          if (!subpath || subpath === "") {
            resolvedPath = join(ROOT, "src", "index.ts");
          } else {
            resolvedPath = join(ROOT, "src", subpath, "index.ts");
            if (!existsSync(resolvedPath)) {
              resolvedPath = join(ROOT, "src", `${subpath}.ts`);
            }
            if (!existsSync(resolvedPath)) {
              resolvedPath = join(ROOT, "src", `${subpath}.tsx`);
            }
          }
        }

        if (!resolvedPath || !existsSync(resolvedPath)) continue;

        const exports = getExportsFromModule(resolvedPath);
        if (!exports) continue;

        for (const sym of symbols) {
          // Handle `type X` imports
          const cleanSym = sym.replace(/^type\s+/, "");
          if (!exports.has(cleanSym)) {
            // Check re-exports by searching for the symbol in the file content
            const fileContent = readFileSync(resolvedPath, "utf8");
            if (!fileContent.includes(cleanSym)) {
              const lineInBlock = codeBlock.substring(0, impMatch.index).split("\n").length;
              findings.push({
                file: `docs/${relPath}`,
                line: blockStart + lineInBlock - 1,
                symbol: cleanSym,
                module: modulePath,
                resolvedFile: resolvedPath.replace(ROOT + "/", ""),
              });
            }
          }
        }
      }
    }
  }

  return findings;
}

// ─── Check 6: Interface Field Drift ─────────────────────────────────────────
// Compares interface/type declarations in doc code blocks against the actual
// source TypeScript files. Catches phantom fields (exist in docs, removed from
// source) and missing fields (added to source, missing from docs).

/** Extract field names from a TypeScript interface body string (top-level only). */
function extractInterfaceFields(body) {
  const fields = new Set();
  let depth = 0;
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    // Skip comments, empty lines
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
    // At top level (depth 0), try to extract a field name BEFORE updating depth.
    // This handles `fieldName?: { nested: type }` where braces open on the same line.
    if (depth === 0) {
      const fieldMatch = trimmed.match(/^(\w+)\??\s*:/);
      if (fieldMatch) {
        fields.add(fieldMatch[1]);
      }
    }
    // Update brace depth for subsequent lines
    for (const ch of trimmed) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
  }
  return fields;
}

/** Parse all `interface Foo { ... }` blocks from a string. */
function parseInterfaces(content) {
  const interfaces = new Map();
  // Match interface declarations (handles extends)
  const pattern = /interface\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const name = match[1];
    const startBrace = match.index + match[0].length;
    // Find matching closing brace (handle nesting)
    let depth = 1;
    let i = startBrace;
    while (i < content.length && depth > 0) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") depth--;
      i++;
    }
    const body = content.substring(startBrace, i - 1);
    interfaces.set(name, extractInterfaceFields(body));
  }
  return interfaces;
}

/**
 * Map of interface names to their canonical source file paths.
 * Only interfaces we want to track for drift are listed here.
 */
const TRACKED_INTERFACES = {
  Verification: "src/types/verification.ts",
  SearchAttempt: "src/types/search.ts",
  EvidenceImage: "src/types/verification.ts",
  PageImage: "src/types/verification.ts",
  DocumentVerificationResult: "src/types/verification.ts",
  UrlVerificationResult: "src/types/verification.ts",
  DownloadLink: "src/types/verification.ts",
  FileDownload: "src/types/verification.ts",
  DocumentCitation: "src/types/citation.ts",
  UrlCitation: "src/types/citation.ts",
  AudioVideoCitation: "src/types/citation.ts",
  CitationBase: "src/types/citation.ts",
  VerifyCitationRequest: "src/types/citation.ts",
  VerifyCitationResponse: "src/types/citation.ts",
  CitationStatus: "src/types/citation.ts",
};

function checkInterfaceFieldDrift() {
  const findings = [];
  const docsDir = join(ROOT, "docs");
  const mdFiles = collectDocsFiles(docsDir);

  // Cache source interfaces per file
  const sourceCache = new Map();
  function getSourceInterfaces(srcRelPath) {
    if (sourceCache.has(srcRelPath)) return sourceCache.get(srcRelPath);
    const fullPath = join(ROOT, srcRelPath);
    if (!existsSync(fullPath)) {
      sourceCache.set(srcRelPath, null);
      return null;
    }
    const content = readFileSync(fullPath, "utf8");
    const parsed = parseInterfaces(content);
    sourceCache.set(srcRelPath, parsed);
    return parsed;
  }

  const codeBlockPattern = /```(?:tsx?|jsx?|javascript|typescript)\n([\s\S]*?)```/g;

  for (const relPath of mdFiles) {
    const fullPath = join(docsDir, relPath);
    const content = readFileSync(fullPath, "utf8");
    const lines = content.split("\n");

    for (const blockMatch of content.matchAll(codeBlockPattern)) {
      const codeBlock = blockMatch[1];
      const blockStartLine = content.substring(0, blockMatch.index).split("\n").length;

      // Parse interfaces from this code block
      const docInterfaces = parseInterfaces(codeBlock);

      for (const [ifaceName, docFields] of docInterfaces) {
        const srcFile = TRACKED_INTERFACES[ifaceName];
        if (!srcFile) continue; // not tracked

        const sourceInterfaces = getSourceInterfaces(srcFile);
        if (!sourceInterfaces) {
          findings.push({
            file: `docs/${relPath}`,
            line: blockStartLine,
            interface: ifaceName,
            sourceFile: srcFile,
            issue: "source_file_missing",
            details: `Source file ${srcFile} not found`,
          });
          continue;
        }

        const sourceFields = sourceInterfaces.get(ifaceName);
        if (!sourceFields) {
          findings.push({
            file: `docs/${relPath}`,
            line: blockStartLine,
            interface: ifaceName,
            sourceFile: srcFile,
            issue: "interface_not_found_in_source",
            details: `Interface ${ifaceName} not found in ${srcFile}`,
          });
          continue;
        }

        // Fields in docs but not in source (phantom fields)
        const phantomFields = [...docFields].filter((f) => !sourceFields.has(f));
        // Fields in source but not in docs (missing coverage)
        const missingFields = [...sourceFields].filter((f) => !docFields.has(f));

        if (phantomFields.length > 0) {
          findings.push({
            file: `docs/${relPath}`,
            line: blockStartLine,
            interface: ifaceName,
            sourceFile: srcFile,
            issue: "phantom_fields",
            fields: phantomFields,
            details: `Doc has fields not in source: ${phantomFields.join(", ")}`,
          });
        }

        if (missingFields.length > 0) {
          findings.push({
            file: `docs/${relPath}`,
            line: blockStartLine,
            interface: ifaceName,
            sourceFile: srcFile,
            issue: "missing_fields",
            fields: missingFields,
            details: `Source has fields not in doc: ${missingFields.join(", ")}`,
          });
        }
      }
    }
  }

  return findings;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const results = {
    generated_at: new Date().toISOString(),
    checks: {
      broken_links: checkBrokenLinks(),
      removed_dep_mentions: checkRemovedDeps(),
      missing_source_files: checkSourceFileRefs(),
      agent_doc_staleness: checkAgentDocStaleness(),
      code_block_imports: checkCodeBlockImports(),
      interface_field_drift: checkInterfaceFieldDrift(),
    },
  };

  // Summary counts for quick overview
  results.summary = {};
  for (const [key, arr] of Object.entries(results.checks)) {
    results.summary[key] = arr.length;
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
