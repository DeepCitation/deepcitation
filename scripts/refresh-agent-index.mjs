#!/usr/bin/env node
/**
 * Agent Documentation Index — Refresh Script (deepcitation package)
 *
 * Regenerates docs/agents/repo-map.md, validates docs/agents/path-router.json,
 * and checks staleness of all review notes in docs/agents/review-notes/.
 *
 * Scoped to the packages/deepcitation git submodule root.
 *
 * Usage:
 *   node scripts/refresh-agent-index.mjs              # regenerate + validate + report
 *   node scripts/refresh-agent-index.mjs --check-only # report only, write nothing
 *   node scripts/refresh-agent-index.mjs --update-router # also update router commit_sha
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check-only");
const UPDATE_ROUTER = args.includes("--update-router");

// ─── Colors (respect NO_COLOR and non-TTY) ──────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const green = (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s);
const red = (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);
const yellow = (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s);
const dim = (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s);

// ─── Directory Descriptions (human-curated, one-liners) ─────────────────────
// Edit this map when adding new directories or significant files.
// Gaps appear as "(no description)" to make them visible.
const DESCRIPTIONS = {
  // Root config
  "CLAUDE.md": "Agent guidelines for this package",
  "AGENTS.md": "Agent guidelines for this package",
  "package.json": "Package manifest and scripts",
  "biome.json": "Linter & formatter config",
  "tsconfig.json": "TypeScript config",
  "tsup.config.ts": "Build config (tsup bundler)",
  "jest.config.cjs": "Jest test runner config",
  "playwright-ct.config.ts": "Playwright component test config",
  "README.md": "Public package README",
  "CHANGELOG.md": "Version history",
  "INTEGRATION.md": "Integration guide",

  // src/ top-level
  "src": "Source files",
  "src/index.ts": "Main package entry — core exports",
  "src/client": "DeepCitation API client",
  "src/parsing": "Citation extraction: parseCitation, normalizeCitation, parseWorkAround",
  "src/prompts": "LLM prompt templates (citationPrompts, promptCompression)",
  "src/react": "React components and hooks (CitationComponent, SourcesList, i18n, popovers)",
  "src/react/hooks": "Extracted React hooks",
  "src/react/locales": "i18n locale JSON files (en, es, fr, ...)",
  "src/react/motion": "Animation/motion utilities",
  "src/react/testing": "React testing helpers",
  "src/markdown": "Markdown rendering (renderMarkdown, markdownVariants)",
  "src/markdown/testing": "Markdown test helpers",
  "src/rendering": "Output renderers: Slack, GitHub, HTML, terminal, proofUrl",
  "src/rendering/github": "GitHub-flavored renderer",
  "src/rendering/html": "HTML renderer",
  "src/rendering/slack": "Slack renderer",
  "src/rendering/terminal": "Terminal/ANSI renderer",
  "src/rendering/testing": "Renderer test helpers",
  "src/types": "Core TypeScript types (citation, verification, boxes, search, timing, diff)",
  "src/utils": "Security utilities: urlSafety, logSafety, objectSafety, regexSafety, sha, fileSafety",
  "src/drawing": "Drawing/canvas utilities",
  "src/__tests__": "Unit test files",

  // tests/
  "tests": "Integration and e2e tests",

  // docs/
  "docs": "Documentation (GitHub Pages site + agent docs)",
  "docs/agents": "Agent-specific documentation and guides",
  "docs/agents/review-notes": "Pre-compressed area summaries for code review",
  "docs/agents/docs-site-map.md": "Auto-generated index of all public docs.deepcitation.com pages",

  // scripts/
  "scripts": "Build, validation, and maintenance scripts",

  // .github/
  ".github/workflows": "CI/CD workflows",
  ".github/workflows/ci.yml": "Lint, type-check, build, and unit tests",
  ".github/workflows/playwright.yml": "Playwright component tests",
  ".github/workflows/publish.yml": "npm publish on release",
  ".github/workflows/docs.yml": "GitHub Pages deploy",
  ".github/workflows/claude-code-review.yml": "Automated PR review via Claude Code",
  ".github/workflows/claude.yml": "Claude Code on issue comments",
  ".github/workflows/codeql.yml": "CodeQL security scanning",

  // examples/
  "examples": "Integration examples (Next.js, etc.)",
  "examples/agui-chat": "AG-UI chat integration example",
  "examples/assets": "Shared example assets",
  "examples/basic-verification": "Basic citation verification example",
  "examples/nextjs-ai-sdk": "Next.js AI SDK integration example",
  "examples/url-example": "URL citation verification example",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGitInfo() {
  const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const shaFull = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  return { sha, shaFull };
}

function getSubdirs(dirPath) {
  if (!existsSync(dirPath)) return [];
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => ![
        "node_modules", "dist", ".turbo", ".git", "coverage",
        "lib", "__mocks__", ".next", ".cache",
      ].includes(n))
      .sort();
  } catch (err) {
    console.log(yellow(`  WARN: could not read ${dirPath}: ${err.message}`));
    return [];
  }
}

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { data: {}, watchPaths: [] };
  const text = match[1];
  const data = {};
  let currentKey = null;
  const watchPaths = [];
  for (const line of text.split("\n")) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      data[currentKey] = kvMatch[2].replace(/^["']|["']$/g, "").trim();
      continue;
    }
    const keyOnly = line.match(/^(\w[\w_]*)\s*:\s*$/);
    if (keyOnly) {
      currentKey = keyOnly[1];
      continue;
    }
    const arrMatch = line.match(/^\s+-\s+"?([^"]*)"?\s*$/);
    if (arrMatch && currentKey === "watch_paths") {
      watchPaths.push(arrMatch[1]);
    }
  }
  return { data, watchPaths };
}

// ─── Section 1: Generate repo-map.md ────────────────────────────────────────
function generateRepoMap(gitInfo) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  let undescribedCount = 0;

  const lines = [];

  function addLine(relPath, indent = 0) {
    const prefix = "  ".repeat(indent);
    const desc = DESCRIPTIONS[relPath];
    const name = relPath.split("/").pop();
    if (!desc) undescribedCount++;
    const suffix = desc ? `  # ${desc}` : "  # (no description)";
    lines.push(`${prefix}${name}/${suffix}`);
  }

  function addFile(relPath, indent = 0) {
    const prefix = "  ".repeat(indent);
    const desc = DESCRIPTIONS[relPath];
    const name = relPath.split("/").pop();
    const suffix = desc ? `  # ${desc}` : "";
    lines.push(`${prefix}${name}${suffix}`);
  }

  // Root config files
  lines.push("Root");
  lines.push("");
  const rootFiles = [
    "CLAUDE.md", "AGENTS.md", "package.json", "biome.json",
    "tsconfig.json", "tsup.config.ts", "jest.config.cjs",
    "playwright-ct.config.ts", "README.md", "CHANGELOG.md", "INTEGRATION.md",
  ];
  for (const f of rootFiles) {
    if (existsSync(join(ROOT, f))) addFile(f, 0);
  }

  // src/ structure
  lines.push("");
  lines.push("Source");
  lines.push("");
  addLine("src", 0);

  const srcDirs = getSubdirs(join(ROOT, "src"));
  for (const dir of srcDirs) {
    const relDir = `src/${dir}`;
    addLine(relDir, 1);

    // One level deeper for key directories
    if (["react", "rendering", "markdown"].includes(dir)) {
      const subDirs = getSubdirs(join(ROOT, "src", dir));
      for (const sub of subDirs) {
        addLine(`src/${dir}/${sub}`, 2);
      }
    }
  }

  // Tests
  lines.push("");
  lines.push("Tests");
  lines.push("");
  if (existsSync(join(ROOT, "tests"))) addLine("tests", 0);

  // Docs
  lines.push("");
  lines.push("Docs");
  lines.push("");
  addLine("docs", 0);
  if (existsSync(join(ROOT, "docs", "agents"))) {
    addLine("docs/agents", 1);
    if (existsSync(join(ROOT, "docs", "agents", "review-notes"))) {
      addLine("docs/agents/review-notes", 2);
    }
  }

  // Scripts
  lines.push("");
  lines.push("Scripts");
  lines.push("");
  addLine("scripts", 0);
  const scriptFiles = readdirSync(join(ROOT, "scripts"))
    .filter((f) => f.endsWith(".mjs") || f.endsWith(".js") || f.endsWith(".sh") || f.endsWith(".ts"))
    .sort();
  for (const f of scriptFiles) {
    addFile(`scripts/${f}`, 1);
  }

  // CI/CD
  lines.push("");
  lines.push("CI/CD");
  lines.push("");
  const workflowDir = join(ROOT, ".github", "workflows");
  if (existsSync(workflowDir)) {
    addLine(".github/workflows", 0);
    const workflows = readdirSync(workflowDir).filter((f) => f.endsWith(".yml")).sort();
    for (const f of workflows) {
      addFile(`.github/workflows/${f}`, 1);
    }
  }

  // Examples
  if (existsSync(join(ROOT, "examples"))) {
    lines.push("");
    lines.push("Examples");
    lines.push("");
    addLine("examples", 0);
    const exampleDirs = getSubdirs(join(ROOT, "examples"));
    for (const dir of exampleDirs) {
      addLine(`examples/${dir}`, 1);
    }
  }

  if (undescribedCount > 0) {
    console.log(yellow(`  WARN: ${undescribedCount} directories have no DESCRIPTIONS entry — showing as "(no description)"`));
  }

  const body = lines.join("\n");
  return `---
generated_at: "${now}"
commit_sha: "${gitInfo.sha}"
commit_sha_full: "${gitInfo.shaFull}"
stale_after_commits: 30
---

# Repo Map

> Auto-generated by \`scripts/refresh-agent-index.mjs\`.
> Run \`/reindex\` or \`node scripts/refresh-agent-index.mjs\` to update.

\`\`\`
${body}
\`\`\`
`;
}

// ─── Section 2: Validate path-router.json ───────────────────────────────────
function validatePathRouter(gitInfo) {
  const routerPath = join(ROOT, "docs", "agents", "path-router.json");
  if (!existsSync(routerPath)) {
    console.log(dim("  path-router.json not found — skipping validation"));
    return { warnings: 0, errors: 0 };
  }

  const router = JSON.parse(readFileSync(routerPath, "utf8"));
  let warnings = 0;
  let errors = 0;

  for (const file of router.always_read || []) {
    if (!existsSync(join(ROOT, file))) {
      console.log(red(`  ERROR: always_read file missing: ${file}`));
      errors++;
    }
  }

  for (const route of router.routes || []) {
    for (const doc of route.docs || []) {
      if (!existsSync(join(ROOT, doc))) {
        console.log(red(`  ERROR: route "${route.id}" references missing doc: ${doc}`));
        errors++;
      }
    }
  }

  // Check for orphaned docs in docs/agents/ not referenced by any route
  const allReferencedDocs = new Set();
  for (const file of router.always_read || []) allReferencedDocs.add(file);
  for (const route of router.routes || []) {
    for (const doc of route.docs || []) allReferencedDocs.add(doc);
  }

  const agentsDir = join(ROOT, "docs", "agents");
  const agentFiles = readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => `docs/agents/${f}`);

  for (const file of agentFiles) {
    if (!allReferencedDocs.has(file)) {
      console.log(yellow(`  WARN: ${file} not referenced by any route`));
      warnings++;
    }
  }

  const notesDir = join(ROOT, "docs", "agents", "review-notes");
  if (existsSync(notesDir)) {
    const noteFiles = readdirSync(notesDir)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .map((f) => `docs/agents/review-notes/${f}`);

    for (const file of noteFiles) {
      if (!allReferencedDocs.has(file)) {
        console.log(yellow(`  WARN: ${file} not referenced by any route`));
        warnings++;
      }
    }
  }

  if (UPDATE_ROUTER && !CHECK_ONLY) {
    router.commit_sha = gitInfo.sha;
    router.generated_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    writeFileSync(routerPath, JSON.stringify(router, null, 2) + "\n");
    console.log(green(`  Updated path-router.json commit_sha to ${gitInfo.sha}`));
  }

  return { warnings, errors };
}

// ─── Section 3: Public docs site inventory & staleness ──────────────────────

/**
 * Scan docs/*.md and docs/**\/*.md (excluding docs/agents/) for Jekyll pages.
 * A page is a Jekyll page if its frontmatter contains a `layout:` field.
 *
 * Staleness is opt-in: add `commit_sha` and `watch_paths` to the page's
 * frontmatter to enable tracking (Jekyll ignores unknown frontmatter keys).
 *
 * Returns sorted list of page objects, writes docs/agents/docs-site-map.md.
 */
