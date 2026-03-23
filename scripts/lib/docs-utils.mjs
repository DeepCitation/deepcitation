/**
 * Shared helpers for scripts that process docs/ markdown files.
 * Used by both refresh-agent-index.mjs and docs-audit-inventory.mjs.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Recursively collect .md files under `dir`.
 * @param {string} dir — absolute path to walk
 * @param {{ exclude?: string[] }} opts — directory names to skip (e.g. ["agents"])
 * @param {string} relBase — internal recursion state
 * @returns {string[]} relative paths from `dir`
 */
export function collectDocsFiles(dir, opts = {}, relBase = "") {
  const exclude = opts.exclude ?? [];
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_") || entry.name === "node_modules") continue;
      if (exclude.includes(entry.name)) continue;
      files.push(...collectDocsFiles(join(dir, entry.name), opts, relPath));
    } else if (entry.name.endsWith(".md") && !entry.name.startsWith("_")) {
      files.push(relPath);
    }
  }
  return files;
}

/**
 * Parse YAML-ish frontmatter from a markdown file.
 * Returns `{ data, watchPaths }` where data is a flat key→value map
 * and watchPaths is an array of `watch_paths:` entries (if any).
 */
export function parseYamlFrontmatter(content) {
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

/**
 * Extract heading slugs from markdown content (Kramdown-compatible).
 * Handles ATX headings (`## Foo Bar`) and custom IDs (`{#custom-id}`).
 * @param {string} content — markdown file content
 * @returns {Set<string>} — set of heading slug strings
 */
export function getHeadingSlugs(content) {
  const slugs = new Set();
  let inFence = false;
  for (const line of content.split("\n")) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (!headingMatch) continue;
    let text = headingMatch[1].trim();
    // Check for Kramdown custom ID: {#custom-id}
    const customId = text.match(/\{#([^}]+)\}\s*$/);
    if (customId) {
      slugs.add(customId[1]);
      continue;
    }
    // Strip inline code, bold, italic, links
    text = text.replace(/`[^`]*`/g, (m) => m.slice(1, -1)); // keep text inside backticks
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // [text](url) → text
    text = text.replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1"); // bold/italic → text
    // Kramdown slugification: lowercase, strip non-word except hyphens/spaces, collapse
    const slug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (slug) slugs.add(slug);
  }
  return slugs;
}

/**
 * Yield non-fenced lines from markdown content.
 * Skips lines inside backtick or tilde code fences.
 * @param {string[]} lines
 * @yields {{ line: string, lineNum: number }}
 */
export function* nonFencedLines(lines) {
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(`{3,}|~{3,})/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    yield { line: lines[i], lineNum: i + 1 };
  }
}

/**
 * Load all docs files into a Map<relPath, content> for single-pass I/O.
 */
export function loadDocsContents(docsDir, mdFiles) {
  const contents = new Map();
  for (const relPath of mdFiles) {
    contents.set(relPath, readFileSync(join(docsDir, relPath), "utf8"));
  }
  return contents;
}
