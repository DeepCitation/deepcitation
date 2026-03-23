#!/usr/bin/env node
/**
 * Docs Audit Inventory — Deterministic checks for documentation drift
 *
 * Runs 7 checks against the docs/ directory and outputs JSON to stdout.
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
 *   6. Interface field drift (doc vs source interface shapes)
 *   7. Missing CSS setup (docs mentioning React components without stylesheet import)
 *   8. Broken relative markdown links (../path or ./path escaping docs/ or missing)
 *   9. Prose API name drift (backtick-wrapped function names not matching exports)
 *  10. Anchor/fragment validation (#heading links pointing to non-existent headings)
 *  11. Example directory references (links to examples/ dirs that don't exist)
 *  12. Stale text format (old [Page N]/[LN] syntax instead of <page_number_N_index_I>/<line id="N"> tags)
 */

import {
  readdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, normalize } from "node:path";
import { collectDocsFiles, parseYamlFrontmatter, loadDocsContents, getHeadingSlugs, nonFencedLines } from "./lib/docs-utils.mjs";

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

function getJekyllSlugs(docContents) {
  const slugs = new Set();
  for (const [relPath, content] of docContents) {
    if (relPath.startsWith("agents/")) continue; // agent docs aren't public pages
    const { data: fm } = parseYamlFrontmatter(content);
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

/** Module content cache for getExportsFromModule — avoids re-reading the same file. */
const moduleContentCache = new Map();

function getExportsFromModule(modulePath) {
  if (moduleContentCache.has(modulePath)) {
    return moduleContentCache.get(modulePath);
  }

  let content;
  try {
    content = readFileSync(modulePath, "utf8");
  } catch {
    moduleContentCache.set(modulePath, null);
    return null;
  }

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

  const result = { exports, content };
  moduleContentCache.set(modulePath, result);
  return result;
}

// ─── Check 1: Broken Internal Links ────────────────────────────────────────

function checkBrokenLinks(docContents) {
  const findings = [];
  const validSlugs = getJekyllSlugs(docContents);

  // Match {{ site.baseurl }}/slug/ patterns
  const linkPattern = /\{\{\s*site\.baseurl\s*\}\}\/([a-z0-9_-]+(?:\/[a-z0-9_-]+)*)\//gi;

  for (const [relPath, content] of docContents) {
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

function checkRemovedDeps(docContents) {
  const findings = [];

  // Build search terms from removed deps (package name + short name)
  const searchTerms = [];
  for (const dep of KNOWN_REMOVED_DEPS) {
    searchTerms.push({ termLower: dep.toLowerCase(), term: dep, package: dep });
    // Also search for the unscoped short name (e.g. "radix" from "@radix-ui/react-popover")
    const shortMatch = dep.match(/@([^/]+)\//);
    if (shortMatch) {
      const shortName = shortMatch[1].replace(/-ui$/, ""); // "radix-ui" → "radix"
      searchTerms.push({ termLower: shortName.toLowerCase(), term: shortName, package: dep });
    }
  }

  // Deduplicate short names
  const seen = new Set();
  const uniqueTerms = searchTerms.filter((t) => {
    if (seen.has(t.term)) return false;
    seen.add(t.term);
    return true;
  });

  for (const [relPath, content] of docContents) {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      for (const { termLower, term, package: pkg } of uniqueTerms) {
        if (lower.includes(termLower)) {
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

function checkSourceFileRefs(docContents) {
  const findings = [];

  // Match src/... paths (backtick-wrapped or bare) - common patterns in docs
  const srcPattern = /`(src\/[a-zA-Z0-9_./-]+(?:\.[a-z]+)?)`/g;

  for (const [relPath, content] of docContents) {
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

function checkCodeBlockImports(docContents) {
  const findings = [];

  // Match fenced code blocks
  const codeBlockPattern = /```(?:tsx?|jsx?|javascript|typescript)\n([\s\S]*?)```/g;
  // Match import statements
  const importPattern = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;

  for (const [relPath, content] of docContents) {
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

        const moduleResult = getExportsFromModule(resolvedPath);
        if (!moduleResult) continue;

        for (const sym of symbols) {
          // Handle `type X` imports
          const cleanSym = sym.replace(/^type\s+/, "");
          if (!moduleResult.exports.has(cleanSym)) {
            // Check re-exports by searching for the symbol in the file content
            if (!moduleResult.content.includes(cleanSym)) {
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

function checkInterfaceFieldDrift(docContents) {
  const findings = [];

  // Cache source interfaces per file
  const sourceCache = new Map();
  function getSourceInterfaces(srcRelPath) {
    if (sourceCache.has(srcRelPath)) return sourceCache.get(srcRelPath);
    const fullPath = join(ROOT, srcRelPath);
    let content;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch {
      sourceCache.set(srcRelPath, null);
      return null;
    }
    const parsed = parseInterfaces(content);
    sourceCache.set(srcRelPath, parsed);
    return parsed;
  }

  const codeBlockPattern = /```(?:tsx?|jsx?|javascript|typescript)\n([\s\S]*?)```/g;

  for (const [relPath, content] of docContents) {
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

// ─── Check 7: Missing CSS Setup ─────────────────────────────────────────────
// Docs that import from `deepcitation/react` should also mention the CSS import
// (either `deepcitation/tailwind.css` or `deepcitation/styles.css`).

function checkMissingCssSetup(docContents) {
  const findings = [];
  const CSS_MENTION_RE = /deepcitation\/(tailwind|styles)\.css/;
  const REACT_IMPORT_RE = /deepcitation\/react/;

  for (const [relPath, content] of docContents) {
    if (relPath.startsWith("agents/")) continue; // internal docs, not user-facing
    if (!REACT_IMPORT_RE.test(content)) continue;
    if (CSS_MENTION_RE.test(content)) continue;
    // Find the first line mentioning the React import for context
    const lines = content.split("\n");
    const lineNum = lines.findIndex((l) => REACT_IMPORT_RE.test(l)) + 1;
    findings.push({
      file: `docs/${relPath}`,
      line: lineNum,
      message: `Imports from "deepcitation/react" but never mentions CSS setup (deepcitation/tailwind.css or deepcitation/styles.css)`,
    });
  }

  return findings;
}

// ─── Check 8: Broken Relative Markdown Links ────────────────────────────────
// Catches ../path and ./path links that escape docs/ or target non-existent files.

function checkBrokenRelativeLinks(docContents) {
  const findings = [];
  const docsDir = join(ROOT, "docs");
  // Match [text](../path) or [text](./path), with optional #fragment
  // Both branches exclude ), #, and whitespace (including newlines) for consistency
  const linkPattern = /\]\((\.\.\/[^)#\s]+|\.\/[^)#\s]+)(#[^)]+)?\)/g;

  for (const [relPath, content] of docContents) {
    const lines = content.split("\n");

    for (const { line, lineNum } of nonFencedLines(lines)) {
      for (const match of line.matchAll(linkPattern)) {
        const linkPath = match[1];
        // Resolve relative to the doc file's directory within docs/
        const docDir = join(docsDir, dirname(relPath));
        const resolved = normalize(resolve(docDir, linkPath));
        const relToDocsDir = relative(docsDir, resolved);

        if (relToDocsDir.startsWith("..")) {
          findings.push({
            file: `docs/${relPath}`,
            line: lineNum,
            linkPath,
            issue: "escapes_docs_boundary",
            text: line.trim(),
          });
        } else if (!existsSync(resolved)) {
          findings.push({
            file: `docs/${relPath}`,
            line: lineNum,
            linkPath,
            issue: "target_not_found",
            text: line.trim(),
          });
        }
      }
    }
  }

  return findings;
}

// ─── Check 9: Prose API Name Drift ──────────────────────────────────────────
// Backtick-wrapped function names in prose that don't match actual exports.

const PROSE_API_ALLOWLIST = new Set([
  // Standard JS/DOM
  "fetch", "addEventListener", "removeEventListener", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame",
  "querySelector", "querySelectorAll", "getElementById", "createElement",
  "preventDefault", "stopPropagation", "dispatchEvent",
  "parse", "stringify", "keys", "values", "entries", "assign", "freeze",
  "includes", "filter", "map", "reduce", "find", "forEach", "some", "every",
  "push", "pop", "shift", "slice", "splice", "concat", "join", "sort",
  "replace", "match", "matchAll", "split", "trim", "startsWith", "endsWith",
  "resolve", "reject", "then", "catch", "finally", "all", "allSettled", "race",
  "log", "warn", "error", "info", "debug", "dir", "table",
  "exec", "test", "compile",
  // React
  "useState", "useEffect", "useLayoutEffect", "useRef", "useCallback", "useMemo",
  "useContext", "useReducer", "useId", "useSyncExternalStore", "useTransition",
  "createContext", "createRef", "forwardRef", "memo", "lazy", "Suspense",
  // Third-party (common in framework guides)
  "streamText", "useChat", "useCompletion", "generateText",
  "embedMany", "embed", "similaritySearch",
  "createOpenAI", "createAnthropic",
  "toDataStreamResponse", "toAIStreamResponse",
  "pipe", "invoke",
  // DeepCitation client instance methods (not standalone exports)
  "verify", "verifyAttachment", "prepareAttachments", "prepareUrl",
  "uploadFile", "convertToPdf", "prepareConvertedFile",
  "extendExpiration", "getAttachment", "deleteAttachment",
  // Common object methods referenced in docs
  "chunk", "upsert", "query",
]);

function checkProseApiDrift(docContents) {
  const findings = [];

  // Build export set from package entry points
  const exportSets = [
    getExportsFromModule(join(ROOT, "src", "index.ts")),
    getExportsFromModule(join(ROOT, "src", "react", "index.ts")),
    getExportsFromModule(join(ROOT, "src", "react", "index.tsx")),
  ].filter(Boolean);

  const allExports = new Set();
  for (const mod of exportSets) {
    for (const name of mod.exports) allExports.add(name);
  }

  // Match `functionName()` in prose (not in code blocks)
  const apiRefPattern = /`(\w+)\(\)`/g;

  for (const [relPath, content] of docContents) {
    if (relPath.startsWith("agents/")) continue;
    const lines = content.split("\n");

    for (const { line, lineNum } of nonFencedLines(lines)) {
      for (const match of line.matchAll(apiRefPattern)) {
        const funcName = match[1];
        if (PROSE_API_ALLOWLIST.has(funcName)) continue;
        if (allExports.has(funcName)) continue;
        // Also check if it's a known class name (PascalCase) — skip those
        if (/^[A-Z]/.test(funcName)) continue;

        findings.push({
          file: `docs/${relPath}`,
          line: lineNum,
          functionName: funcName,
          text: line.trim(),
        });
      }
    }
  }

  return findings;
}

// ─── Check 10: Anchor/Fragment Validation ───────────────────────────────────
// Checks that #fragment links point to real headings on the target page.

function checkAnchorFragments(docContents) {
  const findings = [];
  const docsDir = join(ROOT, "docs");

  // Cache heading slugs per doc page
  const slugCache = new Map();
  function getSlugs(relPath) {
    if (slugCache.has(relPath)) return slugCache.get(relPath);
    const content = docContents.get(relPath);
    if (!content) { slugCache.set(relPath, null); return null; }
    const slugs = getHeadingSlugs(content);
    slugCache.set(relPath, slugs);
    return slugs;
  }

  // Build slug→relPath map for Jekyll links
  const slugToFile = new Map();
  for (const [relPath, content] of docContents) {
    if (relPath.startsWith("agents/")) continue;
    const { data: fm } = parseYamlFrontmatter(content);
    if (!fm.layout) continue;
    let slug;
    if (fm.permalink) {
      slug = fm.permalink.replace(/^\/|\/$/g, "");
    } else {
      slug = relPath.replace(/\.md$/, "").replace(/\/index$/, "");
    }
    slugToFile.set(slug, relPath);
  }

  // Pattern 1: {{ site.baseurl }}/slug/#fragment
  const jekyllFragPattern = /\{\{\s*site\.baseurl\s*\}\}\/([a-z0-9_-]+(?:\/[a-z0-9_-]+)*)\/(?:#([a-z0-9][a-z0-9_-]*))/gi;
  // Pattern 2: same-page ](#fragment)
  const samePagePattern = /\]\(#([a-z0-9][a-z0-9_-]*)\)/gi;
  // Pattern 3: relative link with fragment: ](./file.md#fragment) or ](../file.md#fragment)
  const relativeFragPattern = /\]\((\.\.\/[^)#\n]+|\.\/[^)#\s]+)#([a-z0-9][a-z0-9_-]*)\)/gi;

  for (const [relPath, content] of docContents) {
    const lines = content.split("\n");

    for (const { line, lineNum } of nonFencedLines(lines)) {
      // Jekyll fragment links
      for (const match of line.matchAll(jekyllFragPattern)) {
        const slug = match[1];
        const fragment = match[2];
        const targetFile = slugToFile.get(slug);
        if (!targetFile) continue; // broken slug is caught by Check 1
        const slugs = getSlugs(targetFile);
        if (slugs && !slugs.has(fragment)) {
          findings.push({
            file: `docs/${relPath}`,
            line: lineNum,
            fragment,
            targetPage: `docs/${targetFile}`,
            issue: "fragment_not_found",
            text: line.trim(),
          });
        }
      }

      // Same-page fragment links
      for (const match of line.matchAll(samePagePattern)) {
        const fragment = match[1];
        const slugs = getSlugs(relPath);
        if (slugs && !slugs.has(fragment)) {
          findings.push({
            file: `docs/${relPath}`,
            line: lineNum,
            fragment,
            targetPage: `docs/${relPath}`,
            issue: "fragment_not_found",
            text: line.trim(),
          });
        }
      }

      // Relative link with fragment
      for (const match of line.matchAll(relativeFragPattern)) {
        const linkPath = match[1];
        const fragment = match[2];
        const docDirPath = join(docsDir, dirname(relPath));
        const resolved = normalize(resolve(docDirPath, linkPath));
        const relToDocsDir = relative(docsDir, resolved);
        if (relToDocsDir.startsWith("..")) continue; // caught by Check 8
        // Try to find the content
        const slugs = getSlugs(relToDocsDir);
        if (slugs && !slugs.has(fragment)) {
          findings.push({
            file: `docs/${relPath}`,
            line: lineNum,
            fragment,
            targetPage: `docs/${relToDocsDir}`,
            issue: "fragment_not_found",
            text: line.trim(),
          });
        }
      }
    }
  }

  return findings;
}

// ─── Check 11: Example Directory References ─────────────────────────────────
// Catches docs linking to example directories that don't exist in examples/.

function checkExampleDirRefs(docContents) {
  const findings = [];
  const examplesDir = join(ROOT, "examples");
  // Match examples/dirname in any context (GitHub URLs, prose, etc.)
  const examplePattern = /examples\/([a-z][a-z0-9_-]+)/g;

  for (const [relPath, content] of docContents) {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      for (const match of lines[i].matchAll(examplePattern)) {
        const dirName = match[1];
        const dirPath = join(examplesDir, dirName);
        if (!existsSync(dirPath)) {
          findings.push({
            file: `docs/${relPath}`,
            line: i + 1,
            exampleDir: dirName,
            issue: "directory_not_found",
            text: lines[i].trim(),
          });
        } else if (!existsSync(join(dirPath, "package.json")) && !existsSync(join(dirPath, "index.html")) && !existsSync(join(dirPath, "README.md"))) {
          findings.push({
            file: `docs/${relPath}`,
            line: i + 1,
            exampleDir: dirName,
            issue: "not_a_project",
            text: lines[i].trim(),
          });
        }
      }
    }
  }

  return findings;
}

// ─── Check 12: Stale Text Format ─────────────────────────────────────────────
// The deepTextPromptPortion format uses XML-style tags:
//   <page_number_N_index_I> for pages, <line id="N"> for lines.
// Old bracket format ([Page N], [LN]) is stale and misleading.

function checkStaleTextFormat(docContents) {
  const findings = [];
  // Old bracket-based page markers: [Page 1], [Page 2], etc.
  const oldPagePattern = /\[Page\s+\d+\]/g;
  // Old bracket-based line markers: [L1], [L2], etc.
  const oldLinePattern = /\[L\d+\]/g;

  for (const [relPath, content] of docContents) {
    if (relPath.startsWith("agents/")) continue;
    const lines = content.split("\n");

    for (const { line, lineNum } of nonFencedLines(lines)) {
      const pageMatches = [...line.matchAll(oldPagePattern)];
      const lineMatches = [...line.matchAll(oldLinePattern)];

      if (pageMatches.length > 0 || lineMatches.length > 0) {
        const staleTokens = [
          ...pageMatches.map((m) => m[0]),
          ...lineMatches.map((m) => m[0]),
        ];
        findings.push({
          file: `docs/${relPath}`,
          line: lineNum,
          staleTokens,
          message: `Uses old bracket format (${staleTokens.join(", ")}); should use <page_number_N_index_I> and <line id="N"> XML tags`,
          text: line.trim(),
        });
      }
    }
  }

  return findings;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  // Single-pass: collect and read all docs files once
  const docsDir = join(ROOT, "docs");
  const mdFiles = collectDocsFiles(docsDir);
  const docContents = loadDocsContents(docsDir, mdFiles);

  const results = {
    generated_at: new Date().toISOString(),
    checks: {
      broken_links: checkBrokenLinks(docContents),
      removed_dep_mentions: checkRemovedDeps(docContents),
      missing_source_files: checkSourceFileRefs(docContents),
      agent_doc_staleness: checkAgentDocStaleness(),
      code_block_imports: checkCodeBlockImports(docContents),
      interface_field_drift: checkInterfaceFieldDrift(docContents),
      missing_css_setup: checkMissingCssSetup(docContents),
      broken_relative_links: checkBrokenRelativeLinks(docContents),
      prose_api_drift: checkProseApiDrift(docContents),
      anchor_fragment_validation: checkAnchorFragments(docContents),
      example_dir_references: checkExampleDirRefs(docContents),
      stale_text_format: checkStaleTextFormat(docContents),
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