function inventoryPublicDocs(gitInfo) {
  const docsDir = join(ROOT, "docs");

  // Collect all .md files under docs/ except docs/agents/
  function collectMdFiles(dir, relBase = "") {
    const files = [];
    if (!existsSync(dir)) return files;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === "agents") continue; // skip agent docs
        if (entry.name.startsWith("_")) continue; // skip Jekyll internals
        files.push(...collectMdFiles(join(dir, entry.name), relPath));
      } else if (entry.name.endsWith(".md") && !entry.name.startsWith("_")) {
        files.push(relPath);
      }
    }
    return files;
  }

  const mdFiles = collectMdFiles(docsDir).sort();
  const pages = [];

  for (const relPath of mdFiles) {
    const fullPath = join(docsDir, relPath);
    const content = readFileSync(fullPath, "utf8");
    const { data, watchPaths } = parseYamlFrontmatter(content);

    // Only include Jekyll pages (must have layout:)
    if (!data.layout) continue;

    const docRef = `docs/${relPath}`;
    const sha = data.commit_sha;
    let status = "NO_TRACKING";
    let commits = 0;
    const threshold = parseInt(data.stale_after_commits || "20", 10);

    if (sha && watchPaths.length > 0) {
      try {
        const output = execFileSync(
          "git", ["log", "--oneline", `${sha}..HEAD`, "--", ...watchPaths],
          { cwd: ROOT, encoding: "utf8" },
        ).trim();
        commits = output ? output.split("\n").length : 0;
        status = commits >= threshold ? "STALE" : "FRESH";
      } catch {
        status = "ERROR";
      }
    }

    pages.push({
      path: docRef,
      title: data.title || relPath,
      navOrder: parseInt(data.nav_order || "99", 10),
      description: data.description || "",
      status,
      commits,
      threshold,
      sha: sha || null,
    });
  }

  // Sort by nav_order then path
  pages.sort((a, b) => a.navOrder - b.navOrder || a.path.localeCompare(b.path));

  return pages;
}

function generateDocsSiteMap(pages, gitInfo) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const tracking = pages.filter((p) => p.status !== "NO_TRACKING");
  const noTracking = pages.filter((p) => p.status === "NO_TRACKING");
  const stale = tracking.filter((p) => p.status === "STALE");

  const lines = [
    `---`,
    `generated_at: "${now}"`,
    `commit_sha: "${gitInfo.sha}"`,
    `page_count: ${pages.length}`,
    `tracked: ${tracking.length}`,
    `stale: ${stale.length}`,
    `---`,
    ``,
    `# Public Docs Site Map`,
    ``,
    `> Auto-generated by \`scripts/refresh-agent-index.mjs\`.`,
    `> Covers all Jekyll pages under \`docs/\` (excluding \`docs/agents/\`).`,
    `> Run \`/reindex\` to update.`,
    ``,
    `## Pages`,
    ``,
  ];

  for (const p of pages) {
    const statusBadge = p.status === "FRESH" ? "FRESH"
      : p.status === "STALE" ? "STALE"
      : p.status === "ERROR" ? "ERROR"
      : "no tracking";
    lines.push(`### ${p.title}`);
    lines.push(`- **File**: \`${p.path}\``);
    if (p.description) lines.push(`- **Description**: ${p.description}`);
    lines.push(`- **Staleness**: ${statusBadge}${p.status !== "NO_TRACKING" ? ` (${p.commits}/${p.threshold} commits since last update)` : ""}`);
    if (!p.sha) {
      lines.push(`- **Tracking**: not set up — add \`commit_sha\` and \`watch_paths\` to frontmatter to enable staleness tracking`);
    }
    lines.push(``);
  }

  if (noTracking.length > 0) {
    lines.push(`## Pages Without Staleness Tracking (${noTracking.length})`);
    lines.push(``);
    lines.push(`Add \`commit_sha: "HEAD_SHA"\` and a \`watch_paths:\` list to these pages' Jekyll frontmatter to enable tracking:`);
    lines.push(``);
    for (const p of noTracking) {
      lines.push(`- \`${p.path}\` — ${p.title}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

// ─── Section 4: Agent review note staleness ─────────────────────────────────
function checkReviewNoteStaleness() {
  const notesDir = join(ROOT, "docs", "agents", "review-notes");
  if (!existsSync(notesDir)) {
    console.log(dim("  review-notes/ not found — skipping staleness check"));
    return [];
  }

  const notes = readdirSync(notesDir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort();

  const results = [];

  for (const file of notes) {
    const content = readFileSync(join(notesDir, file), "utf8");
    const { data, watchPaths } = parseYamlFrontmatter(content);

    const sha = data.commit_sha;
    const threshold = parseInt(data.stale_after_commits || "20", 10);

    if (!sha || watchPaths.length === 0) {
      results.push({ file, status: "UNKNOWN", commits: 0, threshold, reason: "missing frontmatter" });
      continue;
    }

    try {
      const output = execFileSync(
        "git", ["log", "--oneline", `${sha}..HEAD`, "--", ...watchPaths],
        { cwd: ROOT, encoding: "utf8" },
      ).trim();
      const commits = output ? output.split("\n").length : 0;
      const status = commits >= threshold ? "STALE" : "FRESH";
      results.push({ file, status, commits, threshold });
    } catch {
      results.push({ file, status: "ERROR", commits: 0, threshold, reason: "git log failed" });
    }
  }

  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  console.log(bold("\nAgent Documentation Index — Refresh (deepcitation)\n"));

  const gitInfo = getGitInfo();

  // Section 1: Generate repo-map.md
  console.log(bold("1. Repo Map"));
  const repoMapContent = generateRepoMap(gitInfo);
  const repoMapPath = join(ROOT, "docs", "agents", "repo-map.md");

  if (CHECK_ONLY) {
    console.log(dim("  (check-only mode — not writing repo-map.md)"));
  } else {
    writeFileSync(repoMapPath, repoMapContent);
    const lineCount = repoMapContent.split("\n").length;
    console.log(green(`  repo-map.md updated (${lineCount} lines, SHA ${gitInfo.sha})`));
  }

  // Section 2: Validate path-router.json
  console.log(bold("\n2. Path Router Validation"));
  const { warnings, errors } = validatePathRouter(gitInfo);
  if (errors === 0 && warnings === 0) {
    console.log(green("  All routes valid, no orphaned docs"));
  } else {
    console.log(`  ${errors} errors, ${warnings} warnings`);
  }

  // Section 3: Public docs site inventory
  console.log(bold("\n3. Public Docs (docs.deepcitation.com)"));
  const docPages = inventoryPublicDocs(gitInfo);
  const siteMapPath = join(ROOT, "docs", "agents", "docs-site-map.md");

  if (docPages.length === 0) {
    console.log(dim("  No Jekyll pages found under docs/"));
  } else {
    const tracked = docPages.filter((p) => p.status !== "NO_TRACKING");
    const noTracking = docPages.filter((p) => p.status === "NO_TRACKING");
    const stalePages = tracked.filter((p) => p.status === "STALE");

    const maxTitleLen = Math.max(...docPages.map((p) => p.title.length));
    for (const p of docPages) {
      const title = p.title.padEnd(maxTitleLen);
      if (p.status === "NO_TRACKING") {
        console.log(dim(`  ${title}  no tracking  ${p.path}`));
      } else if (p.status === "FRESH") {
        console.log(green(`  ${title}  FRESH  (${p.commits}/${p.threshold} commits)  ${p.path}`));
      } else if (p.status === "STALE") {
        console.log(red(`  ${title}  STALE  (${p.commits}/${p.threshold} commits) — needs refresh  ${p.path}`));
      } else {
        console.log(yellow(`  ${title}  ${p.status}  ${p.path}`));
      }
    }

    if (noTracking.length > 0) {
      console.log(yellow(`\n  WARN: ${noTracking.length} pages have no staleness tracking (add commit_sha + watch_paths to frontmatter)`));
    }

    if (CHECK_ONLY) {
      console.log(dim("  (check-only mode — not writing docs-site-map.md)"));
    } else {
      const siteMapContent = generateDocsSiteMap(docPages, gitInfo);
      writeFileSync(siteMapPath, siteMapContent);
      console.log(green(`\n  docs-site-map.md updated (${docPages.length} pages, ${tracked.length} tracked, ${stalePages.length} stale)`));
    }
  }

  // Section 4: Review note staleness
  console.log(bold("\n4. Review Note Staleness"));
  const results = checkReviewNoteStaleness();

  if (results.length === 0) {
    console.log(dim("  No review notes found"));
  } else {
    const maxNameLen = Math.max(...results.map((r) => r.file.length));
    for (const r of results) {
      const name = r.file.padEnd(maxNameLen);
      if (r.status === "FRESH") {
        console.log(green(`  ${name}  FRESH  (${r.commits}/${r.threshold} commits)`));
      } else if (r.status === "STALE") {
        console.log(red(`  ${name}  STALE  (${r.commits}/${r.threshold} commits) — needs refresh`));
      } else {
        console.log(yellow(`  ${name}  ${r.status}  (${r.reason})`));
      }
    }
  }

  // Summary
  const staleCount = results.filter((r) => r.status === "STALE").length;
  const staleDocsCount = docPages.filter((p) => p.status === "STALE").length;
  const untrackedDocsCount = docPages.filter((p) => p.status === "NO_TRACKING").length;
  console.log(bold("\n-- Summary --"));
  if (!CHECK_ONLY) console.log(`  repo-map.md: ${green("updated")}`);
  console.log(`  path-router.json: ${errors > 0 ? red(`${errors} errors`) : green("valid")}`);
  console.log(`  public docs: ${staleDocsCount > 0 ? red(`${staleDocsCount} stale`) : green("all fresh")} (${untrackedDocsCount} untracked)`);
  if (!CHECK_ONLY) console.log(`  docs-site-map.md: ${green("updated")}`);
  console.log(`  review notes: ${staleCount > 0 ? red(`${staleCount} stale`) : green("all fresh")}`);
  console.log("");

  if (CHECK_ONLY && (staleCount > 0 || errors > 0)) {
    process.exit(1);
  }
  if (errors > 0) {
    process.exit(1);
  }
}

main();
